/*
 * Schools: official Texas Education Agency (TEA) A–F accountability ratings, loaded live from TEA's
 * public TXschools.gov map service, plus a starter list of private schools.
 * We show official data and link out to report cards and real reviews. We don't rank or recommend.
 */
(function () {
  const { esc, loadJSON } = window.DREI;
  const ORG = "https://services2.arcgis.com/5MVN2jsqIrNZD4tP/arcgis/rest/services";
  const FALLBACK = "20261005";
  let svcPromise = null;

  // Find TEA's newest published dataset automatically (they publish dated snapshots).
  function services() {
    if (svcPromise) return svcPromise;
    svcPromise = fetch(`${ORG}?f=json`).then((r) => r.json()).then((d) => {
      const dates = (d.services || []).map((s) => (s.name.match(/^districts_schools_(\d{8})_C$/) || [])[1]).filter(Boolean).sort();
      const latest = dates[dates.length - 1] || FALLBACK;
      return { C: `${ORG}/districts_schools_${latest}_C/FeatureServer/0/query`, D: `${ORG}/districts_schools_${latest}_D/FeatureServer/0/query`, date: latest };
    }).catch(() => ({ C: `${ORG}/districts_schools_${FALLBACK}_C/FeatureServer/0/query`, D: `${ORG}/districts_schools_${FALLBACK}_D/FeatureServer/0/query`, date: FALLBACK }));
    return svcPromise;
  }
  async function query(url, where, fields) {
    let all = [], off = 0;
    for (let i = 0; i < 6; i++) {
      const d = await fetch(url + "?" + new URLSearchParams({ where, outFields: fields, resultOffset: String(off), resultRecordCount: "1000", orderByFields: "ObjectId", f: "json" })).then((r) => r.json());
      const f = (d.features || []).map((x) => x.attributes);
      all = all.concat(f);
      if (!d.exceededTransferLimit || !f.length) break;
      off += f.length;
    }
    return all;
  }
  const isdNames = (n) => n.isd.map((s) => s.replace(/\s*\(.*?\)\s*/g, "").trim());
  const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  function miles(a, b, c, d) {
    const R = 3958.8, toR = (x) => (x * Math.PI) / 180;
    const dLat = toR(c - a), dLon = toR(d - b);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const expand = (n) => n.replace(/\bHS\b/, "High School").replace(/\bMS\b/, "Middle School").replace(/\bEL\b/, "Elementary").replace(/\bEl\b/, "Elementary").replace(/\bJH\b/, "Junior High");
  const city = (addr) => { const p = String(addr || "").split("."); return (p[p.length - 2] || "").trim(); };
  const badge = (r) => `<span class="grade g-${/^[A-F]$/.test(r) ? r : "na"}" title="${r === "Not Rated" ? "Not rated this year" : "TEA rating " + esc(r)}">${/^[A-F]$/.test(r) ? r : "NR"}</span>`;
  const reviewsUrl = (name, addr) => "https://www.google.com/search?q=" + encodeURIComponent(`${expand(name)} ${city(addr)} TX reviews`);

  async function districtRatings(names) {
    const s = await services();
    const rows = await query(s.D, `entity_cd='D' AND name IN (${names.map(sq).join(",")})`, "id,name,rating,website");
    return { rows, date: s.date };
  }
  async function campusesNear(n) {
    const s = await services();
    const names = isdNames(n);
    const rows = await query(s.C, `district_name IN (${names.map(sq).join(",")})`, "id,name,district_name,campus_type,low_grade,high_grade,rating,address,latitude,longitude");
    const g = n.geo || {};
    return rows.map((r) => ({ ...r, dist: g.lat ? miles(g.lat, g.lon, r.latitude, r.longitude) : 0 }))
      .filter((r) => !g.lat || r.dist <= g.radius_mi)
      .filter((r) => !/JJAEP|DAEP|Juvenile|Detention|Alternative/i.test(r.name))
      .sort((a, b) => a.dist - b.dist);
  }

  const LEVELS = [["Elementary", "Elementary"], ["Middle / Jr. High", "Middle & junior high"], ["High School", "High school"], ["K-12", "K–12 & other"]];
  function campusTable(list) {
    return LEVELS.map(([k, label]) => {
      const rows = list.filter((r) => (k === "K-12" ? !["Elementary", "Middle / Jr. High", "High School"].includes(r.campus_type) : r.campus_type === k));
      if (!rows.length) return "";
      return `<details class="lvl"${k === "Elementary" ? " open" : ""}><summary>${label} <span class="muted">(${rows.length})</span></summary>
        <div class="table-wrap"><table><thead><tr><th>School</th><th>Rating</th><th>Grades</th><th>District</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td><strong>${esc(expand(r.name))}</strong><br><span class="muted" style="font-size:.8rem">${esc(String(r.address || "").replace(/\. TX/, ", TX").replace(/\. /g, ", "))}</span></td>
          <td>${badge(r.rating)}</td><td style="white-space:nowrap">${esc((r.low_grade || "").replace("Grade ", "").replace("Early Education", "EE").replace("Pre-Kindergarten", "PK").replace("Kindergarten", "K"))}–${esc((r.high_grade || "").replace("Grade ", ""))}</td>
          <td>${esc(r.district_name)}</td>
          <td style="white-space:nowrap"><a class="link" href="https://txschools.gov/?view=school&id=${esc(r.id)}&lng=en" target="_blank" rel="noopener">Report card ↗</a><br><a class="link" href="${reviewsUrl(r.name, r.address)}" target="_blank" rel="noopener">Reviews ↗</a></td></tr>`).join("")}
        </tbody></table></div></details>`;
    }).join("");
  }

  /** Render the full schools block for one neighborhood into `el`. */
  async function render(el, n) {
    el.innerHTML = `<p class="muted">Loading official school ratings…</p>`;
    let priv = {};
    try { priv = (await loadJSON("data/private_schools.json")).schools || {}; } catch (e) {}
    try {
      const [{ rows: dists, date }, camps] = await Promise.all([districtRatings(isdNames(n)), campusesNear(n)]);
      const asOf = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
      const pv = priv[n.id] || [];
      el.innerHTML = `
        <div class="district-cards">${dists.sort((a, b) => a.name.localeCompare(b.name)).map((d) => `
          <a class="dcard" href="https://txschools.gov/?view=district&id=${esc(d.id)}&tab=overview&lng=en" target="_blank" rel="noopener">
            ${badge(d.rating)}<span><strong>${esc(d.name)}</strong><small>District rating · TXschools.gov ↗</small></span></a>`).join("")}</div>
        <h3 style="margin:1.4rem 0 .4rem">Public schools within about ${n.geo ? n.geo.radius_mi : ""} miles</h3>
        <p class="muted" style="font-size:.88rem;margin-bottom:.6rem">Attendance zones don't follow city lines. Confirm your exact school with the district's zone lookup for any address.</p>
        ${campusTable(camps) || `<p class="muted">No campuses found nearby.</p>`}
        ${pv.length ? `<h3 style="margin:1.6rem 0 .5rem">Private schools nearby</h3>
          <div class="places">${pv.map((p) => `<article class="place"><span class="tag">${esc(p.affiliation)}</span><h3>${esc(p.name)}</h3><span class="dev-city">${esc(p.city)} · Grades ${esc(p.grades)}</span><a class="link" href="${esc(p.reviews)}" target="_blank" rel="noopener">Website, hours &amp; reviews ↗</a></article>`).join("")}</div>
          <p class="muted" style="font-size:.82rem;margin-top:.5rem">The state doesn't rate private schools. Ask about accreditation, and confirm grades and admissions with each school.</p>` : ""}
        <p class="stamp" style="margin-top:1rem">Ratings: Texas Education Agency A–F accountability ratings (2026 ratings, released Aug. 14, 2026), via TXschools.gov · data updated ${asOf}. "NR" means not rated this year.</p>`;
    } catch (e) {
      el.innerHTML = `<div class="note">We couldn't load live ratings right now. See every school's official rating at <a class="link" href="https://txschools.gov/?lng=en" target="_blank" rel="noopener">TXschools.gov ↗</a>.</div>`;
    }
  }

  window.DREI_SCHOOLS = { render, districtRatings, services, badge };
})();
