/*
 * Deterministic calculators. The AI never does critical math itself; it links here (spec §6).
 * Pure functions, no DOM. Works in the browser (window.DREI_CALC) and in Node (module.exports) for tests.
 */
(function (root) {
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const num = (v, d = 0) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, "")); return isFinite(n) ? n : d; };

  /** Monthly principal & interest factor per $1 borrowed. */
  function pmtFactor(ratePct, years) {
    const r = num(ratePct) / 100 / 12, n = Math.round(num(years, 30) * 12);
    if (n <= 0) return 0;
    if (r === 0) return 1 / n;
    return (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }
  const payment = (principal, ratePct, years) => Math.max(0, principal) * pmtFactor(ratePct, years);

  /** Full monthly housing cost for a given price. */
  function monthlyCost({ price, downPayment, ratePct, years = 30, taxRatePct, insuranceAnnual, hoaMonthly = 0, pmiRatePct = 0.5 }) {
    const loan = Math.max(0, price - downPayment);
    const ltv = price > 0 ? loan / price : 0;
    const pi = payment(loan, ratePct, years);
    const tax = (price * num(taxRatePct)) / 100 / 12;
    const ins = num(insuranceAnnual) / 12;
    const pmi = ltv > 0.8 ? (loan * num(pmiRatePct)) / 100 / 12 : 0;
    const hoa = num(hoaMonthly);
    return { price, loan, ltv, pi, tax, ins, pmi, hoa, total: pi + tax + ins + pmi + hoa };
  }

  /** Max price where total housing cost fits a payment budget. Solves P algebraically, handling PMI. */
  function priceForPayment(maxPayment, { downPayment, ratePct, years = 30, taxRatePct, insuranceAnnual, hoaMonthly = 0, pmiRatePct = 0.5 }) {
    const f = pmtFactor(ratePct, years), t = num(taxRatePct) / 100 / 12, I = num(insuranceAnnual) / 12, H = num(hoaMonthly), D = num(downPayment), m = num(pmiRatePct) / 100 / 12;
    const avail = maxPayment - I - H;
    if (avail <= 0) return 0;
    let P = (avail + D * f) / (f + t);
    if (P > 0 && (P - D) / P > 0.8) {
      P = (avail + D * (f + m)) / (f + m + t);
      // Edge: adding PMI dropped LTV to <= 80% — then the no-PMI cap is the binding answer at exactly 80% LTV.
      if ((P - D) / P <= 0.8) P = D / 0.2;
    }
    return Math.max(D, P);
  }

  /**
   * Affordability scenarios using common debt-to-income guidelines.
   * Conservative: 28% front-end / 36% back-end. Stretch: 31% / 43%. These are planning guides, not lender approvals.
   */
  function affordability(input) {
    const income = num(input.monthlyIncome), debts = num(input.monthlyDebts);
    const scenarios = [
      { key: "conservative", label: "Comfortable", front: 28, back: 36 },
      { key: "stretch", label: "Stretch", front: 31, back: 43 },
    ].map((s) => {
      const maxPayment = Math.max(0, Math.min((income * s.front) / 100, (income * s.back) / 100 - debts));
      const price = priceForPayment(maxPayment, input);
      const cost = monthlyCost({ ...input, price });
      return { ...s, maxPayment, price, cost };
    });
    let target = null;
    if (num(input.targetPrice) > 0) {
      const cost = monthlyCost({ ...input, price: num(input.targetPrice) });
      target = { price: num(input.targetPrice), cost, frontDTI: income ? (cost.total / income) * 100 : null, backDTI: income ? ((cost.total + debts) / income) * 100 : null };
    }
    return { scenarios, target };
  }

  /** Days from Jan 1 through closing (inclusive of closing day as seller's day — title companies vary). */
  function dayOfYear(dateStr) {
    const d = dateStr ? new Date(dateStr + "T12:00:00") : new Date();
    if (isNaN(d)) return 0;
    const start = new Date(d.getFullYear(), 0, 1, 12);
    return Math.round((d - start) / 86400000) + 1;
  }
  function daysInYear(dateStr) { const y = (dateStr ? new Date(dateStr + "T12:00:00") : new Date()).getFullYear(); return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365; }

  /** Seller net proceeds. Texas convention: seller credits buyer for current-year taxes Jan 1 → closing (taxes paid in arrears). */
  function sellerProceeds(input) {
    const price = num(input.price);
    const listing = (price * num(input.listingPct)) / 100;
    const buyerSide = (price * num(input.buyerPct)) / 100;
    const title = (price * num(input.titlePct, 0.55)) / 100;
    const other = num(input.otherClosing);
    const concessions = num(input.concessions);
    const repairs = num(input.repairs);
    const payoff = num(input.payoff);
    const days = dayOfYear(input.closingDate);
    const taxProration = (num(input.annualTax) / daysInYear(input.closingDate)) * days;
    const costs = listing + buyerSide + title + other + concessions + repairs + taxProration;
    const net = price - costs - payoff;
    const band = num(input.bandPct, 3) / 100;
    const priceLow = price * (1 - band), priceHigh = price * (1 + band);
    const variable = (p) => p - (p * (num(input.listingPct) + num(input.buyerPct) + num(input.titlePct, 0.55))) / 100 - other - concessions - repairs - taxProration - payoff;
    return {
      price, payoff, days, net,
      lines: [
        ["Listing brokerage fee", listing],
        ["Buyer-side compensation / concession", buyerSide],
        ["Owner's title policy (est.)", title],
        ["Other closing costs (escrow, HOA transfer, doc prep, etc.)", other],
        ["Seller concessions / credits", concessions],
        ["Repairs before or after inspection", repairs],
        [`Property tax proration (${days} days)`, taxProration],
      ],
      totalCosts: costs,
      range: { low: variable(priceLow), high: variable(priceHigh), priceLow, priceHigh },
      costPct: price ? (costs / price) * 100 : 0,
    };
  }

  /** Move: sell current home, buy the next one. */
  function moveScenario(input) {
    const sale = sellerProceeds({ ...input, price: input.currentValue });
    const target = num(input.targetPrice);
    const buyClosing = (target * num(input.buyClosingPct, 2.5)) / 100;
    const reserve = num(input.reserve);
    const extraCash = num(input.extraCash);
    const available = Math.max(0, sale.net) + extraCash - reserve - buyClosing;
    const downPayment = clamp(available, 0, target);
    const cost = monthlyCost({ price: target, downPayment, ratePct: input.ratePct, years: input.years || 30, taxRatePct: input.taxRatePct, insuranceAnnual: input.insuranceAnnual, hoaMonthly: input.hoaMonthly, pmiRatePct: input.pmiRatePct });
    const leftover = Math.max(0, available - target);
    return { sale, target, buyClosing, reserve, extraCash, available, downPayment, downPct: target ? (downPayment / target) * 100 : 0, cost, leftover, shortfall: available < 0 ? -available : 0 };
  }

  /* ---------- neighborhood fit (fair-housing safe: only place-based, user-chosen criteria) ---------- */
  const FIT_KEYS = ["new_construction", "lot_size", "amenities", "commute_dallas", "commute_north", "rail", "lake", "value"];
  /**
   * weights: { key: 0..3 }, maxTier: 1..4, homeType: optional substring to match home_types.
   * Returns sorted [{n, score (0-100), reasons[], tradeoffs[], overBudget}]
   */
  function rankNeighborhoods(list, { weights = {}, maxTier = 4, homeType = "" } = {}) {
    const wsum = FIT_KEYS.reduce((a, k) => a + num(weights[k]), 0) || 1;
    return list.map((n) => {
      let raw = 0;
      FIT_KEYS.forEach((k) => { raw += num(weights[k]) * (num(n.scores[k]) / 5); });
      let score = (raw / wsum) * 100;
      const overBudget = n.price_tier > maxTier;
      if (overBudget) score -= 25 * (n.price_tier - maxTier);
      const typeMatch = !homeType || n.home_types.some((t) => t.toLowerCase().includes(homeType.toLowerCase()));
      if (!typeMatch) score -= 15;
      const ranked = FIT_KEYS.filter((k) => num(weights[k]) > 0).sort((a, b) => num(weights[b]) * n.scores[b] - num(weights[a]) * n.scores[a]);
      const reasons = ranked.filter((k) => n.scores[k] >= 4).slice(0, 3);
      const tradeoffs = ranked.filter((k) => n.scores[k] <= 1 && num(weights[k]) >= 2).slice(0, 2);
      return { n, score: clamp(Math.round(score), 0, 100), reasons, tradeoffs, overBudget, typeMatch };
    }).sort((a, b) => b.score - a.score);
  }

  const api = { num, pmtFactor, payment, monthlyCost, priceForPayment, affordability, sellerProceeds, moveScenario, rankNeighborhoods, dayOfYear, FIT_KEYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DREI_CALC = api;
})(typeof window !== "undefined" ? window : globalThis);
