(function () {
  const { esc, tier, shields, store, track, loadJSON, money, areaCard, photoUrl, photoCredit } = window.DREI;
  let PHOTOS = {};
  const KEY_LABEL = window.DREI_BRAIN.KEY_LABEL;
  const listView = document.getElementById("list-view");
  const detailView = document.getElementById("detail-view");
  let DATA = null;

  const card = (n) => areaCard(n, PHOTOS, DATA.neighborhoods.indexOf(n));

  function renderList() {
    const q = document.getElementById("f-q").value.trim().toLowerCase();
    const t = document.getElementById("f-tier").value;
    const sort = document.getElementById("f-sort").value;
    let rows = DATA.neighborhoods.filter((n) => {
      if (t && String(n.price_tier) !== t) return false;
      if (!q) return true;
      return JSON.stringify([n.name, n.city, n.submarket, n.routes, n.amenities, n.home_types, n.best_for, n.lifestyle_summary, n.isd]).toLowerCase().includes(q);
    });
    rows.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.scores[sort] - a.scores[sort] || a.name.localeCompare(b.name)));
    document.getElementById("areas").className = "areas"; document.getElementById("areas").innerHTML = rows.map(card).join("") || `<p class="muted">No areas match. Try "lake", "DART" or "new build".</p>`;
    document.getElementById("count").textContent = `${rows.length} of ${DATA.neighborhoods.length} areas · profiles updated ${DATA.meta.last_updated}`;
  }

  const GLANCE = [
    ["commute_dallas", "Drive to Downtown Dallas", ["Long drive", "Manageable", "Quick"]],
    ["commute_north", "Drive to Legacy / Frisco jobs", ["Long drive", "Manageable", "Quick"]],
    ["amenities", "Restaurants & things to do", ["Quieter, drive for fun", "Good local options", "Lots close by"]],
    ["new_construction", "Age of homes", ["Mostly established", "Mix of old & new", "Lots of new builds"]],
    ["lot_size", "Yard size", ["Typical lots", "Some bigger lots", "Room to spread out"]],
    ["value", "Price for the space", ["Premium", "Middle of the road", "More home for the money"]],
    ["rail", "Train (DART)", ["No train", "Train nearby", "On the line"]],
    ["lake", "Lake access", ["No lake nearby", "Short drive to a lake", "Lake life"]],
  ];
  let MARKET = null;
  const pctTxt = (v) => (v == null ? "" : `<small class="${v >= 0 ? "up" : "down"}">${v >= 0 ? "▲" : "▼"} ${Math.abs(v)}% vs. last year</small>`);
  const short = (v) => (v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v / 1000) + "K");
  function marketBlock(n) {
    if (!MARKET || !MARKET.as_of) return "";
    const a = (MARKET.by_area || []).find((x) => x.id === n.id) || {};
    const zips = (MARKET.by_zip || []).filter((z) => (n.zips || []).includes(z.zip));
    const mt = MARKET.metrics || {};
    const kp = (k, v, sub = "") => `<div class="mk"><span class="k">${k}</span><strong>${v ?? "—"}</strong>${sub}</div>`;
    const S = (MARKET.sources || [])[0] || {};
    const moi = mt.months_inventory && mt.months_inventory.value;
    return `<section class="stack" id="market" style="gap:.8rem;margin-top:2.5rem">
      <div class="sec-head" style="margin-bottom:0"><div><span class="eyebrow">Market</span><h2 style="font-size:var(--step-3)">Home values in ${esc(n.name)}</h2>
      <p class="lede">What a typical home is worth here, how that's changed in a year, and how the wider DFW market is moving.</p></div>
      <a class="btn btn-ghost" href="market.html">DFW market →</a></div>
      <div class="mks">
        ${a.home_value != null ? kp(`Typical home value · ${esc(a.city)}`, money(a.home_value), pctTxt(a.home_value_yoy)) : ""}
        ${a.zip_range ? kp("Range across its ZIP codes", `${short(a.zip_range[0])} – ${short(a.zip_range[1])}`) : ""}
        ${moi != null ? kp("DFW months of supply", moi, `<small>${moi < 4 ? "Seller-leaning" : moi <= 6 ? "Balanced" : "Buyer-leaning"} market</small>`) : ""}
      </div>
      ${zips.length ? `<div class="table-wrap"><table><thead><tr><th>ZIP code</th><th class="num">Typical home value</th><th class="num">1-yr change</th></tr></thead><tbody>
        ${zips.map((z) => `<tr><td><strong>${esc(z.zip)}</strong> <span class="muted">${esc(z.city)}</span></td><td class="num">${money(z.home_value)}</td><td class="num" style="color:${(z.home_value_yoy || 0) >= 0 ? "var(--good)" : "var(--bad)"}">${z.home_value_yoy >= 0 ? "+" : ""}${z.home_value_yoy}%</td></tr>`).join("")}
      </tbody></table></div>` : ""}
      <p class="stamp">Source: <a href="${esc(S.url || "#")}" target="_blank" rel="noopener">Zillow Home Value Index</a>, ${esc(S.period || "")}. Public data, refreshed weekly. Typical values are estimates, not an appraisal of any one home. For a specific address, ask for a market analysis.</p>
    </section>`;
  }
  const CPTS = [["downtown_dallas", "Downtown Dallas"], ["legacy_plano", "Legacy West (Plano)"], ["dfw_airport", "DFW Airport"], ["downtown_fw", "Downtown Fort Worth"]];
  function commuteTaxBlock(n) {
    const c = n.commute, t = n.tax, M = DATA.meta || {};
    if (!c && !t) return "";
    const fmt = (r) => r.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    return `<section class="grid grid-2" id="commute-tax" style="margin-top:2.5rem;align-items:start">
      ${c ? `<div class="card ct-card"><span class="eyebrow">Commute</span><h2 style="font-size:var(--step-2)">Drive times from ${esc(n.name)}</h2>
        <div class="ct-list">${CPTS.map(([k, label]) => c[k] ? `<div class="ct-row"><span>${label}</span><strong>${c[k].min <= 2 ? "You're there" : `~${c[k].min} min`}</strong><small>${c[k].mi ? c[k].mi + " mi" : ""}</small></div>` : "").join("")}</div>
        <p class="stamp">${esc(M.commute_source || "")}</p></div>` : ""}
      ${t ? `<div class="card ct-card"><span class="eyebrow">Property taxes</span><h2 style="font-size:var(--step-2)">${t.year} tax rates</h2>
        <div class="table-wrap"><table class="ct-tax"><thead><tr><th>Location</th><th class="num">City</th><th class="num">School district</th><th class="num">County*</th><th class="num">Total</th></tr></thead><tbody>
        ${t.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${fmt(r.city)}</td><td class="num">${fmt(r.isd)}</td><td class="num">${fmt(r.county)}</td><td class="num"><strong>${fmt(r.total)}%</strong></td></tr>`).join("")}
        </tbody></table></div>
        <p class="ct-ex">At ${fmt(t.rows[0].total)}%, every $100,000 of taxable value costs about <strong>${money(t.rows[0].total * 1000)}</strong> a year. A homestead exemption lowers the school district portion once you live in the home.</p>
        ${t.note ? `<p class="muted" style="font-size:.85rem">${esc(t.note)}</p>` : ""}
        <p class="stamp">Rates per $100 of value. *County includes community college and hospital districts where they apply. Not included: MUD/PID or other special districts, which some newer communities add. Source: <a href="${esc(M.tax_source_url || "#")}" target="_blank" rel="noopener">Republic Title 2025 DFW Area Tax Rates</a>. Verify the exact address with the county appraisal district.</p></div>` : ""}
    </section>`;
  }
  function fact(k, v) { return `<div class="fact"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`; }

  function renderDetail(n) {
    const saved = store.get("saved", []);
    const isSaved = saved.includes(n.id);
    const m = n.metrics || {};
    const metric = (v, f) => (v == null ? `<span class="pending">Awaiting MLS snapshot</span>` : f(v));
    detailView.innerHTML = `
      <p><a class="link" href="neighborhoods.html">← All neighborhoods</a></p>
      <header class="detail-head">
        ${n.photo && PHOTOS[n.photo] ? `<figure style="margin:0"><div class="detail-photo" role="img" aria-label="${esc(PHOTOS[n.photo].place)}" style="background-image:url('${photoUrl(PHOTOS[n.photo], 1600)}')"></div><figcaption class="stamp">${esc(PHOTOS[n.photo].place)} · ${photoCredit(PHOTOS[n.photo])}</figcaption></figure>` : ""}
        <span class="eyebrow">${esc(n.submarket)}</span>
        <h1 style="font-size:var(--step-4)">${esc(n.name)}</h1>
        <p class="lede">${esc(n.lifestyle_summary)}</p>
        <div style="display:flex;flex-wrap:wrap;gap:.6rem;align-items:center">
          ${tier(n.price_tier)}
          <button class="btn btn-sm ${isSaved ? "btn-brass" : ""}" type="button" id="save-btn">${isSaved ? "Saved ✓" : "Save area"}</button>
          <a class="btn btn-sm btn-ghost" href="ask.html" id="ask-btn">Ask AI about ${esc(n.name)}</a>
          <button class="btn btn-sm btn-ghost" type="button" data-handoff="area-${esc(n.id)}" data-reason="I'd like help with homes in ${esc(n.name)}.">Talk to a local expert</button>
        </div>
        <span class="stamp">Source: ${esc(n.source)} · last updated ${esc(n.last_updated)}</span>
      </header>
      <div class="facts">
        ${fact("Home types", esc(n.home_types.join(", ")))}
        ${fact("Home age", esc(n.home_age))}
        ${fact("Lots", esc(n.lot_profile))}
        ${fact("HOA", esc(n.hoa))}
        ${fact("Taxes", esc(n.tax_profile))}
        ${fact("School districts", esc(n.isd.join(", ")) + ' <span class="muted" style="font-size:.8rem">(verify by address)</span>')}
      </div>
      <div class="two-col" style="margin-top:2rem">
        <div class="stack" style="gap:1.6rem">
          <section class="stack" style="gap:.5rem"><h2 style="font-size:var(--step-2)">Getting around</h2>${shields(n.routes)}<p>${esc(n.commute_profile)}</p></section>
          <section class="grid grid-2">
            <div class="card"><h3>Strengths</h3><ul class="clean pros">${n.pros.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
            <div class="card"><h3>Tradeoffs</h3><ul class="clean cons">${n.cons.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
          </section>
          <section class="stack" style="gap:.5rem"><h2 style="font-size:var(--step-2)">Nearby</h2><div class="tags">${n.amenities.map((a) => `<span class="tag">${esc(a)}</span>`).join("")}</div></section>
          <section class="stack" style="gap:.5rem"><h2 style="font-size:var(--step-2)">Development watch</h2><p>${esc(n.development)}</p></section>
        </div>
        <aside class="stack">
          <div class="card glance">
            <span class="eyebrow">What it's like</span>
            <h3 style="margin:.2rem 0 .6rem">${esc(n.name)} at a glance</h3>
            ${GLANCE.map(([k, label, words]) => { const v = n.scores[k] ?? 0, lvl = v >= 4 ? 2 : v >= 2 ? 1 : 0; return `<div class="gl-row"><span class="gl-k">${label}</span><strong class="gl-v lv${lvl}">${words[lvl]}</strong><span class="gl-dots" aria-hidden="true">${[0, 1, 2].map((i) => `<i class="${i <= lvl ? "on" : ""}"></i>`).join("")}</span></div>`; }).join("")}
            <p class="muted" style="font-size:.78rem;margin-top:.6rem">Compared with the other DFW areas we cover. It describes the place, not the people.</p>
          </div>
          <div class="card">
            <span class="eyebrow">Often a fit for</span>
            <div class="tags">${n.best_for.map((b) => `<span class="tag">${esc(b)}</span>`).join("")}</div>
            <a class="link" href="tools.html#compare" id="cmp-link">Compare ${esc(n.name)} with another area →</a>
          </div>
        </aside>
      </div>
      ${commuteTaxBlock(n)}
      ${marketBlock(n)}
      <section class="stack" id="schools" style="gap:.6rem;margin-top:2.5rem">
        <div class="sec-head" style="margin-bottom:.4rem"><div><span class="eyebrow">Schools</span><h2 style="font-size:var(--step-3)">Schools in and around ${esc(n.name)}</h2>
        <p class="lede">Official state ratings for every public school nearby, plus private options. Tap any school for its full report card and real parent reviews.</p></div>
        <a class="btn btn-ghost" href="schools.html#${esc(n.id)}">Schools page →</a></div>
        <div id="schools-box"></div>
      </section>`;
    if (window.DREI_SCHOOLS) window.DREI_SCHOOLS.render(document.getElementById("schools-box"), n, { collapsed: true });
    document.getElementById("save-btn").addEventListener("click", (e) => {
      const s = store.get("saved", []);
      const i = s.indexOf(n.id);
      if (i >= 0) s.splice(i, 1); else { s.push(n.id); track("save_neighborhood", { id: n.id }); }
      store.set("saved", s);
      e.target.textContent = i >= 0 ? "Save area" : "Saved ✓";
      e.target.classList.toggle("btn-brass", i < 0);
    });
    document.getElementById("ask-btn").addEventListener("click", () => store.set("pendingQ", `Tell me about ${n.name}`));
    document.getElementById("cmp-link").addEventListener("click", () => store.set("compareIds", [n.id]));
    if (!window.DREI_AREA) document.title = `${n.name} · Dallas Real Estate Internet`;
    track("view_area", { id: n.id });
  }

  function route() {
    const hashId = location.hash.replace("#", "");
    // Old #id links forward to the area's own page.
    if (!window.DREI_AREA && hashId && DATA.neighborhoods.some((x) => x.id === hashId)) { location.replace("areas/" + hashId + ".html"); return; }
    const id = window.DREI_AREA || hashId;
    const n = DATA && DATA.neighborhoods.find((x) => x.id === id);
    if (listView) listView.hidden = !!n;
    detailView.hidden = !n;
    if (n) { renderDetail(n); window.scrollTo(0, 0); } else { document.title = "Neighborhoods · Dallas Real Estate Internet"; renderList(); }
  }

  Promise.all([loadJSON("data/neighborhoods.json"), loadJSON("data/photos.json").catch(() => ({})), loadJSON("data/market.json").catch(() => null)]).then(([d, P, MK]) => {
    DATA = d; PHOTOS = P; MARKET = MK;
    ["f-q", "f-tier", "f-sort"].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener("input", renderList); });
    window.addEventListener("hashchange", route);
    route();
  }).catch(() => { const a = document.getElementById("areas"); if (a) a.innerHTML = `<p class="muted">Couldn't load neighborhood data. Refresh to try again.</p>`; });
})();
