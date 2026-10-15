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

  function fact(k, v) { return `<div class="fact"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`; }

  function renderDetail(n) {
    const saved = store.get("saved", []);
    const isSaved = saved.includes(n.id);
    const m = n.metrics || {};
    const metric = (v, f) => (v == null ? `<span class="pending">Awaiting MLS snapshot</span>` : f(v));
    detailView.innerHTML = `
      <p><a class="link" href="#">← All neighborhoods</a></p>
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
        ${fact("Median price", metric(m.median_price, money))}
        ${fact("Inventory", metric(m.inventory, (v) => v))}
        ${fact("Days on market", metric(m.days_on_market, (v) => v))}
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
          <div class="card">
            <span class="eyebrow">Area profile</span>
            <p class="muted" style="font-size:.82rem">Relative 0–5 within our coverage area. These are not ratings.</p>
            ${Object.keys(KEY_LABEL).map((k) => `<div class="score-row"><span>${esc(KEY_LABEL[k])}</span><span class="bar"><span style="width:${(n.scores[k] / 5) * 100}%"></span></span><span class="num">${n.scores[k]}</span></div>`).join("")}
          </div>
          <div class="card">
            <span class="eyebrow">Often a fit for</span>
            <div class="tags">${n.best_for.map((b) => `<span class="tag">${esc(b)}</span>`).join("")}</div>
            <a class="link" href="tools.html#compare" id="cmp-link">Compare ${esc(n.name)} with another area →</a>
          </div>
        </aside>
      </div>`;
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
    document.title = `${n.name} · Dallas Real Estate Internet`;
    track("view_area", { id: n.id });
  }

  function route() {
    const id = location.hash.replace("#", "");
    const n = DATA && DATA.neighborhoods.find((x) => x.id === id);
    listView.hidden = !!n;
    detailView.hidden = !n;
    if (n) { renderDetail(n); window.scrollTo(0, 0); } else { document.title = "Neighborhoods · Dallas Real Estate Internet"; renderList(); }
  }

  Promise.all([loadJSON("data/neighborhoods.json"), loadJSON("data/photos.json").catch(() => ({}))]).then(([d, P]) => {
    DATA = d; PHOTOS = P;
    ["f-q", "f-tier", "f-sort"].forEach((id) => document.getElementById(id).addEventListener("input", renderList));
    window.addEventListener("hashchange", route);
    route();
  }).catch(() => { document.getElementById("areas").innerHTML = `<p class="muted">Couldn't load neighborhood data. Refresh to try again.</p>`; });
})();
