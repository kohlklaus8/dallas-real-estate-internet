/*
 * Home search: map + list, Texas-true monthly cost, sold prices behind a free account (VOW),
 * saved homes, email alerts, commute times, official TEA school ratings, FEMA flood zones.
 *
 * Data source (config.js → LISTINGS_SOURCE):
 *   "sample"  made-up homes around real area centers (default until the MLS feed is approved)
 *   "worker"  live listings from the Worker's /listings route (RESO Web API feed)
 * Accounts use the Worker's /vow/* routes when it has an account store; otherwise they fall back to
 * this device and the sign-up still goes to Kohl as a lead.
 */
(function () {
  "use strict";
  const D = window.DREI, C = D.C, { esc, store, track } = D;
  const $ = (id) => document.getElementById(id);
  const API = (C.AI_WORKER_URL || "").replace(/\/$/, "");
  const LIVE = C.LISTINGS_SOURCE === "worker" && !!API;
  const REMOTE_ACCOUNTS = !!API && C.SEARCH_ACCOUNTS !== "device";
  const ASSUME = { down: 0.2, rate: +(C.SEARCH_RATE || 6.5), years: 30, insPct: 0.8, mudExtra: 0.75 };
  // Commute points match data/neighborhoods.json (drive times there come from OSRM routing).
  const POINTS = [
    { id: "downtown_dallas", name: "Downtown Dallas", short: "Downtown Dallas", lat: 32.7811, lng: -96.797 },
    { id: "legacy_plano", name: "Legacy West, Plano", short: "Legacy West", lat: 33.079, lng: -96.8275 },
    { id: "dfw_airport", name: "DFW Airport", short: "DFW Airport", lat: 32.8998, lng: -97.0403 },
    { id: "downtown_fw", name: "Downtown Fort Worth", short: "Downtown FW", lat: 32.7555, lng: -97.3308 },
  ];
  const HOUSE = `<svg class="house" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>`;
  const HEART = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z"/></svg>`;

  let AREAS = [], RAW = [], results = [], mode = "sale", savedView = false, map, layer, workLayer, markers = {}, pending = null;
  let liveTimer = null, liveSeq = 0, liveState = { signin: false, capped: false, error: false };
  let session = store.get("vowSession", null);
  let saved = new Set(store.get("savedHomes", []));
  let snaps = store.get("savedSnaps", {});
  let alerts = store.get("searchAlerts", []);
  const byKey = new Map();

  // ---------- formatting ----------
  const money = (n) => (isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "—");
  const short = (n) => (n >= 1e6 ? "$" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : "$" + Math.round(n / 1e3) + "K");
  const s = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const addr = (l) => [l.StreetNumber, l.StreetName, l.StreetSuffix].filter(Boolean).join(" ") + (l.UnitNumber ? " #" + l.UnitNumber : "");
  const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
  const median = (a) => { if (!a.length) return 0; const v = [...a].sort((x, y) => x - y), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const isSold = (l) => l.StandardStatus === "Closed";
  const isPend = (l) => l.StandardStatus === "Pending";
  const priceOf = (l) => (isSold(l) ? l.ClosePrice : l.ListPrice) || 0;
  const canSeeSold = () => !!session && session.soldAccess !== false;
  const hue = (k) => { let h = 0; for (const c of String(k)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const safePhoto = (u) => /^https:\/\/[^\s'"()<>\\]+$/.test(String(u || ""));
  const phStyle = (l) => (safePhoto(l.Photo) ? `background-image:url('${esc(l.Photo)}')` : `background:linear-gradient(135deg,hsl(${hue(l.ListingKey)} 60% 84%),hsl(${(hue(l.ListingKey) + 35) % 360} 65% 70%));color:#0f1b33`);
  function miles(a, b, c, d) { const R = 3958.8, r = (x) => (x * Math.PI) / 180, dLa = r(c - a), dLo = r(d - b); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }

  // ---------- Texas enrichment ----------
  function areaFor(l) {
    if (l._area !== undefined) return l._area;
    let best = null, bs = 1e9;
    for (const a of AREAS) {
      if (!a.geo || !l.Latitude) continue;
      const d = miles(l.Latitude, l.Longitude, a.geo.lat, a.geo.lon), r = a.geo.radius_mi || 3;
      const sc = d / r - ((a.zips || []).includes(String(l.PostalCode)) ? 0.5 : 0);
      if (d <= r * 1.8 && sc < bs) { bs = sc; best = a; }
    }
    return (l._area = best);
  }
  function taxRate(l) {
    if (l._tax != null) return l._tax;
    const a = areaFor(l), rows = (a && a.tax && a.tax.rows) || [];
    const row = rows.find((r) => l.CountyOrParish && r.label.toLowerCase().includes(String(l.CountyOrParish).toLowerCase())) || rows[0];
    const base = row ? row.total : 2.2;
    return (l._tax = +(base + (l.MUD ? ASSUME.mudExtra : 0)).toFixed(2));
  }
  function monthly(l, price) {
    const L = price * (1 - ASSUME.down), r = ASSUME.rate / 1200, n = ASSUME.years * 12, pi = r ? (L * r) / (1 - Math.pow(1 + r, -n)) : L / n;
    const tax = (price * taxRate(l)) / 100 / 12, ins = (price * ASSUME.insPct) / 100 / 12, hoa = +l.AssociationFee || 0;
    return { pi, tax, ins, hoa, total: pi + tax + ins + hoa };
  }
  function driveMin(l, p) {
    const a = areaFor(l), c = a && a.commute && a.commute[p.id];
    if (c && a.geo) {
      const dA = miles(a.geo.lat, a.geo.lon, p.lat, p.lng), dL = miles(l.Latitude, l.Longitude, p.lat, p.lng);
      return Math.max(6, Math.round(dA > 1 ? c.min * (dL / dA) : c.min));
    }
    return Math.round((miles(l.Latitude, l.Longitude, p.lat, p.lng) * 1.25 / 50) * 60 + 5);
  }
  const work = () => POINTS.find((p) => p.id === $("fWork").value);
  const inFlood = (l) => /^(A|V)/.test(String(l.FloodZone || ""));
  const totalDays = (l) => Math.max(l.CumulativeDaysOnMarket || 0, l.DaysOnMarket || 0);
  function heads(l) {
    const h = [];
    if (inFlood(l)) h.push({ t: "In a flood zone", d: `FEMA zone ${esc(l.FloodZone)}. Your lender will likely require flood insurance. Get a quote before you offer.`, bad: 1, s: "Flood zone" });
    if (l.MUD) h.push({ t: "Higher property taxes", d: `This home is in an extra tax district (MUD/PID), so the total rate is about ${taxRate(l)}%. <a class="link" href="guides/muds-and-pids-explained.html">What's a MUD?</a>`, bad: 1, s: "Higher taxes" });
    if ((l.CumulativeDaysOnMarket || 0) > (l.DaysOnMarket || 0) + 3) h.push({ t: "Relisted", d: `It was taken off the market and put back on, which resets the day count. It's really been for sale about ${totalDays(l)} days.`, bad: 1, s: "Relisted" });
    if (!isSold(l) && l.OriginalListPrice > l.ListPrice) h.push({ t: "Price dropped " + short(l.OriginalListPrice - l.ListPrice), d: `Originally listed at ${money(l.OriginalListPrice)}. The seller may be open to offers.`, bad: 0, s: "Price drop " + short(l.OriginalListPrice - l.ListPrice) });
    return h;
  }
  function timeline(l) {
    const ev = [], start = l.OnMarketDate || l.ListingContractDate;
    if (start) ev.push([start, totalDays(l) > (l.DaysOnMarket || 0) + 3 ? "Relisted" : "Listed", l.OriginalListPrice || l.ListPrice, totalDays(l) > (l.DaysOnMarket || 0) + 3]);
    if (l.OriginalListPrice > l.ListPrice && start) ev.push([new Date(Date.parse(start) + ((l.DaysOnMarket || 10) / 2) * 864e5).toISOString(), "Price dropped", l.ListPrice]);
    if (l.PurchaseContractDate || isPend(l)) ev.push([l.PurchaseContractDate || "", "Under contract", l.ListPrice]);
    if (isSold(l)) ev.push([l.CloseDate, "Sold", l.ClosePrice]);
    return ev.sort((a, b) => (Date.parse(b[0]) || 9e15) - (Date.parse(a[0]) || 9e15));
  }

  // ---------- filters ----------
  [200, 300, 400, 500, 600, 700, 800, 1000, 1250, 1500, 2000, 3000].forEach((k) => { const v = k * 1000; $("fMax").add(new Option("Under " + short(v), v)); $("fMin").add(new Option(short(v) + "+", v)); });
  [2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000].forEach((v) => $("fPay").add(new Option("Under $" + v.toLocaleString() + "/mo", v)));
  POINTS.forEach((p) => $("fWork").add(new Option(p.name, p.id)));
  const FIDS = ["fMin", "fMax", "fBeds", "fBaths", "fType", "fSoldWithin", "fPend", "fSort", "fBounds", "fPay", "fNoMud", "fNoHoa", "fNoFlood", "fWork", "fDrive"];
  FIDS.forEach((id) => $(id).addEventListener("change", () => { if (id === "fWork" && $("fWork").value && $("fSort").value === "new") $("fSort").value = "drive"; savedView = false; refresh(); }));
  $("moreBtn").addEventListener("click", () => { const m = $("more"); m.hidden = !m.hidden; $("moreBtn").setAttribute("aria-expanded", String(!m.hidden)); });
  $("clearBtn").addEventListener("click", resetAll);
  $("tSale").addEventListener("click", () => setMode("sale"));
  $("tSold").addEventListener("click", () => setMode("sold"));
  $("searchForm").addEventListener("submit", (e) => { e.preventDefault(); savedView = false; doSearch(); });
  $("savedBtn").addEventListener("click", toggleSavedView);
  $("acctBtn").addEventListener("click", () => (session ? signOut() : openVow("sold")));
  $("mobBtn").addEventListener("click", () => { const on = document.body.classList.toggle("showmap"); $("mobBtn").textContent = on ? "Show list" : "Show map"; if (on && map) setTimeout(() => map.invalidateSize(), 60); });

  function setMode(m) {
    mode = m; savedView = false;
    $("tSale").classList.toggle("on", m === "sale"); $("tSold").classList.toggle("on", m === "sold");
    $("tSale").setAttribute("aria-selected", String(m === "sale")); $("tSold").setAttribute("aria-selected", String(m === "sold"));
    $("soldChip").hidden = m !== "sold"; $("payChip").hidden = m !== "sale"; $("pendWrap").hidden = m !== "sale";
    closeDrawer(); refresh();
    if (m === "sold" && !canSeeSold()) setTimeout(() => openVow("sold"), 250);
  }
  function queryArea() {
    const q = $("q").value.trim().toLowerCase();
    if (!q) return null;
    return AREAS.find((a) => a.name.toLowerCase() === q || a.id === q.replace(/\s+/g, "-")) || AREAS.find((a) => (a.zips || []).includes(q)) || AREAS.find((a) => String(a.city || "").toLowerCase() === q && a.name.toLowerCase().startsWith(q)) || null;
  }
  function filters() {
    return { mode, q: $("q").value.trim(), min: +$("fMin").value || null, max: +$("fMax").value || null, beds: +$("fBeds").value || 0, baths: +$("fBaths").value || 0, type: $("fType").value, days: +$("fSoldWithin").value, pending: $("fPend").checked, pay: +$("fPay").value || null, noMud: $("fNoMud").checked, noHoa: $("fNoHoa").checked, noFlood: $("fNoFlood").checked, work: $("fWork").value, drive: +$("fDrive").value || null };
  }
  function clientFilter(list, useBounds = true) {
    const f = filters(), q = f.q.toLowerCase(), qa = queryArea(), w = work();
    const b = useBounds && $("fBounds").checked && map && $("mapWrap").offsetWidth > 0 ? map.getBounds() : null;
    return list.filter((l) => {
      if (mode === "sale") { if (!(l.StandardStatus === "Active" || (f.pending && isPend(l)))) return false; if (f.pay && monthly(l, l.ListPrice).total > f.pay) return false; }
      else { if (!isSold(l)) return false; if ((Date.now() - Date.parse(l.CloseDate)) / 864e5 > f.days) return false; }
      const p = priceOf(l);
      if ((f.min && p < f.min) || (f.max && p > f.max)) return false;
      if ((l.BedroomsTotal || 0) < f.beds || (l.BathroomsTotalInteger || 0) < f.baths) return false;
      if (f.type && !String(l.PropertySubType || "").startsWith(f.type === "Condo" ? "Condo" : f.type)) return false;
      if (f.noMud && l.MUD) return false;
      if (f.noHoa && +l.AssociationFee > 0) return false;
      if (f.noFlood && inFlood(l)) return false;
      if (f.drive && w && driveMin(l, w) > f.drive) return false;
      if (q && !(qa && areaFor(l) === qa) && !`${addr(l)} ${l.City} ${l.PostalCode}`.toLowerCase().includes(q)) return false;
      if (b && !b.contains([l.Latitude, l.Longitude])) return false;
      return true;
    }).sort((x, y) => {
      const so = $("fSort").value;
      if (so === "plo") return priceOf(x) - priceOf(y);
      if (so === "phi") return priceOf(y) - priceOf(x);
      if (so === "ppsf") return priceOf(x) / (x.LivingArea || 1) - priceOf(y) / (y.LivingArea || 1);
      if (so === "drive" && w) return driveMin(x, w) - driveMin(y, w);
      return mode === "sold" ? Date.parse(y.CloseDate) - Date.parse(x.CloseDate) : (x.DaysOnMarket || 0) - (y.DaysOnMarket || 0);
    });
  }
  function markSet() {
    ["fMax", "fBeds", "fPay"].forEach((id) => $(id).classList.toggle("set", !!+$(id).value));
    $("fWork").classList.toggle("set", !!$("fWork").value);
    const more = !!(+$("fDrive").value || +$("fMin").value || +$("fBaths").value || $("fType").value || $("fSort").value !== "new" || $("fNoMud").checked || $("fNoHoa").checked || $("fNoFlood").checked || !$("fPend").checked);
    $("moreBtn").classList.toggle("set", more); $("moreBtn").textContent = more ? "More filters ●" : "More filters";
    $("clearBtn").hidden = !(more || +$("fMax").value || +$("fBeds").value || +$("fPay").value || $("fWork").value || $("q").value);
  }
  function resetAll() {
    ["fMin", "fMax", "fType", "fPay", "fWork", "fDrive", "q"].forEach((i) => ($(i).value = ""));
    $("fBeds").value = $("fBaths").value = "0"; $("fSort").value = "new"; $("fSoldWithin").value = "365"; $("fPend").checked = true;
    ["fNoMud", "fNoHoa", "fNoFlood"].forEach((i) => ($(i).checked = false));
    savedView = false; fitAll(); refresh();
  }

  // ---------- data ----------
  function remember(list) { list.forEach((l) => byKey.set(l.ListingKey, l)); return list; }
  async function fetchLive() {
    const f = filters(), qa = queryArea(), p = new URLSearchParams({ mode });
    ["min", "max", "beds", "baths", "type", "days"].forEach((k) => { if (f[k]) p.set(k, f[k]); });
    if (f.pending) p.set("pending", "1");
    if (map && $("fBounds").checked && $("mapWrap").offsetWidth > 0) { const b = map.getBounds(); p.set("n", b.getNorth().toFixed(4)); p.set("s", b.getSouth().toFixed(4)); p.set("e", b.getEast().toFixed(4)); p.set("w", b.getWest().toFixed(4)); }
    else if (qa && qa.geo) { const r = (qa.geo.radius_mi || 3) / 69; p.set("n", qa.geo.lat + r); p.set("s", qa.geo.lat - r); p.set("e", qa.geo.lon + r * 1.2); p.set("w", qa.geo.lon - r * 1.2); }
    else if (f.q) p.set("q", f.q);
    const seq = ++liveSeq;
    const r = await fetch(`${API}/listings?${p}`, { headers: session && session.token ? { Authorization: "Bearer " + session.token } : {} });
    const j = await r.json();
    if (seq !== liveSeq) return null; // a newer search started
    if (!j.configured) { console.warn("Listings feed isn't configured on the Worker yet; showing sample homes."); return { fallback: true }; }
    liveState = { signin: !!j.signin, capped: !!j.capped, error: false };
    return remember(j.listings || []);
  }
  function refresh() {
    if (!LIVE || savedView) return render();
    clearTimeout(liveTimer);
    $("list").classList.add("loading");
    liveTimer = setTimeout(async () => {
      try {
        const v = await fetchLive();
        if (v && v.fallback) { RAW = remember(window.DREI_SAMPLE(AREAS)); liveState.sample = true; }
        else if (v) RAW = v;
      } catch (e) { liveState.error = true; }
      $("list").classList.remove("loading");
      render();
    }, 300);
  }
  function render() {
    results = savedView ? [...saved].map((k) => byKey.get(k) || snaps[k]).filter(Boolean) : clientFilter(RAW, !LIVE || liveState.sample);
    markSet(); renderList(); renderMarkers();
  }
  function doSearch() {
    track("search", { q: $("q").value.trim(), mode });
    const qa = queryArea();
    if (map) {
      if (qa && qa.geo) { const r = (qa.geo.radius_mi || 3) / 69; map.fitBounds([[qa.geo.lat - r, qa.geo.lon - r * 1.2], [qa.geo.lat + r, qa.geo.lon + r * 1.2]]); }
      else { const m = clientFilter(RAW, false); if (m.length) map.fitBounds(L.latLngBounds(m.map((l) => [l.Latitude, l.Longitude])).pad(0.15), { maxZoom: 14 }); }
    }
    refresh();
  }

  // ---------- list ----------
  function cardHTML(l) {
    const sold = isSold(l), locked = sold && !canSeeSold(), h = heads(l)[0], w = work(), k = esc(l.ListingKey);
    const tag = sold ? `<span class="htag sold">Sold${locked ? "" : " " + fmtDate(l.CloseDate)}</span>` : isPend(l) ? `<span class="htag pend">Under contract</span>` : (l.DaysOnMarket || 99) <= 7 ? `<span class="htag new">New</span>` : "";
    return `<article class="hcard${locked ? " blur" : ""}" data-k="${k}" tabindex="0" aria-label="${esc(addr(l))}, ${esc(l.City)}">
      <div class="hph" style="${phStyle(l)}">${safePhoto(l.Photo) ? "" : HOUSE}${tag}<button type="button" class="heart${saved.has(l.ListingKey) ? " on" : ""}" data-save="${k}" aria-label="Save home" aria-pressed="${saved.has(l.ListingKey)}">${HEART}</button></div>
      <div class="hb"><div class="price">${locked ? "$000,000" : money(priceOf(l))}</div>
        ${sold ? `<div class="soldnote">Listed for ${locked ? "$000,000" : money(l.ListPrice)}</div>` : ""}
        <div class="hfacts">${s(l.BedroomsTotal || 0, "bed")} · ${s(l.BathroomsTotalInteger || 0, "bath")} · ${(l.LivingArea || 0).toLocaleString()} sq ft</div>
        <div class="addr">${esc(addr(l))}, ${esc(l.City)}</div>
        <div class="chipline">${!sold ? `<span class="mo">${money(monthly(l, l.ListPrice).total)}/mo</span>` : ""}${h ? `<span class="flag${h.bad ? "" : " good"}">${h.s}</span>` : ""}${w ? `<span class="commute">${driveMin(l, w)} min to ${esc(w.short)}</span>` : ""}</div>
        <div class="court">Listing courtesy of ${esc(l.ListOfficeName || "")}</div></div></article>`;
  }
  function renderList() {
    const locked = mode === "sold" && !canSeeSold(), r = results;
    let h = "";
    if (savedView) {
      h = `<div class="listbar"><p class="summary"><b>${r.length}</b> saved home${r.length === 1 ? "" : "s"}</p><button type="button" class="alertbtn" data-act="back">← Back to search</button></div>`;
      $("list").innerHTML = h + (r.length ? `<div class="hgrid">${r.map(cardHTML).join("")}</div>` : `<div class="empty">Tap the ♥ on any home to save it here.</div>`);
      return;
    }
    if (locked) h += `<div class="gate"><div><b>See what homes really sold for</b><br><span style="opacity:.9">Texas doesn't publish sale prices. A free account shows them. Your info goes only to Kohl.</span></div><button type="button" class="btn btn-brass" data-act="unlock">Unlock sold prices</button></div>`;
    const qa = queryArea();
    if (qa) h += `<a class="hoodlink" href="areas/${esc(qa.id)}.html"><div>Moving to ${esc(qa.name)}? Schools, taxes, commutes and the honest pros and cons.</div><span>Read the guide →</span></a>`;
    if (LIVE && !liveState.sample && liveState.error) h += `<div class="note" style="margin-bottom:14px">We couldn't reach the listings right now. Try again in a minute.</div>`;
    const mid = r.length && !locked ? ` · typical price <b>${short(median(r.map(priceOf)))}</b>` : "";
    const isOn = mode === "sale" && alerts.some((a) => sameAlert(a.filters, alertFilters()));
    h += `<div class="listbar"><p class="summary"><b>${r.length}${LIVE && liveState.capped ? "+" : ""}</b> ${mode === "sold" ? "homes sold" : "homes for sale"}${mid}</p>${mode === "sale" ? `<button type="button" class="alertbtn${isOn ? " on" : ""}" data-act="alert">${isOn ? "✓ Alerts on" : "Email me new matches"}</button>` : ""}</div>`;
    if (LIVE && liveState.capped) h += `<p class="private" style="margin:-6px 0 12px">Showing the newest matches. Zoom in or add filters to see the rest.</p>`;
    if (locked && LIVE && !liveState.sample) h += "";
    else h += r.length ? `<div class="hgrid">${r.map(cardHTML).join("")}</div>` : `<div class="empty">No homes match.<br><button type="button" class="btn btn-sm" style="margin-top:14px" data-act="clear">Clear filters</button></div>`;
    $("list").innerHTML = h;
  }
  $("list").addEventListener("click", (e) => {
    const sv = e.target.closest("[data-save]"); if (sv) { e.stopPropagation(); toggleSave(sv.dataset.save); return; }
    const act = e.target.closest("[data-act]");
    if (act) { const a = act.dataset.act; if (a === "unlock") openVow("sold"); if (a === "alert") alertSearch(); if (a === "back") toggleSavedView(); if (a === "clear") resetAll(); return; }
    const c = e.target.closest(".hcard"); if (c) openListing(c.dataset.k);
  });
  $("list").addEventListener("keydown", (e) => { const c = e.target.closest(".hcard"); if (c && e.key === "Enter") openListing(c.dataset.k); });
  $("list").addEventListener("mouseover", (e) => { const c = e.target.closest(".hcard"); hl(c ? c.dataset.k : null); });

  // ---------- map ----------
  function initMap() {
    if (!window.L) { $("map").innerHTML = '<div class="empty">The map could not load.</div>'; $("fBounds").checked = false; return; }
    map = L.map("map", { zoomControl: true }).setView([33.0, -96.8], 10);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
    layer = L.layerGroup().addTo(map); workLayer = L.layerGroup().addTo(map);
    map.on("moveend", () => { if ($("fBounds").checked && !savedView) refresh(); else renderMarkers(); });
  }
  function fitAll() { if (map && RAW.length) map.fitBounds(L.latLngBounds(RAW.filter((l) => l.Latitude).map((l) => [l.Latitude, l.Longitude])).pad(0.05)); }
  function renderMarkers() {
    if (!map) return;
    layer.clearLayers(); workLayer.clearLayers(); markers = {};
    const w = work();
    if (w) L.marker([w.lat, w.lng], { icon: L.divIcon({ className: "", html: `<span class="workpin">Work: ${esc(w.short)}</span>`, iconSize: [0, 0] }), zIndexOffset: 2000, interactive: false }).addTo(workLayer);
    const locked = mode === "sold" && !canSeeSold(), far = map.getZoom() < 12;
    results.forEach((l) => {
      if (!l.Latitude) return;
      const cls = isSold(l) ? "sold" : isPend(l) ? "pend" : "";
      const html = far ? `<span class="pin dot ${cls}" data-k="${esc(l.ListingKey)}"></span>` : `<span class="pin ${cls}" data-k="${esc(l.ListingKey)}">${locked ? "Sold" : short(priceOf(l))}</span>`;
      const m = L.marker([l.Latitude, l.Longitude], { icon: L.divIcon({ className: "", html, iconSize: [0, 0] }), keyboard: false });
      m.on("click", () => openListing(l.ListingKey)); m.on("mouseover", () => hl(l.ListingKey, true)); m.on("mouseout", () => hl(null));
      m.addTo(layer); markers[l.ListingKey] = m;
    });
  }
  function hl(k, fromMap) {
    document.querySelectorAll(".pin.hl,.hcard.hl").forEach((e) => e.classList.remove("hl"));
    if (!k) return;
    const sel = CSS.escape(k);
    const mk = document.querySelector(`.pin[data-k="${sel}"]`); if (mk) { mk.classList.add("hl"); markers[k] && markers[k].setZIndexOffset(1000); }
    const c = document.querySelector(`.hcard[data-k="${sel}"]`); if (c) { c.classList.add("hl"); if (fromMap) c.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }

  // ---------- listing detail ----------
  async function findListing(k) {
    if (byKey.has(k)) return byKey.get(k);
    if (LIVE) {
      try { const j = await fetch(`${API}/listing?id=${encodeURIComponent(k)}`, { headers: session && session.token ? { Authorization: "Bearer " + session.token } : {} }).then((r) => r.json()); if (j.listing) { remember([j.listing]); return j.listing; } if (j.signin) { openVow("sold"); return null; } } catch (e) {}
    }
    return snaps[k] || null;
  }
  async function openListing(k) {
    const l = await findListing(k);
    if (!l) { D.toast("That home isn't available anymore."); return; }
    if (isSold(l) && !canSeeSold()) { pending = () => openListing(k); openVow("sold"); return; }
    track("view_home", { id: k, city: l.City, status: l.StandardStatus });
    const sold = isSold(l), p = priceOf(l), m = monthly(l, p), hs = heads(l), a = areaFor(l), w = work(), K = esc(l.ListingKey);
    const newTax = Math.round((p * taxRate(l)) / 100);
    const row = (x, y) => `<div class="line2"><span>${x}</span><b>${y}</b></div>`;
    const where = `${esc(addr(l))}, ${esc(l.City)}, TX ${esc(l.PostalCode || "")}`;
    $("drawer").innerHTML = `<button type="button" class="dx" data-act="close" aria-label="Close">×</button>
    <div class="hph" style="${phStyle(l)}">${safePhoto(l.Photo) ? "" : HOUSE}<span class="htag ${sold ? "sold" : isPend(l) ? "pend" : ""}">${sold ? "Sold " + fmtDate(l.CloseDate) : isPend(l) ? "Under contract" : "For sale"}</span></div>
    <div class="db">
      <div class="price">${money(p)}</div>
      ${sold ? `<div class="soldnote" style="font-size:.95rem">Listed for ${money(l.ListPrice)}. Sold after ${s(l.DaysOnMarket || 0, "day")}.</div>` : ""}
      <div class="hfacts">${s(l.BedroomsTotal || 0, "bed")} · ${s(l.BathroomsTotalInteger || 0, "bath")} · ${(l.LivingArea || 0).toLocaleString()} sq ft</div>
      <div class="addr" style="white-space:normal">${where}</div>
      <div class="acts">${sold ? `<a class="btn btn-brass" href="home-value.html">What's my home worth?</a>` : `<button type="button" class="btn btn-brass" data-act="tour">See this home</button>`}<button type="button" class="btn" data-act="ask">Ask Kohl</button></div>
      <p class="private">Goes straight to Kohl. Never sold to other agents.</p>
      <div class="acts2"><button type="button" class="btn btn-ghost btn-sm${saved.has(l.ListingKey) ? " on" : ""}" id="dSave" data-act="save">${saved.has(l.ListingKey) ? "♥ Saved" : "♡ Save"}</button><button type="button" class="btn btn-ghost btn-sm" data-act="share">Share</button>${!sold ? `<button type="button" class="btn btn-ghost btn-sm" data-act="like">Email me homes like this</button>` : ""}</div>
      ${w ? `<div class="know info" style="margin-top:14px"><span class="ic">→</span><div><b>About ${driveMin(l, w)} min to ${esc(w.name)}</b>Off-peak drive estimate. Rush hour is often longer.</div></div>` : ""}

      <div class="sec"><h3>${sold ? "What it would cost per month at this price" : "What you'd pay per month"}</h3>
        <div class="money"><div class="big">${money(m.total)}<span style="font-size:1rem;color:var(--mute);font-weight:600">/mo</span></div>
          <p class="private" style="margin-bottom:8px">With ${ASSUME.down * 100}% down at ${ASSUME.rate}%. <a class="link" href="tools.html#affordability">Use your own numbers</a></p>
          ${row("Loan payment", money(m.pi))}${row(`Property tax (${taxRate(l)}%)`, money(m.tax))}${row("Insurance (estimate)", money(m.ins))}${row("HOA", m.hoa ? money(m.hoa) : "None")}</div>
        <div class="know" style="margin-top:10px"><span class="ic">!</span><div><b>Your taxes will likely be higher than the seller's</b>${l.TaxAnnualAmount ? `The seller's tax bill was about ${money(l.TaxAnnualAmount)}${l.TaxYear ? " in " + esc(l.TaxYear) : ""}, often lowered by a homestead exemption or cap.` : "Sellers often pay less because of homestead exemptions and caps."} At this price, plan on about <b>${money(newTax)}/yr</b>. <a class="link" href="guides/texas-homestead-exemption.html">Homestead tips</a></div></div>
      </div>

      ${hs.length ? `<div class="sec"><h3>Good to know</h3>${hs.map((x) => `<div class="know${x.bad ? "" : " good"}"><span class="ic">${x.bad ? "!" : "✓"}</span><div><b>${x.t}</b>${x.d}</div></div>`).join("")}</div>` : ""}
      <div id="dFlood"></div>

      ${a ? `<div class="sec"><div class="take"><b>About ${esc(a.name)}:</b> ${esc(a.lifestyle_summary)} ${a.cons && a.cons[0] ? `<br><b>Watch for:</b> ${esc(a.cons[0])}.` : ""}<br><a class="link" href="areas/${esc(a.id)}.html">Read the ${esc(a.name)} guide →</a></div></div>` : ""}

      <div class="sec">
        <details><summary>Price history</summary><div class="rows">${timeline(l).map((e) => `<div class="line2"><span${e[3] ? ' style="color:var(--bad);font-weight:700"' : ""}>${e[0] ? fmtDate(e[0]) + " · " : ""}${e[1]}</span><b>${e[2] ? money(e[2]) : ""}</b></div>`).join("")}</div></details>
        <details data-lazy="comps"><summary>Nearby sales</summary><div class="rows" id="dComps"></div></details>
        <details data-lazy="schools"><summary>Schools${a && a.isd ? " · " + esc(String(a.isd[0]).replace(/\s*\(.*?\)/, "")) : ""}</summary><div class="rows" id="dSchools"></div></details>
        <details><summary>Commute times</summary><div class="rows">${POINTS.map((pt) => row(esc(pt.name), "~" + driveMin(l, pt) + " min")).join("")}<p class="private">Off-peak drive estimates, scaled from routed times for this area.</p></div></details>
        <details><summary>Home details</summary><div class="rows">
          ${row("Type", esc(l.PropertySubType || ""))}${row("Year built", esc(l.YearBuilt || "—"))}${row("Lot", l.LotSizeAcres ? esc(l.LotSizeAcres) + " acres" : "—")}${row("Price per sq ft", l.LivingArea ? "$" + Math.round(p / l.LivingArea) : "—")}
          ${row("Days for sale", totalDays(l))}${row("Flood zone", '<span id="dFz">' + (l.FloodZone ? esc(l.FloodZone) : "Checking…") + "</span>")}${row("Tax rate", taxRate(l) + "%")}${row("MLS #", esc(l.ListingId || ""))}
          ${l.PublicRemarks ? `<p style="margin-top:10px;font-size:.92rem;color:var(--ink-2)">${esc(l.PublicRemarks)}</p>` : ""}</div></details>
      </div>
      <p class="disc">Listing courtesy of ${esc(l.ListOfficeName || "")}. ${esc(C.IDX_DISCLAIMER || "Information deemed reliable but not guaranteed.")}${l._sample ? " SAMPLE HOME: not a real listing." : ""}</p>
    </div>`;
    const dr = $("drawer");
    dr._listing = l;
    dr.classList.add("open"); dr.setAttribute("aria-hidden", "false"); dr.scrollTop = 0; dr.focus({ preventScroll: true });
    if (map && markers[k] && $("mapWrap").offsetWidth) map.panTo([l.Latitude, l.Longitude]);
    if (location.hash !== "#home=" + k) history.replaceState(null, "", "#home=" + encodeURIComponent(k));
    checkFlood(l);
  }
  function closeDrawer() {
    const dr = $("drawer"); if (!dr.classList.contains("open")) return;
    dr.classList.remove("open"); dr.setAttribute("aria-hidden", "true");
    if (location.hash.startsWith("#home=")) history.replaceState(null, "", location.pathname + location.search);
  }
  $("drawer").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const l = $("drawer")._listing, a = t.dataset.act, where = l ? `${addr(l)}, ${l.City} (MLS ${l.ListingId || l.ListingKey})` : "";
    if (a === "close") closeDrawer();
    if (a === "save") toggleSave(l.ListingKey);
    if (a === "share") shareHome(l);
    if (a === "like") alertLike(l);
    if (a === "tour") D.openHandoff({ source: "search_tour", reason: `I'd like to see ${where}.` });
    if (a === "ask") D.openHandoff({ source: "search_question", reason: `Question about ${where}: ` });
    if (a === "comp") openListing(t.dataset.k);
  });
  $("drawer").addEventListener("toggle", (e) => {
    const d = e.target; if (!d.open || !d.dataset.lazy || d.dataset.done) return;
    d.dataset.done = "1";
    const l = $("drawer")._listing;
    if (d.dataset.lazy === "schools") loadSchools(l);
    if (d.dataset.lazy === "comps") loadComps(l);
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  async function checkFlood(l) {
    if (l.FloodZone || !API || l._sample) { if (!l.FloodZone && $("dFz")) $("dFz").textContent = "Not checked"; return; }
    try {
      const r = await fetch(`${API}/flood?lat=${l.Latitude}&lon=${l.Longitude}`).then((x) => x.json());
      if (r.zone) { l.FloodZone = r.zone; }
    } catch (e) {}
    if ($("drawer")._listing !== l) return;
    if ($("dFz")) $("dFz").innerHTML = l.FloodZone ? esc(l.FloodZone) : `<a class="link" href="https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(addr(l) + ", " + l.City + ", TX")}" target="_blank" rel="noopener">Check FEMA map ↗</a>`;
    if (inFlood(l) && $("dFlood")) $("dFlood").innerHTML = `<div class="sec"><div class="know"><span class="ic">!</span><div><b>In a flood zone</b>FEMA zone ${esc(l.FloodZone)}. Your lender will likely require flood insurance. Get a quote before you offer.</div></div></div>`;
  }
  async function loadComps(l) {
    const el = $("dComps");
    if (!canSeeSold()) { el.innerHTML = `<p class="private">Nearby sold prices are free with an account. <a class="link" href="#" data-vow="sold">Sign in to see them</a></p>`; return; }
    let pool = RAW.filter(isSold);
    if (LIVE && !liveState.sample) {
      el.innerHTML = `<p class="private">Loading nearby sales…</p>`;
      try {
        const r = 0.012, p = new URLSearchParams({ mode: "sold", days: "365", n: l.Latitude + r, s: l.Latitude - r, e: l.Longitude + r * 1.2, w: l.Longitude - r * 1.2 });
        const j = await fetch(`${API}/listings?${p}`, { headers: { Authorization: "Bearer " + session.token } }).then((x) => x.json());
        pool = remember(j.listings || []);
      } catch (e) { pool = []; }
    }
    const comps = pool.filter((x) => x.ListingKey !== l.ListingKey && miles(l.Latitude, l.Longitude, x.Latitude, x.Longitude) < 1.5)
      .sort((a, b) => Math.abs((a.LivingArea || 0) - (l.LivingArea || 0)) - Math.abs((b.LivingArea || 0) - (l.LivingArea || 0))).slice(0, 4);
    el.innerHTML = comps.length ? comps.map((c) => `<div class="line2" style="cursor:pointer" data-act="comp" data-k="${esc(c.ListingKey)}"><span>${esc(addr(c))} · ${s(c.BedroomsTotal || 0, "bed")} · ${(c.LivingArea || 0).toLocaleString()} sf · ${fmtDate(c.CloseDate)}</span><b>${money(c.ClosePrice)}</b></div>`).join("") + `<p class="private">Sold within about 1.5 miles in the last year.</p>` : `<p class="private">No recent sales close by.</p>`;
  }
  $("drawer").addEventListener("click", (e) => { const v = e.target.closest("[data-vow]"); if (v) { e.preventDefault(); openVow(v.dataset.vow); } });

  const schoolCache = new Map();
  async function loadSchools(l) {
    const el = $("dSchools"), a = areaFor(l), SCH = window.DREI_SCHOOLS;
    const link = `<a class="link" href="https://txschools.gov/?lng=en" target="_blank" rel="noopener">TXschools.gov ↗</a>`;
    if (!a || !SCH) { el.innerHTML = `<p class="private">See official ratings at ${link}.</p>`; return; }
    el.innerHTML = `<p class="private">Loading official ratings…</p>`;
    const names = (a.isd || []).map((x) => x.replace(/\s*\(.*?\)\s*/g, "").trim());
    try {
      const key = names.join("|");
      if (!schoolCache.has(key)) schoolCache.set(key, (async () => {
        const svc = await SCH.services();
        const q = new URLSearchParams({ where: `district_name IN (${names.map((n) => "'" + n.replace(/'/g, "''") + "'").join(",")})`, outFields: "id,name,district_name,campus_type,rating,latitude,longitude", resultRecordCount: "2000", f: "json" });
        const d = await fetch(`${svc.C}?${q}`).then((r) => r.json());
        return { rows: (d.features || []).map((x) => x.attributes).filter((r) => !/JJAEP|DAEP|Juvenile|Detention|Alternative/i.test(r.name)), date: svc.date };
      })());
      const { rows, date } = await schoolCache.get(key);
      const assigned = { "Elementary": l.ElementarySchool, "Middle / Jr. High": l.MiddleOrJuniorSchool, "High School": l.HighSchool };
      const out = ["Elementary", "Middle / Jr. High", "High School"].map((lvl) => {
        const list = rows.filter((r) => r.campus_type === lvl).map((r) => ({ ...r, d: miles(l.Latitude, l.Longitude, r.latitude, r.longitude) })).sort((x, y) => x.d - y.d);
        const want = assigned[lvl] && String(assigned[lvl]).toLowerCase();
        const pick = (want && list.find((r) => r.name.toLowerCase().includes(want))) || list[0];
        if (!pick) return "";
        return `<div class="school"><span><b>${esc(pick.name.replace(/\bEL\b/, "Elementary").replace(/\bMS\b/, "Middle School").replace(/\bHS\b/, "High School"))}</b><br><span class="private">${want && pick.name.toLowerCase().includes(want) ? "Assigned school per the listing" : `Nearest ${lvl === "High School" ? "high school" : lvl === "Elementary" ? "elementary" : "middle school"} · ${pick.d.toFixed(1)} mi`} · <a class="link" href="https://txschools.gov/?view=school&id=${esc(pick.id)}&lng=en" target="_blank" rel="noopener">Report card ↗</a></span></span>${SCH.badge(pick.rating)}</div>`;
      }).join("");
      el.innerHTML = (out || `<p class="private">No campuses found nearby.</p>`) + `<p class="private" style="margin-top:6px">Official Texas Education Agency A–F ratings (data ${esc(date.slice(0, 4))}-${esc(date.slice(4, 6))}-${esc(date.slice(6))}). Attendance zones don't follow distance. Confirm the assigned school with the district.</p>`;
    } catch (e) { el.innerHTML = `<p class="private">Couldn't load ratings right now. See ${link}.</p>`; }
  }

  // ---------- accounts (VOW sign-in) ----------
  const COPY = {
    sold: ["See what homes sold for", "Texas doesn't publish sale prices. A free account shows them.", "Show me sold prices"],
    save: ["Save homes you love", "A free account keeps your saved homes in one place.", "Save this home"],
    alert: ["Get new homes first", "We'll email you when new homes match. Free, and you can stop anytime.", "Turn on alerts"],
  };
  function openVow(reason = "sold", tab = "join") {
    if (document.getElementById("vowModal")) return;
    const t = COPY[reason] || COPY.sold, prof = store.get("profile", {});
    const w = document.createElement("div");
    w.className = "modal"; w.id = "vowModal"; w.setAttribute("role", "dialog"); w.setAttribute("aria-modal", "true"); w.setAttribute("aria-labelledby", "vowTitle");
    w.innerHTML = `<div class="modal-card">
      <button class="modal-close" type="button" data-close>Close ✕</button>
      <div class="stack" style="gap:.35rem"><h2 id="vowTitle" style="font-size:1.6rem">${t[0]}</h2><p class="muted">${t[1]}</p></div>
      <div class="safe">✓ Your info goes only to ${esc(C.AGENT_NAME)}. Never sold. No robocalls.</div>
      <div class="vow-tabs" role="tablist"><button type="button" data-tab="join" class="${tab === "join" ? "on" : ""}">Create free account</button><button type="button" data-tab="in" class="${tab === "in" ? "on" : ""}">Sign in</button></div>
      <form class="vow-form" novalidate>
        <input type="text" name="name" placeholder="Your name" autocomplete="name" value="${esc(prof.name || "")}" data-join>
        <input type="email" name="email" placeholder="Email" autocomplete="email" value="${esc(prof.email || "")}" required>
        <input type="tel" name="phone" placeholder="Phone (optional)" autocomplete="tel" value="${esc(prof.phone || "")}" data-join>
        <input type="password" name="password" placeholder="Password (8+ characters)" autocomplete="current-password" required>
        <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
        <label class="terms" data-join><input type="checkbox" name="agree"> <span>I agree to the <a class="link" href="terms.html" target="_blank">Terms of Use</a>, including that I'm working with ${esc(C.AGENT_NAME)} of ${esc(C.BROKER_NAME || "")} and will use listing data only for my own home search. I agree to be contacted about my search by email, phone or text.</span></label>
        <p class="vow-err" role="alert"></p>
        <button class="btn btn-brass" type="submit">${t[2]}</button>
      </form></div>`;
    document.body.appendChild(w);
    const form = w.querySelector("form"), err = w.querySelector(".vow-err");
    const setTab = (tb) => {
      tab = tb; w.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tb));
      w.querySelectorAll("[data-join]").forEach((x) => (x.hidden = tb !== "join"));
      form.password.autocomplete = tb === "join" ? "new-password" : "current-password";
      form.querySelector("button[type=submit]").textContent = tb === "join" ? t[2] : "Sign in"; err.textContent = "";
    };
    setTab(tab);
    const close = () => { w.remove(); pending = null; };
    w.addEventListener("click", (e) => { if (e.target === w || e.target.hasAttribute("data-close")) close(); const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
    w.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    (form.name.value && tab === "join" ? form.password : tab === "join" ? form.name : form.email).focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form).entries());
      if (tab === "join") {
        if (!v.name.trim()) return (err.textContent = "Add your name.");
        if (!/^\S+@\S+\.\S+$/.test(v.email)) return (err.textContent = "Add a valid email.");
        if ((v.password || "").length < 8) return (err.textContent = "Password needs 8 or more characters.");
        if (!form.agree.checked) return (err.textContent = "Check the box to agree to the terms.");
      } else if (!v.email || !v.password) return (err.textContent = "Add your email and password.");
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "One moment…";
      try {
        await (tab === "join" ? register(v) : signIn(v));
        const f = pending; w.remove(); pending = null;
        if (!f) D.toast(tab === "join" ? `✓ Welcome, ${v.name.trim().split(/\s+/)[0]}! Sold prices are unlocked.` : "✓ Signed in");
        render(); if (LIVE) refresh();
        if (f) f();
      } catch (x) {
        err.textContent = x.message || "Something went wrong. Try again.";
        if (x.code === "exists") setTab("in");
        btn.disabled = false; btn.textContent = tab === "join" ? t[2] : "Sign in";
      }
    });
  }
  async function api(path, body, method = body ? "POST" : "GET") {
    const h = { "Content-Type": "application/json" };
    if (session && session.token) h.Authorization = "Bearer " + session.token;
    const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "Request failed"), { status: r.status, code: j.code });
    return j;
  }
  const unreachable = (x) => !x.status || x.status === 404 || x.status === 405 || x.status === 503;
  function setSession(sObj) { session = sObj; store.set("vowSession", sObj); $("acctBtn").textContent = sObj ? "Sign out" : "Sign in"; }
  async function register(v) {
    const person = { name: v.name.trim(), email: v.email.trim(), phone: (v.phone || "").trim() };
    store.set("profile", { ...store.get("profile", {}), ...person });
    if (REMOTE_ACCOUNTS) {
      try {
        const j = await api("/vow/register", { ...person, password: v.password, agree: true, website: v.website || "" });
        setSession({ token: j.token, ...j.user, remote: true, soldAccess: j.soldAccess });
        await syncSaved(); await syncAlerts();
        track("handoff_submit", { kind: "search_signup" });
        return;
      } catch (x) { if (!unreachable(x)) throw x; }
    }
    // Device-only account: everything stays in this browser, and the sign-up goes to Kohl as a lead.
    if (v.website) return;
    D.sendLead({ ...person, kind: "search_signup", goal: "Home search account", request: "Created a free home search account (sold prices, saved homes, alerts)", source: "search", page: location.pathname, submitted_at: new Date().toISOString() });
    track("handoff_submit", { kind: "search_signup" });
    const dev = { ...person, remote: false, soldAccess: true, pw: await digest(v.password) };
    store.set("vowDevice", dev); setSession(dev);
  }
  async function signIn(v) {
    if (REMOTE_ACCOUNTS) {
      try {
        const j = await api("/vow/login", { email: v.email.trim(), password: v.password });
        setSession({ token: j.token, ...j.user, remote: true, soldAccess: j.soldAccess });
        j.user.saved.forEach((k) => saved.add(k)); persistSaved();
        alerts = mergeAlerts(alerts, j.user.alerts); store.set("searchAlerts", alerts);
        await syncSaved(); updateSavedBadge(); return;
      } catch (x) { if (!unreachable(x)) throw x; }
    }
    const local = store.get("vowDevice", null);
    if (local && local.email.toLowerCase() === v.email.trim().toLowerCase() && local.pw === (await digest(v.password))) { setSession(local); return; }
    throw Object.assign(new Error("We couldn't find that account on this device. Create a free account instead."), { code: "" });
  }
  async function digest(x) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("drei:" + x)); return [...new Uint8Array(b)].map((n) => n.toString(16).padStart(2, "0")).join(""); }
  function signOut() {
    if (session && session.remote) api("/vow/logout", {}).catch(() => {});
    if (session && !session.remote) store.set("vowDevice", session);
    setSession(null); saved.clear(); alerts = []; persistSaved(); store.set("searchAlerts", alerts);
    savedView = false; closeDrawer(); refresh(); D.toast("Signed out");
  }
  async function refreshMe() {
    if (!session || !session.remote) return;
    try {
      const j = await api("/vow/me");
      setSession({ ...session, ...j.user, soldAccess: j.soldAccess });
      j.user.saved.forEach((k) => saved.add(k)); persistSaved();
      alerts = mergeAlerts(alerts, j.user.alerts); store.set("searchAlerts", alerts);
    } catch (x) { if (x.status === 401) setSession(null); }
  }

  // ---------- saved homes ----------
  function updateSavedBadge() { $("savedN").textContent = saved.size; $("savedN").hidden = !saved.size; }
  function persistSaved() {
    store.set("savedHomes", [...saved]);
    const keep = {}; saved.forEach((k) => { const l = byKey.get(k) || snaps[k]; if (l) { const { _area, _tax, ...rest } = l; keep[k] = rest; } });
    snaps = keep; store.set("savedSnaps", snaps); updateSavedBadge();
  }
  async function syncSaved() { if (session && session.remote) { try { const j = await api("/vow/saved", { saved: [...saved] }); saved = new Set(j.saved); persistSaved(); } catch (e) {} } }
  function toggleSave(k) {
    if (!session) { pending = () => toggleSave(k); openVow("save"); return; }
    const on = !saved.has(k);
    on ? saved.add(k) : saved.delete(k);
    persistSaved(); syncSaved(); track(on ? "save_home" : "unsave_home", { id: k });
    D.toast(on ? "♥ Saved" : "Removed from saved");
    document.querySelectorAll(`[data-save="${CSS.escape(k)}"]`).forEach((b) => { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    const b = $("dSave"); if (b && $("drawer")._listing && $("drawer")._listing.ListingKey === k) { b.classList.toggle("on", on); b.textContent = on ? "♥ Saved" : "♡ Save"; }
    if (savedView) render();
  }
  async function toggleSavedView() {
    if (!session && !savedView) { pending = () => toggleSavedView(); openVow("save"); return; }
    savedView = !savedView; closeDrawer();
    if (savedView && LIVE) await Promise.all([...saved].filter((k) => !byKey.has(k)).slice(0, 40).map(findListing));
    render(); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- alerts ----------
  // Area names (like "West Plano") aren't feed cities, so alerts for an area use its map box instead.
  function areaBox(a) { const r = (a.geo.radius_mi || 3) / 69; return { n: +(a.geo.lat + r).toFixed(4), s: +(a.geo.lat - r).toFixed(4), e: +(a.geo.lon + r * 1.2).toFixed(4), w: +(a.geo.lon - r * 1.2).toFixed(4) }; }
  function alertFilters() { const f = filters(), qa = queryArea(); return { mode: "sale", q: f.q, min: f.min, max: f.max, beds: f.beds, baths: f.baths, type: f.type, pending: false, ...(qa && qa.geo ? areaBox(qa) : {}) }; }
  const sameAlert = (a, b) => ["q", "min", "max", "beds", "baths", "type"].every((k) => String(a[k] || "") === String(b[k] || ""));
  function alertLabel(f) { return [f.q || "All DFW", f.max ? "under " + short(f.max) : "", f.min ? short(f.min) + "+" : "", f.beds ? f.beds + "+ beds" : "", f.type || ""].filter(Boolean).join(" · "); }
  function mergeAlerts(local, remote) { const out = [...(remote || [])]; (local || []).forEach((a) => { if (!out.some((b) => b.id === a.id || sameAlert(a.filters, b.filters))) out.push(a); }); return out.slice(0, 10); }
  async function syncAlerts() { if (session && session.remote) { try { const j = await api("/vow/alerts", { alerts }); alerts = j.alerts; store.set("searchAlerts", alerts); } catch (e) {} } }
  function addAlert(f, how) {
    const i = alerts.findIndex((a) => sameAlert(a.filters, f));
    if (i >= 0 && how === "toggle") { alerts.splice(i, 1); store.set("searchAlerts", alerts); syncAlerts(); D.toast("Alerts off for this search"); render(); return; }
    if (i < 0) alerts.push({ id: Math.random().toString(36).slice(2, 10), label: alertLabel(f), filters: f });
    alerts = alerts.slice(-10); store.set("searchAlerts", alerts);
    track("alert_on", { label: alertLabel(f) });
    if (session && session.remote) { syncAlerts(); D.toast("✓ Alerts on. New matches go to your email."); }
    else {
      D.sendLead({ name: session.name, email: session.email, phone: session.phone || "", kind: "search_alert", goal: "Search alert", request: `Email me new homes: ${alertLabel(f)}`, source: "search", submitted_at: new Date().toISOString() });
      D.toast(`✓ Got it. ${C.AGENT_NAME.split(" ")[0]} will email you new matches.`);
    }
    render();
  }
  function alertSearch() { if (!session) { pending = () => alertSearch(); openVow("alert"); return; } addAlert(alertFilters(), "toggle"); }
  function alertLike(l) {
    if (!session) { pending = () => alertLike(l); openVow("alert"); return; }
    const a = areaFor(l);
    addAlert({ mode: "sale", q: a ? a.name : l.City, ...(a && a.geo ? areaBox(a) : {}), min: Math.round((l.ListPrice * 0.85) / 1000) * 1000, max: Math.round((l.ListPrice * 1.15) / 1000) * 1000, beds: Math.max(1, (l.BedroomsTotal || 2) - 1), baths: 0, type: "", pending: false }, "add");
  }

  // ---------- share ----------
  async function shareHome(l) {
    const url = location.origin + location.pathname + "#home=" + encodeURIComponent(l.ListingKey), title = `${addr(l)}, ${l.City}`;
    track("share_home", { id: l.ListingKey });
    try { if (navigator.share) { await navigator.share({ title, text: `${title}: ${money(priceOf(l))}`, url }); return; } await navigator.clipboard.writeText(url); D.toast("✓ Link copied"); }
    catch (e) { if (e && e.name === "AbortError") return; D.toast("Link: " + url); }
  }

  // ---------- boot ----------
  (async function boot() {
    try { AREAS = (await D.loadJSON("data/neighborhoods.json")).neighborhoods || []; } catch (e) { AREAS = []; }
    const dl = $("qList"); [...new Set(AREAS.map((a) => a.name))].sort().forEach((n) => dl.appendChild(new Option(n)));
    $("srchLegal").innerHTML = esc(C.IDX_DISCLAIMER || "") + (LIVE ? "" : " <b>Sample homes are shown until the MLS listing feed is connected. They are not real listings.</b>") + ` Monthly costs are estimates with ${ASSUME.down * 100}% down at ${ASSUME.rate}%, 2025 tax rates and an insurance estimate. Not a loan offer.`;
    setSession(session); updateSavedBadge();
    initMap();
    if (!LIVE) { RAW = remember(window.DREI_SAMPLE(AREAS)); liveState.sample = true; fitAll(); }
    if (/[?&]verified=1/.test(location.search)) { D.toast("✓ Email confirmed. Thanks!"); if (session) session.verified = true; }
    const hq = new URLSearchParams(location.search).get("q"); if (hq) { $("q").value = hq; doSearch(); } else refresh();
    await refreshMe(); updateSavedBadge();
    const m = location.hash.match(/^#home=([\w%-]+)/); if (m) openListing(decodeURIComponent(m[1]));
    window.addEventListener("hashchange", () => { const h = location.hash.match(/^#home=([\w%-]+)/); if (h && (!$("drawer")._listing || $("drawer")._listing.ListingKey !== decodeURIComponent(h[1]) || !$("drawer").classList.contains("open"))) openListing(decodeURIComponent(h[1])); });
  })();
})();
