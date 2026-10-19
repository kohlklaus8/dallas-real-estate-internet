/*
 * Map + numbered list guide (the layout big city guides like Eater use): plain dropdown filters,
 * a numbered list on one side and a map with matching numbered pins on the other.
 * Data: explore.json eat / drink / do entries
 *   { name, area, hood, kind, why, known_for, address, website, lat, lon, reviews }
 */
(function () {
  const { esc } = window.DREI;
  const maps = (q) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  const dirs = (q) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(q);
  let leafletReady = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((res, rej) => {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    return leafletReady;
  }

  /**
   * groups: [{ label, items }]  e.g. [{label:"Restaurants", items:E.eat}, {label:"Bars & breweries", items:E.drink}]
   */
  function mount(el, { title, lede, groups, idp }) {
    const all = groups.flatMap((g) => g.items.map((p) => ({ ...p, group: g.label })));
    const areas = [...new Set(all.map((p) => p.area).filter(Boolean))].sort();
    const kinds = [...new Set(all.map((p) => p.kind))].sort();
    el.innerHTML = `
      <div class="sec-head"><div><h2>${esc(title)}</h2><p class="lede">${esc(lede)}</p></div></div>
      <div class="pg-filters">
        <label>Where<select id="${idp}-area"><option value="">All of DFW</option>${areas.map((a) => `<option>${esc(a)}</option>`).join("")}</select></label>
        <label>What<select id="${idp}-kind"><option value="">Everything</option>
          ${groups.length > 1 ? groups.map((g) => `<option value="group:${esc(g.label)}">All ${esc(g.label.toLowerCase())}</option>`).join("") : ""}
          <option disabled>──────────</option>${kinds.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join("")}</select></label>
        <span class="pg-count" id="${idp}-count"></span>
      </div>
      <div class="pg">
        <ol class="pg-list" id="${idp}-list"></ol>
        <div class="pg-mapwrap"><div class="pg-map" id="${idp}-map" role="region" aria-label="Map of places"></div></div>
      </div>
      <p class="stamp" style="margin-top:1rem">Hours, prices and menus change. Tap "Hours &amp; reviews" for current details on Google. Map © OpenStreetMap contributors.</p>`;

    const listEl = el.querySelector(`#${idp}-list`);
    const selA = el.querySelector(`#${idp}-area`), selK = el.querySelector(`#${idp}-kind`);
    let map = null, layer = null, markers = [];

    function filtered() {
      const a = selA.value, k = selK.value;
      return all.filter((p) => (!a || p.area === a) && (!k || (k.startsWith("group:") ? p.group === k.slice(6) : p.kind === k)));
    }

    function draw() {
      const rows = filtered();
      el.querySelector(`#${idp}-count`).textContent = `${rows.length} place${rows.length === 1 ? "" : "s"}`;
      listEl.innerHTML = rows.map((p, i) => {
        const where = [p.hood, p.area].filter(Boolean).join(", ");
        const q = `${p.name} ${p.address || p.area + " TX"}`;
        return `<li class="pg-item" data-i="${i}">
          <span class="pg-num" aria-hidden="true">${i + 1}</span>
          <div class="pg-body">
            <h3>${esc(p.name)}</h3>
            <p class="pg-meta">${esc(p.kind)} · ${esc(where)}${p.price ? ` · ${esc(p.price)}` : ""}</p>
            <p>${esc(p.why)}</p>
            ${p.known_for ? `<p class="pg-known"><strong>Known for:</strong> ${esc(p.known_for)}</p>` : ""}
            ${p.address ? `<p class="pg-addr">${esc(p.address)}</p>` : ""}
            <div class="pg-actions">
              <a class="btn btn-sm" href="${dirs(p.address || q)}" target="_blank" rel="noopener">Directions</a>
              <a class="btn btn-sm btn-ghost" href="${esc(p.reviews || maps(q))}" target="_blank" rel="noopener">Hours &amp; reviews</a>
              ${p.website ? `<a class="btn btn-sm btn-ghost" href="${esc(p.website)}" target="_blank" rel="noopener">Website</a>` : ""}
            </div>
          </div></li>`;
      }).join("") || `<li class="muted" style="list-style:none">Nothing here yet. Try "All of DFW".</li>`;

      listEl.querySelectorAll(".pg-item").forEach((li) => {
        li.addEventListener("mouseenter", () => focus(+li.dataset.i, false));
        li.addEventListener("click", (e) => { if (!e.target.closest("a")) focus(+li.dataset.i, true); });
      });

      if (!map) return;
      layer.clearLayers(); markers = [];
      const pts = [];
      rows.forEach((p, i) => {
        if (p.lat == null) { markers.push(null); return; }
        const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "pg-pin", html: `<span>${i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }), title: p.name })
          .addTo(layer).on("click", () => { focus(i, false); const li = listEl.querySelector(`[data-i="${i}"]`); li && li.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
        markers.push(m); pts.push([p.lat, p.lon]);
      });
      if (pts.length === 1) map.setView(pts[0], 14);
      else if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 13 });
    }

    function focus(i, pan) {
      listEl.querySelectorAll(".pg-item").forEach((li) => li.classList.toggle("on", +li.dataset.i === i));
      markers.forEach((m, j) => m && m.getElement() && m.getElement().classList.toggle("on", j === i));
      if (pan && markers[i]) map.panTo(markers[i].getLatLng());
    }

    selA.addEventListener("change", draw);
    selK.addEventListener("change", draw);
    draw();
    loadLeaflet().then(() => {
      map = L.map(el.querySelector(`#${idp}-map`), { scrollWheelZoom: false }).setView([32.9, -96.9], 9);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
      layer = L.layerGroup().addTo(map);
      draw();
    }).catch(() => { el.querySelector(".pg-mapwrap").hidden = true; });
  }

  window.DREI_PLACES = { mount };
})();
