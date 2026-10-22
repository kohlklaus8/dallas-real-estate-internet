/*
 * Demo answer engine. Runs fully in the browser from the site's own data when no live AI Worker is configured,
 * and as the fallback if the Worker is unreachable. It follows the same guardrails as the live system prompt:
 * grounded in approved data, no invented statistics, fair-housing safe, escalates professional questions.
 */
(function (root) {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KEY_LABEL = {
    new_construction: "newer homes", lot_size: "larger lots", amenities: "dining & entertainment nearby", commute_dallas: "commute to Dallas core",
    commute_north: "commute to Legacy/Frisco job centers", rail: "DART rail access", lake: "lake access", value: "more home for the money",
  };
  const ALIASES = {
    frisco: ["frisco"], "west-plano": ["west plano", "legacy", "plano"], "downtown-east-plano": ["east plano", "downtown plano", "plano"],
    mckinney: ["mckinney", "craig ranch"], allen: ["allen"], prosper: ["prosper", "windsong"], celina: ["celina", "light farms", "mustang lakes"],
    richardson: ["richardson", "cityline", "canyon creek"], "far-north-dallas": ["far north dallas", "north dallas", "bent tree"],
    "preston-hollow": ["preston hollow"], addison: ["addison"], carrollton: ["carrollton"], "the-colony": ["the colony", "grandscape"],
    "little-elm": ["little elm"], wylie: ["wylie"], murphy: ["murphy"], "lucas-fairview": ["lucas", "fairview"],
    "anna-melissa": ["anna", "melissa"], princeton: ["princeton"],
    rockwall: ["rockwall"], rowlett: ["rowlett", "sapphire bay"], garland: ["garland"], grapevine: ["grapevine"], "flower-mound": ["flower mound"],
    "las-colinas": ["las colinas", "irving"], arlington: ["arlington"], "fort-worth": ["fort worth", "ft worth"],
  };

  function findAreas(q, list) {
    const s = " " + q.toLowerCase().replace(/[^a-z0-9 ]/g, " ") + " ";
    const hits = [];
    for (const n of list) {
      const al = ALIASES[n.id] || [n.name.toLowerCase()];
      for (const a of al) {
        if (s.includes(" " + a + " ")) {
          // "plano" alone maps to both Plano profiles only if no more specific alias matched
          if (a === "fort worth" && s.includes(" dallas fort worth ")) continue;
          if (a === "plano" && (s.includes(" west plano ") || s.includes(" east plano ") || s.includes(" downtown plano ") || s.includes(" legacy "))) continue;
          hits.push(n); break;
        }
      }
    }
    return hits;
  }

  const has = (q, re) => re.test(q);
  const src = (n) => `${n.source} · updated ${n.last_updated}`;
  const areaLink = (n) => `<a class="link" href="areas/${esc(n.id)}.html">${esc(n.name)}</a>`;
  const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  const TIER = { 1: "entry", 2: "moderate", 3: "upper-middle", 4: "luxury" };

  function profileOf(n) {
    return `<p><strong>${esc(n.name)}</strong> (${esc(n.submarket)}). ${esc(n.lifestyle_summary)}</p>` +
      list([
        `<strong>Homes:</strong> ${esc(n.home_types.join(", "))}. ${esc(n.home_age)}.`,
        `<strong>Getting around:</strong> ${esc(n.commute_profile)}`,
        `<strong>Taxes &amp; HOA:</strong> ${esc(n.tax_profile)} ${esc(n.hoa)}.`,
        `<strong>Strengths:</strong> ${esc(n.pros.join("; "))}.`,
        `<strong>Tradeoffs:</strong> ${esc(n.cons.join("; "))}.`,
        `<strong>School districts serving the area:</strong> ${esc(n.isd.join(", "))}. Boundaries vary, so verify by address.`,
      ]) +
      `<p>Relative price tier: <strong>${TIER[n.price_tier]}</strong> for this region. I don't have a verified current median for ${esc(n.name)} loaded, so I won't quote one. A local expert can pull today's MLS numbers.</p>`;
  }

  function compareAreas(areas) {
    const keys = ["commute_dallas", "commute_north", "new_construction", "lot_size", "amenities", "rail", "lake", "value"];
    const rows = keys.map((k) => {
      const vals = areas.map((n) => n.scores[k]);
      const max = Math.max(...vals);
      const leaders = areas.filter((n) => n.scores[k] === max && vals.some((v) => v < max));
      return leaders.length && leaders.length < areas.length ? `<strong>${esc(KEY_LABEL[k])}:</strong> edge to ${leaders.map((n) => esc(n.name)).join(" & ")}` : `<strong>${esc(KEY_LABEL[k])}:</strong> roughly even`;
    });
    return `<p>Here's how ${areas.map(areaLink).join(" and ")} compare on place-based factors:</p>` + list(rows) +
      `<p>${areas.map((n) => `<strong>${esc(n.name)}</strong> fits ${esc(n.best_for.slice(0, 2).join(" and ").toLowerCase())}`).join(". ")}.</p>` +
      `<p>The right pick usually comes down to where you drive every day and how new you want the house. The Compare tool lets you weight those.</p>`;
  }

  function weightsFrom(q) {
    const w = {};
    if (has(q, /downtown|uptown|dallas core|central dallas|love field|commute to dallas/)) w.commute_dallas = 3;
    if (has(q, /legacy|plano job|frisco job|toyota|121 corridor|north corridor|(commute to|near|reach of|close to) (plano|frisco|allen|mckinney)/)) w.commute_north = 3;
    if (has(q, /train|rail|dart|transit/)) w.rail = 3;
    if (has(q, /lake|water|boat|beach/)) w.lake = 3;
    if (has(q, /new(er)? (home|construction|build)|brand new|builder/)) w.new_construction = 3;
    if (has(q, /acre|big (yard|lot)|large lot|land|space|privacy/)) w.lot_size = 3;
    if (has(q, /walk|restaurant|nightlife|dining|entertain|shopping/)) w.amenities = 3;
    if (has(q, /cheap|afford|value|starter|first[- ]time|entry|low(er)? price|bang for/)) w.value = 3;
    return w;
  }

  function tierFrom(q) {
    if (/entry|starter|cheap|first[- ]time|lowest/.test(q)) return 1;
    if (/moderate|mid(dle)?[- ]?(range|budget)|value/.test(q)) return 2;
    if (/upper/.test(q)) return 3;
    return 4;
  }

  /**
   * @returns {{html:string, sources:string[], followups:string[], handoff?:boolean, reason?:string, intent?:string}}
   */
  function respond(qRaw, ctx) {
    const q = String(qRaw || "").toLowerCase();
    const N = ctx.data?.neighborhoods || [];
    const A = ctx.articles?.articles || [];
    const M = ctx.market || {};
    const calc = ctx.calc;
    const areas = findAreas(q, N);
    const art = (slug) => A.find((a) => a.slug === slug);
    const out = { html: "", sources: [], followups: [], handoff: false, intent: "general" };

    const wantsHuman = has(q, /\b(tour|showing|see (the|a) house|agent|realtor|list my|help me (buy|sell)|can you help|call me|talk to (someone|a person|a human)|appointment|make an offer|write an offer|represent)\b/);

    // 1. Fair-housing guardrail
    if (has(q, /\b(crime|safe(st)?|dangerous|demograph|ethnic|racial|race|white|black|hispanic|latino|asian|indian|mexican|jewish|muslim|christian|church|religio|immigrant|diverse|diversity|good people|bad area|ghetto|minorit)\b/)) {
      out.intent = "fair_housing";
      out.html = `<p>I don't describe or rank neighborhoods by who lives there or by safety reputation. Fair-housing rules apply to real-estate guidance, and that kind of shortcut tends to mislead people anyway.</p>` +
        `<p>Here's what I can do:</p>` + list([
          "For crime data, the city police department's official crime map or open-data portal shows reported incidents for any address you're considering.",
          "For demographic data, the U.S. Census Bureau (data.census.gov) publishes neutral statistics.",
          "I can compare areas on commute, home age, lot size, taxes, amenities and price tier, and help you weigh what matters to you.",
        ]);
      out.sources = ["DREI fair-housing policy"];
      out.followups = ["Where should I live with a 30-minute commute to Uptown?", "Compare Allen vs. McKinney", "What can I afford?"];
      return out;
    }

    // 2. Professional escalation
    if (has(q, /\b(lawyer|attorney|legal advice|lawsuit|sue|evict|capital gains|1031|irs|tax return|deduct|probate|divorce|appraisal|appraise|appraised value|lender approv|pre-?approval)\b/)) {
      out.intent = "escalate";
      out.html = `<p>That one needs a licensed professional, not an AI estimate. ${has(q, /appraisal|appraise/) ? "An appraisal is a licensed appraiser's opinion of value. I can't produce one, and nothing on this site should be read as one." : ""}</p>` +
        list([
          has(q, /capital gains|1031|irs|tax return|deduct/) ? "Tax treatment of a sale: a CPA or tax attorney." : "",
          has(q, /lawyer|attorney|legal|lawsuit|sue|evict|probate|divorce/) ? "Legal questions: a Texas real-estate attorney." : "",
          has(q, /lender|pre-?approval/) ? "Loan approval: a mortgage lender. Our Affordability tool gives planning ranges, not approvals." : "",
          "Market value and pricing strategy: a local REALTOR® can prepare a comparative market analysis from current MLS data.",
        ].filter(Boolean)) + `<p>Want an introduction? A local expert can point you to the right person.</p>`;
      out.handoff = true; out.reason = "Needs a professional referral: " + qRaw;
      out.followups = ["Estimate my net proceeds", "What can I afford?"];
      out.sources = ["DREI escalation policy"];
      return out;
    }

    // 3. Compare
    if (areas.length >= 2 && has(q, /compare|vs\.?|versus| or |better|difference|between/)) {
      out.intent = "compare";
      out.html = compareAreas(areas.slice(0, 4));
      out.html += `<p><a class="btn btn-sm" href="tools.html#compare" data-compare="${areas.slice(0, 4).map((n) => n.id).join(",")}">Open in Compare tool</a></p>`;
      out.sources = areas.slice(0, 4).map(src);
      if (areas.some((n) => n.id === "frisco") && areas.some((n) => /plano/.test(n.id))) out.html += `<p>Related guide: <a class="link" href="guides/frisco-vs-plano.html">Frisco vs. Plano: how to actually choose</a></p>`;
      out.followups = [`Tell me more about ${areas[0].name}`, `Tell me more about ${areas[1].name}`, "Where should I live?"];
      out.handoff = wantsHuman;
      return out;
    }

    // 4. Selling / proceeds / value
    if (has(q, /\b(sell|selling|list(ing)? my|net proceeds|proceeds|equity|what('s| is) my (home|house) worth|home value|how much (is|can i get for) my)\b/)) {
      out.intent = "seller";
      const worth = has(q, /worth|value|how much (is|can i get)/);
      out.html = (worth ? `<p>I won't guess your home's value. Automated estimates often miss by a lot, and a wrong number in either direction costs you money. A local REALTOR® can run a comparative market analysis from recent MLS sales near you.</p>` : `<p>Good question to answer with real numbers. Here's how a Texas sale usually nets out:</p>`) +
        list([
          "<strong>Brokerage fees:</strong> listing-side and any buyer-side compensation are negotiable and set in your listing agreement.",
          "<strong>Owner's title policy:</strong> customarily paid by the seller in Texas. Rates are set by the Texas Department of Insurance.",
          "<strong>Property tax proration:</strong> Texas taxes are paid in arrears, so you credit the buyer for Jan 1 through closing.",
          "<strong>Your payoff,</strong> plus any concessions or repairs negotiated after the inspection.",
        ]) +
        `<p>The Seller Proceeds tool itemizes all of this and shows a range. ${worth ? "Pair it with a pricing analysis from a person." : ""}</p>` +
        `<p><a class="btn btn-sm" href="tools.html#proceeds">Estimate my net proceeds</a> <a class="btn btn-sm btn-ghost" href="tools.html#move">Sell &amp; buy: Move calculator</a></p>`;
      out.sources = ["Seller Proceeds methodology (DREI)", "Guide: Texas tax proration"];
      out.followups = ["How does property tax proration work?", "Should I sell now or wait?", "What would my next payment be if I move up?"];
      out.handoff = true; out.reason = worth ? "Wants a home value / CMA: " + qRaw : "Seller intent: " + qRaw;
      return out;
    }

    // 5. Market timing / stats
    if (has(q, /\b(market|prices?|inventory|interest rates?|mortgage rates?|rates|trend|crash|bubble|good time|buyer'?s market|seller'?s market|sell now|wait)\b/)) {
      out.intent = "market";
      const loaded = M && M.as_of && M.metrics && Object.values(M.metrics).some((m) => m && m.value != null);
      if (loaded) {
        const m = M.metrics;
        const items = Object.values(m).filter((x) => x && x.value != null).map((x) => `<strong>${esc(x.label)}:</strong> ${esc(fmt(x))}${x.change_yoy_pct != null ? ` (${x.change_yoy_pct > 0 ? "+" : ""}${x.change_yoy_pct}% YoY)` : ""}`);
        out.html = `<p>Latest verified snapshot for ${esc(M.region)}, as of ${esc(M.as_of)}:</p>` + list(items) + (M.summary ? `<p>${esc(M.summary)}</p>` : "");
        out.sources = [`${M.source || "Market snapshot"} · as of ${M.as_of}`];
      } else {
        out.html = `<p>I don't have a verified market snapshot loaded right now, so I won't quote prices, inventory or rates. Stale or made-up numbers are worse than none.</p>` +
          `<p>Here's how to read the market once you have numbers:</p>` + list([
            "<strong>Months of inventory</strong> (active listings ÷ monthly sales): under about 4 favors sellers, about 4–6 is balanced, over 6 favors buyers.",
            "<strong>Days on market and sale-to-list ratio</strong> show how much negotiating room buyers have.",
            "<strong>Rates</strong> move your payment more than small price changes do. Run both in the Affordability tool.",
          ]) + `<p>A local expert can pull today's MLS figures for the exact area and price band you care about.</p>`;
        out.sources = ["Market dashboard (awaiting verified snapshot)"];
      }
      out.html += `<p><a class="btn btn-sm" href="market.html">Open market dashboard</a></p>`;
      out.followups = ["What can I afford?", "Should I sell?", "Where should I live?"];
      out.handoff = wantsHuman || has(q, /sell now|wait/);
      out.reason = "Market timing question: " + qRaw;
      return out;
    }

    // 9. Where should I live
    if (has(q, /where should i (live|move|buy)|where to (live|buy)|which (area|neighborhood|suburb|city)|recommend|best (area|place|neighborhood|suburb)|suggest/) || (Object.keys(weightsFrom(q)).length && !has(q, /tell me|about|tax|school|isd/))) {
      out.intent = "buyer_fit";
      const w = weightsFrom(q);
      if (!Object.keys(w).length) {
        out.html = `<p>Happy to narrow it down. The answer depends on a few place-based things. Tell me any of these:</p>` + list([
          "Where you'll commute: Uptown/Downtown, Legacy/Plano, Frisco, Richardson, or remote",
          "Budget comfort: entry, moderate, upper-middle or luxury",
          "Priorities: newer homes, bigger lots, rail access, lake life, dining nearby, more home for the money",
        ]) + `<p>Or take the 60-second questionnaire: <a class="btn btn-sm" href="tools.html#fit">Where should I live?</a></p>`;
        out.followups = ["Commute to Uptown, newer home, moderate budget", "Lake life on a value budget", "Acreage within reach of Plano"];
      } else {
        const ranked = calc.rankNeighborhoods(N, { weights: w, maxTier: tierFrom(q) }).slice(0, 3);
        out.html = `<p>Based on what you said (${Object.keys(w).map((k) => KEY_LABEL[k]).join(", ")}), here's a starting shortlist:</p>` +
          list(ranked.map((r) => `${areaLink(r.n)}: ${esc(r.n.lifestyle_summary)}${r.tradeoffs.length ? ` <em>Tradeoff: ${r.tradeoffs.map((k) => KEY_LABEL[k]).join(", ")}.</em>` : ""}`)) +
          `<p>Refine it with budget and home type in the full tool: <a class="btn btn-sm" href="tools.html#fit">Where should I live?</a></p>`;
        out.sources = ranked.map((r) => src(r.n));
        out.followups = ranked.slice(0, 2).map((r) => `Tell me more about ${r.n.name}`).concat([`Compare ${ranked[0].n.name} vs. ${ranked[1].n.name}`]);
      }
      out.handoff = wantsHuman;
      return out;
    }

    // 6. Affordability
    if (has(q, /\b(afford|budget|payment|mortgage|how much (house|home)|down payment|dti|debt[- ]to[- ]income)\b/)) {
      out.intent = "buyer_afford";
      out.html = `<p>Let's get you a real range. I don't do the payment math in chat. The Affordability calculator runs it exactly, including Texas-sized property taxes, insurance, HOA and PMI.</p>` + list([
        "<strong>Comfortable</strong> scenario: housing at or under 28% of gross income, all debts under 36%.",
        "<strong>Stretch</strong> scenario: up to 31% / 43%, which is the upper end many lenders consider.",
        "<strong>Use the combined tax rate</strong> for the area you're eyeing. New communities with MUDs or PIDs can run noticeably higher.",
      ]) + `<p><a class="btn btn-sm" href="tools.html#affordability">Run the Affordability tool</a></p><p class="muted">Planning estimates only, not a loan approval. A lender confirms the real number.</p>`;
      out.sources = ["Affordability methodology (DREI)", "Guide: MUDs and PIDs"];
      out.followups = ["What's a MUD tax?", "Where should I live on a moderate budget?", "Compare Anna vs. Princeton"];
      out.handoff = wantsHuman;
      return out;
    }

    // 7. Taxes
    if (has(q, /\b(tax|taxes|mud|pid|homestead|exemption|prorat)/)) {
      out.intent = "tax";
      const isMud = has(q, /mud|pid|special district/);
      const a = isMud ? art("muds-and-pids-explained") : has(q, /prorat|sell/) ? art("texas-tax-proration-when-you-sell") : art("moving-to-dfw-from-california");
      out.html = isMud
        ? `<p><strong>MUD</strong> (Municipal Utility District) and <strong>PID</strong> (Public Improvement District) are special districts that fund roads, water and sewer in many newer North Texas communities. A MUD adds its own tax rate. A PID is usually an annual assessment. Either can add meaningfully to your yearly cost.</p>` + list(["Ask for the full combined rate for the specific address.", "Read the MUD/PID disclosures attached to the contract.", "Look the property up on the county appraisal district website."])
        : `<p>Texas has no state income tax, so property taxes do more of the work. A few things matter most:</p>` + list([
          "<strong>Combined rate:</strong> city + county + school district + any special districts. Always check by address.",
          "<strong>Homestead exemption:</strong> file with your county appraisal district once you own and live in the home. It lowers taxable value and caps annual appraisal increases on your homestead.",
          "<strong>Selling?</strong> Taxes are paid in arrears, so you'll credit the buyer for Jan 1 through closing.",
        ]);
      if (areas.length) out.html += `<p>For ${areas.map(areaLink).join(", ")}: ${areas.map((n) => esc(n.tax_profile)).join(" ")}</p>`;
      if (a) out.html += `<p>Read more: <a class="link" href="guides/${esc(a.slug)}.html">${esc(a.title)}</a></p>`;
      out.html += `<p class="muted">General information, not tax advice.</p>`;
      out.sources = [a ? `Guide: ${a.title}` : "Editorial (DREI)"].concat(areas.map(src));
      out.followups = ["Which areas have the most new construction?", "What can I afford?", "Estimate my net proceeds"];
      return out;
    }

    // 8. Schools (factual, no rankings)
    if (has(q, /\b(school|schools|isd|district)\b/)) {
      out.intent = "schools";
      const scope = areas.length ? areas : [];
      out.html = `<p>Our <a class="link" href="schools.html${scope.length ? "#" + esc(scope[0].id) : ""}">Schools page</a> shows the official Texas Education Agency A–F rating for every public district and campus near each area, plus private schools, with links to each report card and real parent reviews. I don't rank schools or pick neighborhoods by them, but I can tell you which districts serve an area:</p>` +
        (scope.length ? list(scope.map((n) => `${areaLink(n)}: ${esc(n.isd.join(", "))}`)) : `<p>Name an area (for example, "schools in Murphy") and I'll list the districts that serve it.</p>`) +
        `<p class="muted">District boundaries don't follow city lines, so always verify by address.</p>`;
      out.sources = scope.map(src);
      out.followups = ["Where should I live?", "Compare Allen vs. Murphy"];
      out.html += `<p><a class="btn btn-sm" href="schools.html${scope.length ? "#" + esc(scope[0].id) : ""}">See school ratings</a></p>`;
      return out;
    }

    // 10. Relocation
    if (has(q, /moving (here )?from|relocat|california|chicago|new york|out of state|move to (dallas|dfw|texas)|moving to (dallas|dfw|texas|north texas)/)) {
      out.intent = "relocation";
      const a = art("moving-to-dfw-from-california");
      out.html = `<p>Welcome, in advance. The big adjustments people mention are no state income tax but higher property taxes, MUD/PID districts in new construction, and choosing an area by drive time.</p>` +
        `<p>Start here: <a class="link" href="${a ? "guides/" + esc(a.slug) + ".html" : "moving.html"}">${a ? esc(a.title) : "Relocation guide"}</a>. Then tell me where you'll be working and I'll suggest areas.</p>`;
      out.sources = a ? [`Guide: ${a.title}`] : [];
      out.followups = ["Where should I live with a commute to Legacy?", "What's a MUD tax?", "What can I afford?"];
      out.handoff = wantsHuman;
      return out;
    }

    // 11. Single-area profile
    if (areas.length) {
      out.intent = "area";
      const n = areas[0];
      out.html = profileOf(n) + `<p><a class="btn btn-sm" href="areas/${esc(n.id)}.html">Full ${esc(n.name)} profile</a></p>`;
      out.sources = [src(n)];
      const sib = N.filter((x) => x.id !== n.id && x.price_tier === n.price_tier).slice(0, 1)[0];
      out.followups = [sib ? `Compare ${n.name} vs. ${sib.name}` : "Where should I live?", `Schools in ${n.name}`, `Taxes in ${n.name}`];
      out.handoff = wantsHuman; out.reason = `Interested in ${n.name}: ${qRaw}`;
      return out;
    }

    // 12. Human request without other intent
    if (wantsHuman) {
      out.intent = "handoff";
      out.html = `<p>Absolutely. A local REALTOR® can take it from here, and your questions so far come along so you won't repeat yourself.</p>`;
      out.handoff = true; out.reason = qRaw;
      return out;
    }

    // Fallback
    out.html = `<p>I can help with neighborhoods, commutes, taxes, selling and planning a move anywhere in Dallas–Fort Worth. Try one of these:</p>` +
      list(["\"Compare Frisco vs. Plano\"", "\"Where should I live with rail access on a moderate budget?\"", "\"Tell me about Richardson\"", "\"What's a MUD tax?\"", "\"Should I sell?\""]) +
      `<p class="muted">If your question is about somewhere outside this launch area, a local expert can still help.</p>`;
    out.followups = ["Where should I live?", "Compare Allen vs. McKinney", "What can I afford?"];
    return out;
  }

  function fmt(x) {
    if (x.unit === "usd") return "$" + Math.round(x.value).toLocaleString("en-US");
    if (x.unit === "pct") return x.value + "%";
    if (x.unit === "months") return x.value + " months";
    if (x.unit === "days") return x.value + " days";
    return Number(x.value).toLocaleString("en-US");
  }

  const api = { respond, findAreas, KEY_LABEL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DREI_BRAIN = api;
})(typeof window !== "undefined" ? window : globalThis);
