(function () {
  const { esc, loadJSON, track } = window.DREI;
  const TOOL = { proceeds: ["tools.html#proceeds", "Estimate my net proceeds"], compare: ["tools.html#compare", "Compare areas"], affordability: ["tools.html#affordability", "Run affordability"], fit: ["tools.html#fit", "Where should I live?"] };
  let D = null;

  function block([type, content]) {
    if (type === "p") return `<p>${esc(content)}</p>`;
    if (type === "h2") return `<h2>${esc(content)}</h2>`;
    if (type === "ul") return `<ul class="clean">${content.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;
    if (type === "note") return `<p class="note">${esc(content)}</p>`;
    return "";
  }

  function list() {
    document.getElementById("articles").innerHTML = D.articles.map((a) => `
      <a class="card" href="#${esc(a.slug)}">
        <span class="eyebrow">${esc(a.format)}</span>
        <h3>${esc(a.title)}</h3>
        <p class="muted" style="font-size:.93rem">${esc(a.dek)}</p>
        <span class="stamp">${esc(a.date)} · ${a.read_min} min read</span>
      </a>`).join("");
    document.getElementById("formats").innerHTML = D.formats.map((f) => `<tr><td><strong>${esc(f.name)}</strong></td><td>${esc(f.cadence)}</td><td class="muted">${esc(f.example)}</td></tr>`).join("");
  }

  function show(a) {
    const t = TOOL[a.tool];
    document.getElementById("article-view").innerHTML = `
      <p><a class="link" href="#">← All intelligence</a></p>
      <span class="eyebrow">${esc(a.format)}</span>
      <h1 style="font-size:var(--step-4);margin:.5rem 0 1rem">${esc(a.title)}</h1>
      <p class="lede" style="margin-bottom:.6rem">${esc(a.dek)}</p>
      <p class="stamp" style="margin-bottom:2rem">Published ${esc(a.date)} · ${a.read_min} min read · Source: ${esc(a.source)}</p>
      ${a.body.map(block).join("")}
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:2rem">
        ${t ? `<a class="btn btn-brass" href="${t[0]}">${esc(t[1])}</a>` : ""}
        <a class="btn" href="ask.html">Ask Dallas AI a follow-up</a>
      </div>`;
    document.title = `${a.title} · Dallas Real Estate Internet`;
    track("read_article", { slug: a.slug });
  }

  function route() {
    const slug = location.hash.replace("#", "");
    const a = D && D.articles.find((x) => x.slug === slug);
    document.getElementById("list-view").hidden = !!a;
    document.getElementById("article-view").hidden = !a;
    if (a) { show(a); window.scrollTo(0, 0); } else { document.title = "Intelligence · Dallas Real Estate Internet"; list(); }
  }

  loadJSON("data/articles.json").then((d) => { D = d; window.addEventListener("hashchange", route); route(); });
})();
