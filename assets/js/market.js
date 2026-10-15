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
    document.getElementById("m-asof").textContent = loaded ? `Data as of ${M.as_of} · ${M.source || ""}` : "Status: awaiting first verified snapshot";

    document.getElementById("kpis").innerHTML = Object.values(M.metrics).map((m) => {
      const v = fmt(m);
      const chg = m.change_yoy_pct;
      return `<div class="kpi"><span class="k">${esc(m.label)}</span>
        <span class="v">${v ? esc(v) : '<span class="pending" style="font-size:.85rem">Pending</span>'}</span>
        ${chg != null ? `<span class="stamp" style="color:${chg >= 0 ? "var(--good)" : "var(--bad)"}">${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg)}% YoY</span>` : `<span class="stamp">${m.as_of ? "as of " + esc(m.as_of) : "&nbsp;"}</span>`}</div>`;
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

    const rows = M.by_area || [];
    document.getElementById("by-area").innerHTML = rows.length
      ? `<div class="table-wrap"><table><thead><tr><th>Area</th><th class="num">Median price</th><th class="num">Active</th><th class="num">Days on market</th><th class="num">Months inv.</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td><a class="link" href="neighborhoods.html#${esc(r.id)}">${esc(r.name)}</a></td><td class="num">${r.median_price != null ? money(r.median_price) : "—"}</td><td class="num">${r.active ?? "—"}</td><td class="num">${r.dom ?? "—"}</td><td class="num">${r.moi ?? "—"}</td></tr>`).join("")}
        </tbody></table></div>`
      : `<div class="note">Area-level figures will appear here as they're verified each month. In the meantime, every <a class="link" href="neighborhoods.html">neighborhood profile</a> covers home types, commutes, taxes and tradeoffs.</div>`;
  }).catch(() => {
    document.getElementById("m-summary").textContent = "Couldn't load market data. Refresh to try again.";
  });
})();
