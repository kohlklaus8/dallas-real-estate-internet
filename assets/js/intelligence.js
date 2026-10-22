(function () {
  const { esc, loadJSON, track, photoUrl, photoCredit } = window.DREI;
  let PHOTOS = {};
  const TOOL = {
    null: null, proceeds: ["tools.html#proceeds", "Estimate my net proceeds"], compare: ["tools.html#compare", "Compare areas"], affordability: ["tools.html#affordability", "Run affordability"], fit: ["tools.html#fit", "Where should I live?"] };
  let D = null;

  function block([type, content]) {
    if (type === "p") return `<p>${esc(content)}</p>`;
    if (type === "h2") return `<h2>${esc(content)}</h2>`;
    if (type === "ul") return `<ul class="clean">${content.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;
    if (type === "note") return `<p class="note">${esc(content)}</p>`;
    return "";
  }

  function list(sec) {
    const S = D.sections || {};
    const info = S[sec];
    document.getElementById("sec-eyebrow").textContent = info ? "Guides" : "Guides";
    document.getElementById("sec-title").textContent = info ? info.name : "Everything DFW, explained";
    document.getElementById("sec-blurb").textContent = info ? info.blurb : "Real estate, neighborhoods, moving here and living here. Plain-English guides, all dated and sourced.";
    document.getElementById("sec-filters").innerHTML = [["", "All"]].concat(Object.entries(S).map(([k, v]) => [k, v.name]))
      .map(([k, n]) => `<a class="chip" href="#${k}" style="${(sec || "") === k ? "border-color:var(--ink);color:var(--ink);font-weight:600" : ""}">${esc(n)}</a>`).join("");
    const extra = { "real-estate": `<div class="starts" style="margin-bottom:1.5rem"><a class="start" href="market.html"><strong>The market now</strong><span>Inventory, prices and timing, in plain English.</span><em>Open →</em></a><a class="start" href="tools.html#affordability"><strong>What can I afford?</strong><span>A comfortable price range with Texas taxes included.</span><em>Start →</em></a><a class="start" href="tools.html#proceeds"><strong>What would I net?</strong><span>Your take-home from a sale, itemized.</span><em>Start →</em></a></div>`,
      neighborhoods: `<div class="starts" style="margin-bottom:1.5rem"><a class="start" href="neighborhoods.html"><strong>All 40 areas</strong><span>Profiles from Fort Worth to Rockwall, including in-city Dallas.</span><em>Browse →</em></a><a class="start" href="tools.html#fit"><strong>Where should I live?</strong><span>A shortlist based on your commute and budget.</span><em>Start →</em></a><a class="start" href="tools.html#compare"><strong>Compare areas</strong><span>Two to four areas side by side.</span><em>Start →</em></a></div>`,
      moving: `<div class="starts" style="margin-bottom:1.5rem"><a class="start" href="guides/dfw-moving-checklist.html"><strong>First 90 days checklist</strong><span>Licenses, registration, homestead.</span><em>Read →</em></a><a class="start" href="tools.html#fit"><strong>Pick your area</strong><span>Start with your commute.</span><em>Start →</em></a><a class="start" href="tools.html#affordability"><strong>Set your budget</strong><span>Know your range before you tour.</span><em>Start →</em></a></div>` }[sec] || "";
    document.getElementById("sec-extra").innerHTML = extra;
    const rows = D.articles.filter((a) => !sec || a.section === sec);
    document.getElementById("articles").innerHTML = rows.map((a) => `
      <a class="card" href="guides/${esc(a.slug)}.html">
        <span class="eyebrow">${esc((S[a.section] || {}).name || a.format)} · ${esc(a.format)}</span>
        <h3>${esc(a.title)}</h3>
        <p class="muted" style="font-size:.93rem">${esc(a.dek)}</p>
        <span class="stamp">${esc(a.date)} · ${a.read_min} min read</span>
      </a>`).join("") || `<p class="muted">New guides for this section are on the way.</p>`;
    document.getElementById("formats").innerHTML = D.formats.map((f) => `<tr><td><strong>${esc(f.name)}</strong></td><td>${esc(f.cadence)}</td><td class="muted">${esc(f.example)}</td></tr>`).join("");
    document.title = (info ? info.name : "Guides") + " · " + window.DREI.C.BRAND_NAME;
  }

  function show(a) {
    const t = TOOL[a.tool];
    document.getElementById("article-view").innerHTML = `
      <p><a class="link" href="intelligence.html#${esc(a.section || "")}">← ${esc(((D.sections || {})[a.section] || {}).name || "All guides")}</a></p>
      <span class="eyebrow">${esc(a.format)}</span>
      <h1 style="font-size:var(--step-4);margin:.5rem 0 1rem">${esc(a.title)}</h1>
      <p class="lede" style="margin-bottom:.6rem">${esc(a.dek)}</p>
      ${a.photo && PHOTOS[a.photo] ? `<figure style="margin:0 0 1.5rem"><div class="detail-photo" style="aspect-ratio:16/8;background-image:url('${photoUrl(PHOTOS[a.photo], 1400)}')" role="img" aria-label="${esc(PHOTOS[a.photo].place)}"></div><figcaption class="stamp">${esc(PHOTOS[a.photo].place)} · ${photoCredit(PHOTOS[a.photo])}</figcaption></figure>` : ""}
      <p class="stamp" style="margin-bottom:2rem">Published ${esc(a.date)} · ${a.read_min} min read · Source: ${esc(a.source)}</p>
      ${a.body.map(block).join("")}
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:2rem">
        ${t ? `<a class="btn btn-brass" href="${t[0]}">${esc(t[1])}</a>` : ""}
        <a class="btn" href="ask.html">Ask Dallas AI a follow-up</a>
      </div>`;
    if (!window.DREI_ARTICLE) document.title = `${a.title} · Dallas Real Estate Internet`;
    track("read_article", { slug: a.slug });
  }

  function route() {
    const hashSlug = location.hash.replace("#", "");
    // Old #slug links forward to the guide's own page.
    if (!window.DREI_ARTICLE && hashSlug && D.articles.some((x) => x.slug === hashSlug)) { location.replace("guides/" + hashSlug + ".html"); return; }
    const slug = window.DREI_ARTICLE || hashSlug;
    const a = D && D.articles.find((x) => x.slug === slug);
    const sec = D && D.sections && D.sections[slug] ? slug : "";
    const lv = document.getElementById("list-view"); if (lv) lv.hidden = !!a;
    document.getElementById("article-view").hidden = !a;
    if (a) { show(a); window.scrollTo(0, 0); } else { list(sec); }
  }

  Promise.all([loadJSON("data/articles.json"), loadJSON("data/photos.json").catch(() => ({}))]).then(([d, P]) => { D = d; PHOTOS = P; window.addEventListener("hashchange", route); route(); });
})();
