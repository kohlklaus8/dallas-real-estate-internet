(function () {
  const { esc, loadJSON, photoUrl, photoCredit, track } = window.DREI;
  const TABS = ["developments", "eat", "markets", "festivals", "do", "sports", "calendar", "follow"];
  let E = null;
  const fmtDate = (iso, opts = { month: "short", day: "numeric", year: "numeric" }) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", opts);
  const STATUS = { "Open": "ok", "Complete": "ok", "Under construction": "build", "Scheduled": "plan", "Planned": "plan", "Stalled": "stall" };

  function developments() {
    const cities = [...new Set(E.developments.map((d) => d.city))];
    return `<div class="sec-head"><div><h2>What's being built</h2><p class="lede">Major projects shaping where people live, work and play. Follow the line from what just opened to what's coming next. Swipe or scroll sideways to see more.</p></div></div>
      <div class="pg-filters"><label>Where<select id="dev-filter"><option value="">All of DFW</option>${cities.sort().map((c) => `<option>${esc(c)}</option>`).join("")}</select></label></div>
      <div id="devs">${window.DREI_DEVS.render(E.developments)}</div>`;
  }
  function places(list, title, lede) {
    return `<div class="sec-head"><div><h2>${title}</h2><p class="lede">${lede}</p></div></div>
      <div class="places">${list.map((r) => `
        <article class="place">
          <span class="tag">${esc(r.kind)}</span>
          <h3>${esc(r.name)}</h3>
          <span class="dev-city">${esc(r.city)}</span>
          <p>${esc(r.why)}</p>
          ${r.reviews ? `<a class="link" href="${esc(r.reviews)}" target="_blank" rel="noopener">Hours &amp; reviews on Google ↗</a>` : r.url ? `<a class="link" href="${esc(r.url)}" target="_blank" rel="noopener">Visit ↗</a>` : ""}
        </article>`).join("")}</div>`;
  }
  function sports() {
    return `<div class="sec-head"><div><h2>Game day</h2><p class="lede">DFW has a team in every major league. Schedules link to each team's official site.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Team</th><th>League</th><th>Home</th><th></th></tr></thead><tbody>
      ${E.sports.map((t) => `<tr><td><strong>${esc(t.team)}</strong></td><td>${esc(t.league)}</td><td>${esc(t.venue)}</td><td><a class="link" href="${esc(t.url)}" target="_blank" rel="noopener">Schedule ↗</a></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  function follow() {
    return `<div class="sec-head"><div><h2>Follow local</h2><p class="lede">Accounts we like for finding new restaurants, events and local news.</p></div></div>
      <div class="social">${E.social.map((s) => `
        <a class="soc" href="${esc(s.url)}" target="_blank" rel="noopener">
          <span class="ig" aria-hidden="true"></span>
          <span><b>${esc(s.name)}</b><small>@${esc(s.handle)} · ${esc(s.platform)}</small><span>${esc(s.about)}</span></span>
        </a>`).join("")}</div>`;
  }

  // ---- festivals ----
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const gsearch = (q) => "https://www.google.com/search?q=" + encodeURIComponent(q);
  function festivals() {
    const F = E.festivals || [];
    const today = new Date().toISOString().slice(0, 10);
    const areas = [...new Set(F.map((f) => f.area))].sort();
    const kinds = [...new Set(F.map((f) => f.kind))].sort();
    const next = F.filter((f) => f.start && (f.end || f.start) >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);
    return `<div class="sec-head"><div><h2>Festivals &amp; annual events</h2><p class="lede">The big yearly traditions in each city, month by month. Dates shift a little each year, so check the organizer's site before you go.</p></div></div>
      ${next.length ? `<h3 style="font-size:1.1rem;margin:.2rem 0 .6rem">Coming up next</h3><div class="fest-next">${next.map((f) => `<a class="evrow" href="${esc(f.url || gsearch(f.name + " " + f.area + " TX"))}" target="_blank" rel="noopener"><span class="evdate"><b>${fmtDate(f.start, { month: "short" })}</b>${fmtDate(f.start, { day: "numeric" })}</span><span><strong>${esc(f.name)}</strong><small>${esc(f.area)} · ${esc(f.place)}</small></span></a>`).join("")}</div>` : ""}
      <div class="pg-filters" style="margin-top:1.4rem">
        <label>Where<select id="fe-area"><option value="">All of DFW</option>${areas.map((a) => `<option>${esc(a)}</option>`).join("")}</select></label>
        <label>What<select id="fe-kind"><option value="">Everything</option>${kinds.map((k) => `<option>${esc(k)}</option>`).join("")}</select></label>
        <span class="pg-count" id="fe-count"></span>
      </div>
      <div id="fe-list"></div>`;
  }
  function drawFestivals(p) {
    const a = p.querySelector("#fe-area").value, k = p.querySelector("#fe-kind").value;
    const rows = (E.festivals || []).filter((f) => (!a || f.area === a) && (!k || f.kind === k));
    p.querySelector("#fe-count").textContent = `${rows.length} event${rows.length === 1 ? "" : "s"}`;
    const by = {};
    rows.forEach((f) => (by[f.month] = by[f.month] || []).push(f));
    p.querySelector("#fe-list").innerHTML = Object.keys(by).map(Number).sort((x, y) => x - y).map((m) => `
      <section class="fest-month"><h3>${MONTHS[m - 1]}</h3><div class="fest-grid">${by[m].map((f) => `
        <article class="card fest">
          <span class="tag">${esc(f.kind)}</span>
          <h4>${esc(f.name)}</h4>
          <p class="muted" style="margin:0">${esc(f.area)} · ${esc(f.place)}</p>
          <p style="margin:.35rem 0 0"><strong>Usually:</strong> ${esc(f.usually)}</p>
          <p class="muted" style="margin:.1rem 0 .5rem;font-size:.88rem">${esc(f.latest)}</p>
          <a class="link" href="${esc(f.url || gsearch(f.name + " " + f.area + " TX"))}" target="_blank" rel="noopener">${f.url ? "Official info" : "Search for details"} ↗</a>
        </article>`).join("")}</div></section>`).join("") || `<p class="muted">Nothing here yet. Try "All of DFW".</p>`;
  }

  // ---- calendar ----
  let month = null;
  function inRange(e, iso) { return iso >= e.start && iso <= (e.end || e.start); }
  function calendar() {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = E.events.filter((e) => (e.end || e.start) >= today).sort((a, b) => a.start.localeCompare(b.start));
    if (!month) { const first = upcoming[0] ? upcoming[0].start : today; month = (first < today ? today : first).slice(0, 7); }
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), lead = first.getDay();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(`<div class="cal-cell empty"></div>`);
    for (let d = 1; d <= days; d++) {
      const iso = `${month}-${String(d).padStart(2, "0")}`;
      const ev = E.events.filter((e) => inRange(e, iso));
      cells.push(`<div class="cal-cell${iso === today ? " today" : ""}${ev.length ? " has" : ""}"><span class="d">${d}</span>${ev.slice(0, 2).map((e) => `<a href="${esc(e.url)}" target="_blank" rel="noopener" class="cal-ev" title="${esc(e.name)}">${esc(e.name)}</a>`).join("")}${ev.length > 2 ? `<span class="more">+${ev.length - 2}</span>` : ""}</div>`);
    }
    const label = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return `<div class="sec-head"><div><h2>Events calendar</h2><p class="lede">Big local events, festivals and seasons. Always confirm details with the organizer.</p></div></div>
      <div class="cal-wrap">
        <div class="cal">
          <div class="cal-nav"><button class="btn btn-ghost btn-sm" type="button" data-mv="-1" aria-label="Previous month">←</button><strong>${label}</strong><button class="btn btn-ghost btn-sm" type="button" data-mv="1" aria-label="Next month">→</button></div>
          <div class="cal-grid">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="cal-dow">${d}</div>`).join("")}${cells.join("")}</div>
        </div>
        <div class="cal-list"><h3>Coming up</h3>${upcoming.map((e) => `
          <a class="evrow" href="${esc(e.url)}" target="_blank" rel="noopener">
            <span class="evdate"><b>${fmtDate(e.start, { month: "short" })}</b>${fmtDate(e.start, { day: "numeric" })}</span>
            <span><strong>${esc(e.name)}</strong><small>${esc(e.city)} · ${fmtDate(e.start)}${e.end ? ` – ${fmtDate(e.end)}` : ""}</small></span>
          </a>`).join("") || `<p class="muted">New events are being added.</p>`}</div>
      </div>`;
  }

  function render(tab) {
    const p = document.querySelector(`[data-p="${tab}"]`);
    if (tab === "developments") p.innerHTML = developments();
    if (tab === "eat") window.DREI_PLACES.mount(p, { idp: "eat", title: "Eat & drink", lede: "Local favorites in every corner of DFW. Pick a city, then tap Directions or Hours & reviews.", groups: [{ label: "Restaurants", items: E.eat }, { label: "Bars & breweries", items: E.drink }] });
    if (tab === "markets") window.DREI_PLACES.mount(p, { idp: "mk", title: "Farmers markets", lede: "Weekend farmers markets, evening markets and daily produce stands across DFW, with days, hours and seasons. Pick a city to see what's closest.", groups: [{ label: "Markets", items: E.markets || [] }], note: "Market days and hours change with the seasons and the weather. Check the market's site or social page before you go." });
    if (tab === "festivals") { p.innerHTML = festivals(); const d = () => drawFestivals(p); p.querySelector("#fe-area").addEventListener("change", d); p.querySelector("#fe-kind").addEventListener("change", d); const pre = new URLSearchParams(location.search).get("area"); if (pre) { const sel = p.querySelector("#fe-area"); if ([...sel.options].some((o) => o.value === pre)) sel.value = pre; } d(); }
    if (tab === "do") window.DREI_PLACES.mount(p, { idp: "do", title: "Things to do", lede: "Parks, museums, downtowns and weekend outings from Fort Worth to Rockwall.", groups: [{ label: "Things to do", items: E.do }] });
    if (tab === "sports") p.innerHTML = sports();
    if (tab === "calendar") p.innerHTML = calendar();
    if (tab === "follow") p.innerHTML = follow();
    if (tab === "developments") p.querySelector("#dev-filter").addEventListener("change", (e) => window.DREI_DEVS.filter(p.querySelector("#devs"), e.target.value));
    if (tab === "calendar") p.querySelectorAll("[data-mv]").forEach((b) => b.addEventListener("click", () => {
      const [y, m] = month.split("-").map(Number); const d = new Date(y, m - 1 + Number(b.dataset.mv), 1);
      month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; render("calendar");
    }));
  }
  function show() {
    let t = location.hash.replace("#", ""); if (!TABS.includes(t)) t = "developments";
    document.querySelectorAll(".xtabs a").forEach((a) => a.setAttribute("aria-selected", String(a.dataset.t === t)));
    document.querySelectorAll(".xpanel").forEach((s) => (s.hidden = s.dataset.p !== t));
    render(t); track("explore_tab", { t });
  }

  Promise.all([loadJSON("data/explore.json"), loadJSON("data/photos.json").catch(() => ({}))]).then(([data, P]) => {
    E = data;
    document.getElementById("checked").textContent = `Last checked ${fmtDate(E.last_checked)}. Details change, so confirm before you go.`;
    const h = P["fort-worth-skyline"];
    if (h) { document.getElementById("hero").classList.add("has-photo"); document.getElementById("hero-photo").style.backgroundImage = `url('${photoUrl(h, 1800)}')`; document.getElementById("hero-credit").innerHTML = photoCredit(h); }
    window.addEventListener("hashchange", show); show();
  });
})();
