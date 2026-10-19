/*
 * "What's being built" timeline. Projects hang off a horizontal line grouped by when they open.
 * Reads data/explore.json developments as-is (name, city, type, status, timing, summary, source, url).
 * Optional per-project override: "year": 2028 pins a project to that stop.
 */
(function () {
  const { esc } = window.DREI;
  const NOW = new Date().getFullYear();

  function phaseOf(d) {
    if (/^(Open|Complete)$/i.test(d.status)) return { key: "open", label: "Open now", tone: "open", order: 0 };
    if (/Stall|Paused|Cancel/i.test(d.status)) return { key: "hold", label: "On hold", tone: "hold", order: 99 };
    let y = Number(d.year) || 0;
    if (!y) {
      const ys = (String(d.timing).match(/\b20\d{2}\b/g) || []).map(Number).filter((n) => n >= NOW);
      y = ys.length ? (/begin|start/i.test(d.timing) ? Math.min(...ys) : Math.max(...ys)) : NOW;
    }
    if (y <= NOW && /Planned|Proposed/i.test(d.status)) return { key: "tbd", label: "Planned · date TBD", tone: "later", order: 90 };
    if (y <= NOW) return { key: "now", label: "Building now", tone: "build", order: 1 };
    return { key: "y" + y, label: "Coming " + y, tone: y === NOW + 1 ? "next" : "later", order: 2 + (y - NOW) };
  }

  /** opts.compact: one project per stop, no summaries, no "On hold" (used on the homepage). */
  function render(list, opts = {}) {
    const stops = {};
    list.forEach((d) => { const p = phaseOf(d); (stops[p.key] = stops[p.key] || { ...p, items: [] }).items.push(d); });
    let ordered = Object.values(stops).sort((a, b) => a.order - b.order);
    if (opts.compact) ordered = ordered.filter((s) => s.key !== "hold");
    return `<div class="tl${opts.compact ? " tl-compact" : ""}"><div class="tl-track">${ordered.map((s) => `
      <section class="tl-stop t-${s.tone}">
        <header class="tl-head"><i class="tl-dot" aria-hidden="true"></i><b>${esc(s.label)}</b>${opts.compact ? "" : `<small>${s.items.length} project${s.items.length > 1 ? "s" : ""}</small>`}</header>
        ${(opts.compact ? s.items.slice(0, 1) : s.items).map((d) => `
        <article class="tl-item" data-city="${esc(d.city)}">
          <span class="tl-meta">${esc(d.type)} · ${esc(d.city)}</span>
          <h3>${opts.compact ? `<a href="explore.html#developments">${esc(d.name)}</a>` : esc(d.name)}</h3>
          <p class="tl-when">${esc(d.timing)}</p>
          ${opts.compact ? "" : `<p>${esc(d.summary)}</p><a class="stamp" href="${esc(d.url)}" target="_blank" rel="noopener">Source: ${esc(d.source)} ↗</a>`}
        </article>`).join("")}
      </section>`).join("")}</div></div>`;
  }

  /** Hide projects outside `city` ("" = all) and any stop left empty. */
  function filter(root, city) {
    root.querySelectorAll(".tl-item").forEach((i) => (i.hidden = !!city && i.dataset.city !== city));
    root.querySelectorAll(".tl-stop").forEach((s) => (s.hidden = !s.querySelector(".tl-item:not([hidden])")));
  }

  window.DREI_DEVS = { render, filter, phaseOf };
})();
