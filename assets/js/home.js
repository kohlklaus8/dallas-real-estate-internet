(function () {
  const { C, esc, store, track, loadJSON, photoUrl, photoCredit, areaCard, GRADS } = window.DREI;
  const q = document.getElementById("hero-q");
  const go = (text) => { text = String(text || "").trim(); if (!text) { q.focus(); return; } store.set("pendingQ", text); track("ask", { from: "home" }); location.href = "ask.html"; };
  document.getElementById("hero-form").addEventListener("submit", (e) => { e.preventDefault(); go(q.value); });
  document.querySelectorAll("#hero-chips button").forEach((b) => b.addEventListener("click", () => go(b.textContent)));

  document.getElementById("ag-line").textContent = `${C.AGENT_NAME}, ${C.AGENT_TITLE} · ${C.BROKER_NAME} · your local guide to buying, selling and moving in DFW`;

  // Relocation guide signup (lead magnet): emails the PDF link automatically.
  window.DREI.guideForm(document.getElementById("guide-form"), document.getElementById("g-msg"), "home-guide");

  loadJSON("data/explore.json").then((E) => {
    const today = new Date().toISOString().slice(0, 10);
    const fd = (iso, o) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", o);
    const ev = E.events.filter((e) => (e.end || e.start) >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
    document.getElementById("home-events").innerHTML = ev.map((e) => `<a class="evrow" href="${esc(e.url)}" target="_blank" rel="noopener"><span class="evdate"><b>${fd(e.start, { month: "short" })}</b>${fd(e.start, { day: "numeric" })}</span><span><strong>${esc(e.name)}</strong><small>${esc(e.city)}</small></span></a>`).join("");
    document.getElementById("home-devs").innerHTML = window.DREI_DEVS.render(E.developments, { compact: true });
    document.getElementById("home-follow").innerHTML = E.social.slice(0, 6).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener"><i aria-hidden="true"></i>@${esc(s.handle)}</a>`).join("");
  }).catch(() => {});

  Promise.all([loadJSON("data/photos.json"), loadJSON("data/neighborhoods.json"), loadJSON("data/articles.json")]).then(([P, N, A]) => {
    const hero = P["dallas-skyline"];
    if (hero) {
      document.getElementById("hero").classList.add("has-photo");
      document.getElementById("hero-photo").style.backgroundImage = `url('${photoUrl(hero, 1800)}')`;
      document.getElementById("hero-credit").innerHTML = photoCredit(hero);
    }

    document.getElementById("all-areas").textContent = `All ${N.neighborhoods.length} areas →`;
    const FEATURED = ["frisco", "fort-worth", "mckinney", "arlington", "rockwall", "richardson"];
    const grid = document.getElementById("area-grid");
    const render = (f) => {
      const list = f === "all" ? FEATURED.map((id) => N.neighborhoods.find((n) => n.id === id)).filter(Boolean)
        : [...N.neighborhoods].sort((a, b) => b.scores[f] - a.scores[f] || a.name.localeCompare(b.name)).slice(0, 6);
      grid.innerHTML = list.map((n, i) => areaCard(n, P, N.neighborhoods.indexOf(n))).join("");
    };
    const btns = [...document.querySelectorAll("#pfilters button")];
    btns.forEach((b) => b.addEventListener("click", () => { btns.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render(b.dataset.f); track("filter_areas", { f: b.dataset.f }); }));
    render("all");

    const S = A.sections || {};
    const latest = [...A.articles].sort((a, b) => (b.photo ? 1 : 0) - (a.photo ? 1 : 0) || b.date.localeCompare(a.date)).slice(0, 3);
    document.getElementById("posts").innerHTML = latest.map((a, i) => {
      const p = a.photo ? P[a.photo] : null;
      return `<a class="post" href="guides/${esc(a.slug)}.html">
        <div class="ph" style="${p ? `background-image:url('${photoUrl(p, 700)}')` : `background:linear-gradient(140deg,${GRADS[i]})`}"${p ? ` role="img" aria-label="${esc(p.place)}"` : ""}></div>
        <span class="cat">${esc((S[a.section] || {}).name || a.format)}</span><h3>${esc(a.title)}</h3><p>${esc(a.dek)}</p></a>`;
    }).join("");
  }).catch(() => {});
})();
