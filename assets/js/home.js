(function () {
  const { esc, tier, shields, store, track, loadJSON } = window.DREI;
  const go = (q) => { if (!q.trim()) return; store.set("pendingQ", q.trim()); track("ask", { from: "home" }); location.href = "ask.html"; };
  document.getElementById("hero-form").addEventListener("submit", (e) => { e.preventDefault(); go(document.getElementById("hero-q").value); });
  document.querySelectorAll("#hero-chips .chip").forEach((b) => b.addEventListener("click", () => go(b.textContent)));

  loadJSON("data/neighborhoods.json").then((d) => {
    const pick = ["frisco", "richardson", "mckinney"].map((id) => d.neighborhoods.find((n) => n.id === id)).filter(Boolean);
    document.getElementById("featured-areas").innerHTML = pick.map(card).join("");
  }).catch(() => {});

  loadJSON("data/articles.json").then((d) => {
    const a = d.articles.find((x) => x.slug === "frisco-vs-plano") || d.articles[0];
    document.getElementById("featured-story").innerHTML = `
      <span class="eyebrow">Featured story · ${esc(a.format)}</span>
      <h3>${esc(a.title)}</h3>
      <p class="muted">${esc(a.dek)}</p>
      <div><a class="btn" href="intelligence.html#${esc(a.slug)}">Read the guide</a></div>`;
  }).catch(() => {});

  function card(n) {
    return `<a class="card" href="neighborhoods.html#${esc(n.id)}">
      <div class="meta"><span>${esc(n.submarket)}</span></div>
      <h3>${esc(n.name)}</h3>
      ${tier(n.price_tier)}
      <p class="muted" style="font-size:.93rem">${esc(n.lifestyle_summary)}</p>
      ${shields(n.routes)}
    </a>`;
  }
  window.DREI.areaCard = card;
})();
