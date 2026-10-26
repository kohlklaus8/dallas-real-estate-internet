(function () {
  const { esc, money, loadJSON } = window.DREI;
  const fmt = (m) => {
    if (m.value == null) return null;
    if (m.unit === "usd") return money(m.value);
    if (m.unit === "pct") return m.value + "%";
    if (m.unit === "months") return Number(m.value).toFixed(1);
    return Number(m.value).toLocaleString("en-US");
  };

  loadJSON("data/market.json").then((M) => {
    const loaded = !!M.as_of;
    document.getElementById("m-summary").textContent = M.summary || (loaded ? "" : "Verified figures appear here once the first MLS snapshot is loaded. We leave the dashboard blank rather than show estimates.");
    document.getElementById("m-asof").textContent = loaded ? `Data through ${M.as_of} · checked ${M.fetched || ""}` : "Status: awaiting first verified snapshot";

    document.getElementById("kpis").innerHTML = Object.values(M.metrics).map((m) => {
      const v = fmt(m);
      const chg = m.change_yoy_pct;
      return `<div class="kpi"><span class="k">${esc(m.label)}</span>
        <span class="v">${v ? esc(v) : '<span class="pending" style="font-size:.85rem">Pending</span>'}</span>
        ${chg != null ? `<span class="stamp" style="color:${chg >= 0 ? "var(--good)" : "var(--bad)"}">${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg)}% vs. last year</span>` : `<span class="stamp">${m.prior_year != null ? "Last year: " + esc(String(m.prior_year)) : "&nbsp;"}</span>`}</div>`;
    }).join("");

    const moi = M.metrics.months_inventory && M.metrics.months_inventory.value;
    const gauge = document.getElementById("gauge");
    if (moi != null) {
      const pos = Math.min(100, (moi / 9) * 100);
      gauge.innerHTML = `<span style="position:absolute;left:calc(${pos}% - 7px);top:-5px;width:14px;height:24px;border-radius:4px;background:var(--surface);border:2px solid var(--ink)"></span>`;
      document.getElementById("temp-head").textContent = `${Number(moi).toFixed(1)} months of inventory`;
      document.getElementById("temp-text").textContent = moi < 4 ? "Seller-leaning: well-priced homes move quickly, so buyers should come prepared." : moi <= 6 ? "Balanced: pricing and condition decide outcomes, and both sides have room to negotiate." : "Buyer-leaning: expect concessions, repair credits and longer timelines.";
    } else {
      gauge.style.opacity = ".35";
      document.getElementById("temp-text").textContent = "The needle appears once a verified months-of-inventory figure is loaded.";
    }

    const S = (M.series && M.series.monthly) || [];
    const pts = S.filter((r) => r.median_price != null);
    const trend = document.getElementById("trend");
    if (pts.length >= 2) {
      const w = 520, h = 200, pad = { l: 56, r: 12, t: 12, b: 26 };
      const vals = pts.map((p) => p.median_price);
      const lo = Math.min(...vals) * 0.97, hi = Math.max(...vals) * 1.03;
      const x = (i) => pad.l + (i / (pts.length - 1)) * (w - pad.l - pad.r);
      const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
      const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.median_price).toFixed(1)}`).join("");
      const area = line + `L${x(pts.length - 1)},${h - pad.b}L${x(0)},${h - pad.b}Z`;
      const ticks = [lo, (lo + hi) / 2, hi];
      trend.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Median price trend">
        ${ticks.map((t) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--mute)" font-family="IBM Plex Mono, monospace">$${Math.round(t / 1000)}K</text>`).join("")}
        <path d="${area}" fill="var(--brass)" opacity=".12"/><path d="${line}" fill="none" stroke="var(--brass)" stroke-width="2.5"/>
        <circle cx="${x(pts.length - 1)}" cy="${y(vals[vals.length - 1])}" r="4.5" fill="var(--brass)"/>
        <text x="${x(0)}" y="${h - 6}" font-size="11" fill="var(--mute)" font-family="IBM Plex Mono, monospace">${esc(pts[0].month)}</text>
        <text x="${x(pts.length - 1)}" y="${h - 6}" font-size="11" text-anchor="end" fill="var(--mute)" font-family="IBM Plex Mono, monospace">${esc(pts[pts.length - 1].month)}</text></svg>`;
    } else {
      trend.innerHTML = `<p class="muted" style="font-size:.9rem">The monthly trend line appears after two or more verified monthly snapshots.</p>`;
    }

    const rows = (M.by_area || []).filter((r) => r.home_value != null);
    const seen = new Set();
    const cityRows = rows.filter((r) => (seen.has(r.city) ? false : seen.add(r.city))).sort((x, y) => y.home_value - x.home_value);
    document.getElementById("by-area").innerHTML = cityRows.length
      ? `<div class="table-wrap"><table><thead><tr><th>City</th><th class="num">Typical home value</th><th class="num">1-yr change</th></tr></thead><tbody>
          ${cityRows.map((r) => `<tr><td><a class="link" href="neighborhoods.html#${esc(r.id)}">${esc(r.city)}</a></td><td class="num">${money(r.home_value)}</td><td class="num" style="color:${(r.home_value_yoy || 0) >= 0 ? "var(--good)" : "var(--bad)"}">${r.home_value_yoy == null ? "—" : (r.home_value_yoy >= 0 ? "+" : "") + r.home_value_yoy + "%"}</td></tr>`).join("")}
        </tbody></table></div>`
      : `<div class="note">City-level figures will appear here after the next weekly update.</div>`;

    const Z = M.by_zip || [];
    const zbox = document.getElementById("by-zip");
    if (zbox && Z.length) {
      const draw = (q) => {
        q = q.trim().toLowerCase();
        const list = Z.filter((z) => !q || z.zip.startsWith(q) || z.city.toLowerCase().includes(q)).sort((a, b) => a.city.localeCompare(b.city) || a.zip.localeCompare(b.zip));
        document.getElementById("zip-rows").innerHTML = list.map((z) => `<tr><td><strong>${esc(z.zip)}</strong></td><td>${esc(z.city)}</td><td class="num">${money(z.home_value)}</td><td class="num" style="color:${(z.home_value_yoy || 0) >= 0 ? "var(--good)" : "var(--bad)"}">${z.home_value_yoy >= 0 ? "+" : ""}${z.home_value_yoy}%</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No ZIP codes match.</td></tr>`;
      };
      zbox.innerHTML = `<label class="sr-only" for="zip-q">Find a ZIP code or city</label><input id="zip-q" placeholder="Type a ZIP or city, e.g. 75034 or McKinney" style="max-width:420px;margin-bottom:.8rem">
        <div class="table-wrap" style="max-height:520px;overflow:auto"><table><thead><tr><th>ZIP</th><th>City</th><th class="num">Typical value</th><th class="num">1-yr</th></tr></thead><tbody id="zip-rows"></tbody></table></div>`;
      document.getElementById("zip-q").addEventListener("input", (e) => draw(e.target.value));
      draw("");
    }
    const src = M.sources || [];
    document.getElementById("m-sources").innerHTML = src.length ? `Sources: ${src.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>${x.period ? ` (${esc(x.period)})` : ""}`).join("; ")}. Public data, refreshed weekly. Estimates only; they don't describe any single home.` : "";
  }).catch(() => {
    document.getElementById("m-summary").textContent = "Couldn't load market data. Refresh to try again.";
  });

  // Other published reports, side by side (data/market_reports.json, hand-updated monthly).
  loadJSON("data/market_reports.json").then((R) => {
    const pct = (v) => (v == null ? "" : ` <small style="color:${v >= 0 ? "var(--good)" : "var(--bad)"}">${v > 0 ? "+" : ""}${v}% YoY</small>`);
    const dash = '<span class="muted">—</span>';
    const r = R.rate;
    if (r) {
      const d = new Date(r.week + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      document.getElementById("rate-card").innerHTML = `<div class="card" style="display:flex;flex-wrap:wrap;gap:1.25rem 2.5rem;align-items:center;margin-bottom:1rem">
        <div><span class="eyebrow">30-year fixed mortgage rate</span><div style="font-size:2rem;font-weight:800">${r.rate30.toFixed(2)}%</div><small class="muted">${r.rate30_year_ago ? `${r.rate30_year_ago.toFixed(2)}% a year ago · ` : ""}week of ${esc(d)}</small></div>
        <div><span class="eyebrow">15-year fixed</span><div style="font-size:1.5rem;font-weight:800">${r.rate15.toFixed(2)}%</div></div>
        <p class="muted" style="font-size:.9rem;margin:0;flex:1;min-width:220px">National average from <a class="link" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>. Your rate depends on credit, down payment and points; see what it means for your payment in the <a class="link" href="tools.html#affordability">affordability calculator</a>.</p></div>`;
    }
    const rows = (R.reports || []).map((x) => {
      const price = x.median_price != null ? `${money(x.median_price)}${pct(x.median_price_yoy)}<br><small class="muted">median sale price</small>`
        : x.list_price != null ? `${money(x.list_price)}${pct(x.list_price_yoy)}<br><small class="muted">median list price</small>`
        : x.home_value != null ? `${money(x.home_value)}${pct(x.home_value_yoy)}<br><small class="muted">typical home value</small>` : dash;
      const active = x.active != null ? `${Number(x.active).toLocaleString("en-US")}${pct(x.active_yoy)}` : x.active_yoy != null ? pct(x.active_yoy).replace(" <small", "<small") : dash;
      const sales = x.sales != null ? `${Number(x.sales).toLocaleString("en-US")}${pct(x.sales_yoy)}` : x.sales_yoy != null ? pct(x.sales_yoy).replace(" <small", "<small") : dash;
      return `<tr><th scope="row"><a class="link" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a><br><small class="muted">${esc(x.basis)} · ${esc(x.period)}</small></th>
        <td>${price}</td><td>${active}</td><td>${x.moi != null ? Number(x.moi).toFixed(1) : dash}</td><td>${x.dom != null ? `${x.dom}<br><small class="muted">${esc(x.dom_label || "days")}</small>` : dash}</td><td>${sales}</td></tr>
        ${x.extra ? `<tr class="rep-extra"><td colspan="6"><small class="muted">${esc(x.extra)}</small></td></tr>` : ""}`;
    }).join("");
    document.getElementById("report-table").innerHTML = `<div class="table-wrap"><table class="report-table"><thead><tr><th>Source</th><th>Price</th><th>Homes for sale</th><th>Months of supply</th><th>Days on market</th><th>Sales</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    document.getElementById("report-note").textContent = `Figures are quoted as each source published them; we link every report so you can check the original. Last checked ${R.checked}.`;
  }).catch(() => { const s = document.getElementById("reports"); if (s) s.hidden = true; });
})();
