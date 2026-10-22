(function () {
  const { esc, money, pct, store, track, loadJSON, tier, shields } = window.DREI;
  const K = window.DREI_CALC;
  const KEY_LABEL = window.DREI_BRAIN.KEY_LABEL;
  const TABS = ["affordability", "move", "proceeds", "compare", "fit"];
  const completed = new Set();

  const inDays = (d) => { const t = new Date(Date.now() + d * 86400000); return t.toISOString().slice(0, 10); };

  // ---------- form helpers ----------
  function field(id, label, value, { hint = "", type = "text", mode = "decimal" } = {}) {
    return `<label for="${id}"><span>${esc(label)}${hint ? ` <span class="hint">${esc(hint)}</span>` : ""}</span>
      <input id="${id}" name="${id}" type="${type}" ${type === "text" ? `inputmode="${mode}"` : ""} value="${esc(value)}"></label>`;
  }
  function readForm(form) { const o = {}; new FormData(form).forEach((v, k) => (o[k] = v)); return o; }
  function restore(tool, defaults) { return { ...defaults, ...store.get("tool:" + tool, {}) }; }
  function persist(tool, values) { store.set("tool:" + tool, values); }
  function complete(tool, summary) {
    const last = store.get("lastTools", {}); last[tool] = { ...summary, at: new Date().toISOString() }; store.set("lastTools", last);
    if (!completed.has(tool)) { completed.add(tool); track(tool === "proceeds" || tool === "move" ? "seller_tool" : "tool_complete", { tool }); }
  }
  function exampleNote(tool) {
    return store.get("tool:" + tool, null) ? "" : `<p class="note" style="font-size:.85rem">These are example values. Replace them with yours, and nothing leaves your device.</p>`;
  }
  function wire(tool, form, calcFn) {
    let edited = false;
    const run = (user) => { const v = readForm(form); if (user) { persist(tool, v); edited = true; } calcFn(v, edited); };
    form.addEventListener("input", () => run(true));
    form.addEventListener("submit", (e) => { e.preventDefault(); run(true); });
    run(false);
  }

  // ---------- 1. Affordability ----------
  function affordability() {
    const el = document.getElementById("panel-affordability");
    const v = restore("affordability", { income: "150,000", debts: "650", down: "80,000", rate: "6.5", years: "30", tax: "2.2", ins: "3,600", hoa: "60", pmi: "0.5", target: "" });
    el.innerHTML = `<div class="tool-layout">
      <form class="form card" id="f-aff" novalidate>
        <h2 style="font-size:var(--step-2)">Affordability</h2>
        ${exampleNote("affordability")}
        <div class="form-row">${field("income", "Gross household income / yr", v.income, { hint: "$" })}${field("debts", "Monthly debt payments", v.debts, { hint: "car, student, cards" })}</div>
        <div class="form-row">${field("down", "Down payment", v.down, { hint: "$" })}${field("rate", "Interest rate", v.rate, { hint: "% (use a current quote)" })}</div>
        <div class="form-row">${field("tax", "Combined property tax rate", v.tax, { hint: "% (check by address)" })}${field("ins", "Homeowners insurance / yr", v.ins, { hint: "$" })}</div>
        <div class="form-row">${field("hoa", "HOA / month", v.hoa, { hint: "$" })}${field("pmi", "PMI rate if under 20% down", v.pmi, { hint: "% / yr" })}</div>
        <div class="form-row">${field("years", "Loan term", v.years, { hint: "years" })}${field("target", "Test a specific price", v.target, { hint: "optional" })}</div>
      </form>
      <div class="stack" id="r-aff" aria-live="polite"></div>
    </div>`;
    wire("affordability", document.getElementById("f-aff"), (f) => {
      const input = { monthlyIncome: K.num(f.income) / 12, monthlyDebts: K.num(f.debts), downPayment: K.num(f.down), ratePct: K.num(f.rate), years: K.num(f.years, 30), taxRatePct: K.num(f.tax), insuranceAnnual: K.num(f.ins), hoaMonthly: K.num(f.hoa), pmiRatePct: K.num(f.pmi), targetPrice: K.num(f.target) };
      const r = K.affordability(input);
      const [c, s] = r.scenarios;
      const breakdown = (x) => `<dl>
        <dt>Principal &amp; interest</dt><dd>${money(x.cost.pi)}</dd><dt>Property tax</dt><dd>${money(x.cost.tax)}</dd>
        <dt>Insurance</dt><dd>${money(x.cost.ins)}</dd>${x.cost.pmi ? `<dt>PMI</dt><dd>${money(x.cost.pmi)}</dd>` : ""}<dt>HOA</dt><dd>${money(x.cost.hoa)}</dd>
        <dt class="total">Monthly total</dt><dd class="total">${money(x.cost.total)}</dd></dl>`;
      document.getElementById("r-aff").innerHTML = `
        <div class="result">
          <span class="eyebrow">Comfortable price range</span>
          <div class="big">${money(c.price)} – ${money(s.price)}</div>
          <p class="muted">Comfortable keeps housing at 28% of gross income and all debts at 36% or less. Stretch allows up to 31% / 43%.</p>
          <div class="grid grid-2">
            <div><strong>Comfortable · ${money(c.price)}</strong>${breakdown(c)}</div>
            <div><strong>Stretch · ${money(s.price)}</strong>${breakdown(s)}</div>
          </div>
        </div>
        ${r.target ? `<div class="card"><h3>At ${money(r.target.price)}</h3>
          <p>Monthly cost <strong>${money(r.target.cost.total)}</strong>: ${pct(r.target.frontDTI)} of gross income for housing, ${pct(r.target.backDTI)} with all debts.
          ${r.target.backDTI > 43 ? '<span style="color:var(--bad)">Above typical lender limits.</span>' : r.target.backDTI > 36 ? '<span style="color:var(--warn)">In the stretch zone.</span>' : '<span style="color:var(--good)">Within the comfortable zone.</span>'}</p></div>` : ""}
        <div class="card"><p style="font-size:.9rem">Property tax is the swing factor in North Texas. A one-point difference in the combined rate on ${money(c.price)} changes the payment by about <strong>${money(c.price * 0.01 / 12)}</strong>/month. New communities with MUD or PID districts often run higher. <a class="link" href="guides/muds-and-pids-explained.html">Why →</a></p></div>
        <div><a class="btn btn-sm" href="tools.html#fit">Find areas in this range →</a> <button class="btn btn-sm btn-ghost" type="button" data-handoff="tool-affordability">Get a lender intro</button></div>`;
      complete("affordability", { comfortable: Math.round(c.price), stretch: Math.round(s.price) });
    });
  }

  // ---------- 2. Seller proceeds ----------
  function proceeds() {
    const el = document.getElementById("panel-proceeds");
    const v = restore("proceeds", { price: "550,000", payoff: "300,000", listing: "3", buyer: "2.5", title: "0.55", other: "2,500", concessions: "0", repairs: "0", annualTax: "11,500", closing: inDays(60) });
    el.innerHTML = `<div class="tool-layout">
      <form class="form card" id="f-pro" novalidate>
        <h2 style="font-size:var(--step-2)">Seller net proceeds</h2>
        ${exampleNote("proceeds")}
        <div class="form-row">${field("price", "Target sale price", v.price, { hint: "$" })}${field("payoff", "Mortgage payoff", v.payoff, { hint: "$ incl. HELOC" })}</div>
        <div class="form-row">${field("listing", "Listing brokerage fee", v.listing, { hint: "% (negotiable)" })}${field("buyer", "Buyer-side comp / concession", v.buyer, { hint: "% (negotiable)" })}</div>
        <div class="form-row">${field("title", "Owner's title policy (est.)", v.title, { hint: "% of price" })}${field("other", "Other closing costs", v.other, { hint: "$" })}</div>
        <div class="form-row">${field("concessions", "Seller credits / concessions", v.concessions, { hint: "$" })}${field("repairs", "Repairs", v.repairs, { hint: "$" })}</div>
        <div class="form-row">${field("annualTax", "Annual property tax bill", v.annualTax, { hint: "$ (last year)" })}${field("closing", "Target closing date", v.closing, { type: "date" })}</div>
      </form>
      <div class="stack" id="r-pro" aria-live="polite"></div>
    </div>`;
    wire("proceeds", document.getElementById("f-pro"), (f) => {
      const r = K.sellerProceeds({ price: f.price, payoff: f.payoff, listingPct: f.listing, buyerPct: f.buyer, titlePct: f.title, otherClosing: f.other, concessions: f.concessions, repairs: f.repairs, annualTax: f.annualTax, closingDate: f.closing });
      document.getElementById("r-pro").innerHTML = `
        <div class="result">
          <span class="eyebrow">Estimated net to you</span>
          <div class="big">${money(r.net)}</div>
          <p class="muted">Range ${money(r.range.low)} – ${money(r.range.high)} if the sale lands within ±3% of ${money(r.price)}.</p>
          <dl>
            <dt>Sale price</dt><dd>${money(r.price)}</dd>
            ${r.lines.filter(([, x]) => x > 0).map(([k, x]) => `<dt>${esc(k)}</dt><dd>−${money(x)}</dd>`).join("")}
            <dt>Mortgage payoff</dt><dd>−${money(r.payoff)}</dd>
            <dt class="total">Net proceeds</dt><dd class="total">${money(r.net)}</dd>
          </dl>
          <p class="muted" style="font-size:.85rem">Selling costs come to ${pct(r.costPct)} of price, before your payoff.</p>
        </div>
        <div class="card"><p style="font-size:.9rem"><strong>Texas tax proration:</strong> property taxes are paid in arrears, so at closing you credit the buyer about ${r.days} days of this year's taxes. <a class="link" href="guides/texas-tax-proration-when-you-sell.html">How it works →</a></p></div>
        <div class="handoff"><strong>Questions for an agent review</strong>
          <ul class="clean" style="font-size:.9rem"><li>What do recent comparable sales support for the list price?</li><li>Which pre-listing repairs pay for themselves?</li><li>How should buyer-side compensation be structured for your price band?</li></ul>
          <div><button class="btn btn-brass btn-sm" type="button" data-handoff="tool-proceeds" data-reason="I ran the Seller Proceeds tool at ${esc(money(r.price))} (est. net ${esc(money(r.net))}) and would like a pricing review.">Get a pricing review</button></div></div>`;
      complete("proceeds", { price: r.price, net: Math.round(r.net) });
    });
  }

  // ---------- 3. Move calculator ----------
  function move() {
    const el = document.getElementById("panel-move");
    const v = restore("move", { value: "550,000", payoff: "300,000", sellCost: "6", annualTax: "11,500", closing: inDays(75), target: "750,000", reserve: "25,000", extra: "0", buyClosing: "2.5", rate: "6.5", tax: "2.2", ins: "4,200", hoa: "80" });
    el.innerHTML = `<div class="tool-layout">
      <form class="form card" id="f-move" novalidate>
        <h2 style="font-size:var(--step-2)">Move calculator</h2>
        ${exampleNote("move")}
        <fieldset class="form"><legend>Your current home</legend>
          <div class="form-row">${field("value", "Estimated sale price", v.value, { hint: "$" })}${field("payoff", "Mortgage payoff", v.payoff, { hint: "$" })}</div>
          <div class="form-row">${field("sellCost", "Brokerage fees, total", v.sellCost, { hint: "% (negotiable)" })}${field("annualTax", "Annual property tax", v.annualTax, { hint: "$" })}</div>
          ${field("closing", "Sale closing date", v.closing, { type: "date" })}
        </fieldset>
        <fieldset class="form"><legend>Your next home</legend>
          <div class="form-row">${field("target", "Target purchase price", v.target, { hint: "$" })}${field("rate", "Interest rate", v.rate, { hint: "%" })}</div>
          <div class="form-row">${field("reserve", "Cash to keep in reserve", v.reserve, { hint: "$" })}${field("extra", "Other cash toward purchase", v.extra, { hint: "$" })}</div>
          <div class="form-row">${field("buyClosing", "Buyer closing costs", v.buyClosing, { hint: "% of price" })}${field("tax", "Combined tax rate", v.tax, { hint: "%" })}</div>
          <div class="form-row">${field("ins", "Insurance / yr", v.ins, { hint: "$" })}${field("hoa", "HOA / month", v.hoa, { hint: "$" })}</div>
        </fieldset>
      </form>
      <div class="stack" id="r-move" aria-live="polite"></div>
    </div>`;
    wire("move", document.getElementById("f-move"), (f) => {
      const r = K.moveScenario({ currentValue: f.value, payoff: f.payoff, listingPct: f.sellCost, buyerPct: 0, titlePct: 0.55, otherClosing: 2500, annualTax: f.annualTax, closingDate: f.closing, targetPrice: f.target, reserve: f.reserve, extraCash: f.extra, buyClosingPct: f.buyClosing, ratePct: f.rate, taxRatePct: f.tax, insuranceAnnual: f.ins, hoaMonthly: f.hoa });
      document.getElementById("r-move").innerHTML = `
        <div class="result">
          <span class="eyebrow">Your next payment</span>
          <div class="big">${money(r.cost.total)}<span style="font-size:1rem;color:inherit"> /mo</span></div>
          <p class="muted">${money(r.target)} home with ${money(r.downPayment)} down (${pct(r.downPct)}).${r.cost.pmi ? " Includes PMI because the down payment is under 20%." : ""}</p>
          <dl>
            <dt>Estimated net from sale</dt><dd>${money(r.sale.net)}</dd>
            ${r.extraCash ? `<dt>Other cash</dt><dd>+${money(r.extraCash)}</dd>` : ""}
            <dt>Kept in reserve</dt><dd>−${money(r.reserve)}</dd>
            <dt>Buyer closing costs</dt><dd>−${money(r.buyClosing)}</dd>
            <dt class="total">Available for down payment</dt><dd class="total">${money(Math.max(0, r.available))}</dd>
          </dl>
          <dl>
            <dt>Principal &amp; interest</dt><dd>${money(r.cost.pi)}</dd><dt>Property tax</dt><dd>${money(r.cost.tax)}</dd><dt>Insurance</dt><dd>${money(r.cost.ins)}</dd>
            ${r.cost.pmi ? `<dt>PMI</dt><dd>${money(r.cost.pmi)}</dd>` : ""}<dt>HOA</dt><dd>${money(r.cost.hoa)}</dd>
          </dl>
          ${r.shortfall ? `<p style="color:var(--brass)">Cash is short by ${money(r.shortfall)} after reserves and closing costs.</p>` : ""}
        </div>
        <div class="card"><p style="font-size:.9rem"><strong>Sequencing matters.</strong> Buying before you sell may require a bridge loan, a sale contingency or a lease-back. Each changes the cash you need and when you need it.</p></div>
        <div><button class="btn btn-brass btn-sm" type="button" data-handoff="tool-move" data-reason="I'm planning a move: selling around ${esc(money(r.sale.price))} and buying around ${esc(money(r.target))}.">Plan the sequence with a local expert</button></div>`;
      complete("move", { sale: r.sale.price, target: r.target, payment: Math.round(r.cost.total) });
    });
  }

  // ---------- 4. Compare ----------
  function compare(N) {
    const el = document.getElementById("panel-compare");
    const pre = store.get("compareIds", null) || store.get("tool:compare", null) || ["frisco", "west-plano"];
    const opts = (sel) => `<option value="">—</option>` + N.map((n) => `<option value="${n.id}"${n.id === sel ? " selected" : ""}>${esc(n.name)}</option>`).join("");
    const pri = store.get("tool:comparePri", ["commute_dallas", "new_construction"]);
    el.innerHTML = `
      <div class="card" style="margin-bottom:1rem">
        <h2 style="font-size:var(--step-2)">Compare areas</h2>
        <div class="form-row" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
          ${[0, 1, 2, 3].map((i) => `<label for="cmp-${i}">Area ${i + 1}<select id="cmp-${i}">${opts(pre[i])}</select></label>`).join("")}
        </div>
        <fieldset><legend>What matters most to you?</legend>
          <div class="tags" id="cmp-pri">${Object.entries(KEY_LABEL).map(([k, l]) => `<label style="display:inline-flex;gap:.35rem;align-items:center;font-weight:500"><input type="checkbox" value="${k}" style="width:auto"${pri.includes(k) ? " checked" : ""}> ${esc(l)}</label>`).join("")}</div>
        </fieldset>
      </div>
      <div id="r-cmp"></div>`;
    store.set("compareIds", null);
    const run = () => {
      const ids = [0, 1, 2, 3].map((i) => document.getElementById("cmp-" + i).value).filter(Boolean);
      const uniq = [...new Set(ids)];
      const areas = uniq.map((id) => N.find((n) => n.id === id));
      const priorities = [...el.querySelectorAll("#cmp-pri input:checked")].map((i) => i.value);
      store.set("tool:compare", uniq); store.set("tool:comparePri", priorities);
      if (areas.length < 2) { document.getElementById("r-cmp").innerHTML = `<p class="muted">Pick at least two areas.</p>`; return; }
      const weights = Object.fromEntries(priorities.map((k) => [k, 2]));
      const ranked = priorities.length ? K.rankNeighborhoods(areas, { weights }) : [];
      const fit = Object.fromEntries(ranked.map((r) => [r.n.id, r.score]));
      const row = (label, fn) => `<tr><th scope="row" style="text-transform:none;letter-spacing:0;font:600 .85rem var(--font-body);color:var(--ink-2)">${label}</th>${areas.map((n) => `<td>${fn(n)}</td>`).join("")}</tr>`;
      const scoreCell = (k) => (n) => { const best = Math.max(...areas.map((a) => a.scores[k])); return `<div class="score-row" style="grid-template-columns:minmax(0,1fr) 1.5rem"><span class="bar"><span style="width:${(n.scores[k] / 5) * 100}%;${n.scores[k] === best ? "" : "opacity:.45"}"></span></span><span class="num">${n.scores[k]}</span></div>`; };
      document.getElementById("r-cmp").innerHTML = `
        ${priorities.length ? `<div class="result" style="margin-bottom:1rem"><span class="eyebrow">Best fit for your priorities</span>
          <div class="big">${esc(ranked[0].n.name)}</div>
          <p class="muted">Weighted on ${priorities.map((k) => esc(KEY_LABEL[k])).join(", ")}. ${ranked.map((r) => `${esc(r.n.name)} ${r.score}`).join(" · ")} (fit score out of 100).</p></div>` : ""}
        <div class="table-wrap"><table>
          <thead><tr><th></th>${areas.map((n) => `<th><a class="link" href="areas/${n.id}.html" style="font-size:.85rem;letter-spacing:0;text-transform:none">${esc(n.name)}</a></th>`).join("")}</tr></thead>
          <tbody>
            ${priorities.length ? row("Fit score", (n) => `<strong class="num" style="text-align:left">${fit[n.id]}</strong>`) : ""}
            ${row("Price tier", (n) => tier(n.price_tier))}
            ${Object.keys(KEY_LABEL).map((k) => row(esc(KEY_LABEL[k]), scoreCell(k))).join("")}
            ${row("Routes", (n) => shields(n.routes))}
            ${row("Home age", (n) => esc(n.home_age))}
            ${row("Lots", (n) => esc(n.lot_profile))}
            ${row("Taxes", (n) => esc(n.tax_profile))}
            ${row("HOA", (n) => esc(n.hoa))}
            ${row("School districts", (n) => esc(n.isd.join(", ")))}
            ${row("Tradeoffs", (n) => `<ul class="clean cons" style="font-size:.85rem">${n.cons.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`)}
          </tbody></table></div>
        <p class="stamp" style="margin-top:.6rem">Scores are relative 0–5 within our coverage area (editorial, updated ${esc(areas[0].last_updated)}). They describe places, not people.</p>`;
      track("compare", { ids: uniq.join(",") });
      complete("compare", { ids: uniq, top: ranked[0] ? ranked[0].n.id : null });
    };
    el.oninput = run;
    run();
  }

  // ---------- 5. Where should I live? ----------
  function fit(N) {
    const el = document.getElementById("panel-fit");
    const v = restore("fit", { commute: "both", tier: "3", type: "", new_construction: "2", lot_size: "1", amenities: "2", rail: "0", lake: "0", value: "1" });
    const slider = (k) => `<label for="w-${k}"><span>${esc(KEY_LABEL[k])} <span class="hint" id="wl-${k}"></span></span><input type="range" id="w-${k}" name="${k}" min="0" max="3" step="1" value="${esc(v[k])}"></label>`;
    el.innerHTML = `<div class="tool-layout">
      <form class="form card" id="f-fit" novalidate>
        <h2 style="font-size:var(--step-2)">Where should I live?</h2>
        <p class="muted" style="font-size:.9rem">We rank places by commute, budget, home type and what you want nearby. We never use who lives there.</p>
        <div class="form-row">
          <label for="commute">Daily commute
            <select id="commute" name="commute">
              ${[["dallas", "Uptown / Downtown Dallas"], ["north", "Legacy / Plano / Frisco"], ["both", "Both (split household)"], ["remote", "Remote / flexible"]].map(([k, l]) => `<option value="${k}"${v.commute === k ? " selected" : ""}>${l}</option>`).join("")}
            </select></label>
          <label for="tier">Budget comfort
            <select id="tier" name="tier">${[1, 2, 3, 4].map((t) => `<option value="${t}"${String(v.tier) === String(t) ? " selected" : ""}>Up to ${window.DREI.TIER_LABEL[t]}</option>`).join("")}</select></label>
        </div>
        <label for="type">Home type
          <select id="type" name="type">${[["", "Any"], ["Single-family", "Single-family"], ["Townhome", "Townhome"], ["Condo", "Condo"], ["New build", "New build"], ["Acreage", "Acreage"]].map(([k, l]) => `<option value="${k}"${v.type === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <fieldset class="form"><legend>How much do these matter? (0–3)</legend>
          ${["new_construction", "lot_size", "amenities", "rail", "lake", "value"].map(slider).join("")}
        </fieldset>
        <button class="btn btn-ghost btn-sm" type="button" id="fit-save">Save these preferences to my profile</button>
      </form>
      <div class="stack" id="r-fit" aria-live="polite"></div>
    </div>`;
    const words = ["Not important", "Nice to have", "Important", "Must have"];
    wire("fit", document.getElementById("f-fit"), (f) => {
      ["new_construction", "lot_size", "amenities", "rail", "lake", "value"].forEach((k) => (document.getElementById("wl-" + k).textContent = "· " + words[K.num(f[k])]));
      const weights = { new_construction: f.new_construction, lot_size: f.lot_size, amenities: f.amenities, rail: f.rail, lake: f.lake, value: f.value };
      if (f.commute === "dallas") weights.commute_dallas = 3;
      if (f.commute === "north") weights.commute_north = 3;
      if (f.commute === "both") { weights.commute_dallas = 2; weights.commute_north = 2; }
      const ranked = K.rankNeighborhoods(N, { weights, maxTier: K.num(f.tier, 4), homeType: f.type }).slice(0, 5);
      document.getElementById("r-fit").innerHTML = `
        <div class="result"><span class="eyebrow">Your shortlist</span><div class="big">${esc(ranked[0].n.name)}</div>
          <p class="muted">Top match out of ${N.length} areas. Fit score ${ranked[0].score}/100.</p></div>
        ${ranked.map((r, i) => `<a class="card" href="areas/${r.n.id}.html">
          <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:baseline"><h3>${i + 1}. ${esc(r.n.name)}</h3><span class="num">${r.score}/100</span></div>
          <span class="bar"><span style="width:${r.score}%"></span></span>
          ${r.reasons.length ? `<p style="font-size:.9rem"><strong>Why:</strong> ${r.reasons.map((k) => esc(KEY_LABEL[k])).join(", ")}.</p>` : ""}
          ${r.tradeoffs.length ? `<p style="font-size:.9rem;color:var(--ink-2)"><strong>Tradeoff:</strong> weaker on ${r.tradeoffs.map((k) => esc(KEY_LABEL[k])).join(", ")}.</p>` : ""}
          ${r.overBudget ? `<p style="font-size:.85rem;color:var(--warn)">Usually above your budget tier.</p>` : ""}
          ${!r.typeMatch ? `<p style="font-size:.85rem;color:var(--warn)">Limited ${esc(f.type.toLowerCase())} inventory.</p>` : ""}
        </a>`).join("")}
        <div><a class="btn btn-sm" href="tools.html#compare" id="fit-cmp">Compare the top 3</a> <button class="btn btn-brass btn-sm" type="button" data-handoff="tool-fit" data-reason="My Where Should I Live? shortlist: ${esc(ranked.slice(0, 3).map((r) => r.n.name).join(", "))}. I'd like to tour.">Tour these areas</button></div>`;
      document.getElementById("fit-cmp").addEventListener("click", () => store.set("compareIds", ranked.slice(0, 3).map((r) => r.n.id)));
      complete("fit", { top: ranked.slice(0, 3).map((r) => r.n.id) });
    });
    document.getElementById("fit-save").addEventListener("click", (e) => {
      const f = readForm(document.getElementById("f-fit"));
      const p = store.get("profile", {});
      store.set("profile", { ...p, commute: { dallas: "Uptown/Downtown Dallas", north: "Legacy/Plano/Frisco", both: "Dallas + Legacy", remote: "Remote" }[f.commute], budget: window.DREI.TIER_LABEL[f.tier], homeType: f.type || p.homeType, weights: f });
      track("save_profile", { from: "fit" });
      e.target.textContent = "Saved to your profile ✓";
    });
  }

  // ---------- tabs ----------
  let N = null;
  const built = {};
  function show(tab) {
    if (!TABS.includes(tab)) tab = "affordability";
    document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === tab)));
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== tab));
    if (!built[tab] || tab === "compare") {
      if ((tab === "compare" || tab === "fit") && !N) return;
      ({ affordability, move, proceeds, compare: () => compare(N), fit: () => fit(N) })[tab]();
      built[tab] = true;
    }
  }
  const current = () => location.hash.replace("#", "");
  window.addEventListener("hashchange", () => show(current()));
  show(current());
  loadJSON("data/neighborhoods.json").then((d) => { N = d.neighborhoods; show(current()); }).catch(() => {});
})();
