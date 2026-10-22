#!/usr/bin/env python3
"""Builds a crawlable page per guide at /guides/<slug>.html from data/articles.json.
Run from the repo root after adding or editing a guide:  python3 tools/build_guide_pages.py <asset-version>
The page ships the full guide as plain HTML; intelligence.js then renders the interactive version."""
import json, html, re, sys, os
BASE = "https://dallasrealestateinternet.com/"
V = sys.argv[1] if len(sys.argv) > 1 else "1"
A = json.load(open("data/articles.json"))
S = A.get("sections", {})
e = lambda s: html.escape(str(s), quote=True)
TPL = open("tools/guide_template.html").read()
os.makedirs("guides", exist_ok=True)

def block(b):
    t, c = b
    if t == "p": return f"<p>{e(c)}</p>"
    if t == "h2": return f"<h2>{e(c)}</h2>"
    if t == "ul": return "<ul class=\"clean\">" + "".join(f"<li>{e(x)}</li>" for x in c) + "</ul>"
    if t == "note": return f"<p class=\"note\">{e(c)}</p>"
    return ""

urls = []
for a in A["articles"]:
    sec = S.get(a.get("section"), {})
    url = f"{BASE}guides/{a['slug']}.html"; urls.append(url)
    body = f'''<p><a class="link" href="intelligence.html#{e(a.get("section", ""))}">← {e(sec.get("name", "All guides"))}</a></p>
<span class="eyebrow">{e(a["format"])}</span>
<h1 style="font-size:var(--step-4);margin:.5rem 0 1rem">{e(a["title"])}</h1>
<p class="lede">{e(a["dek"])}</p>
<p class="stamp">Published {e(a["date"])} · {a["read_min"]} min read · Source: {e(a["source"])}</p>
{"".join(block(b) for b in a["body"])}
<p><a class="btn btn-brass" href="https://calendly.com/kohlklaus-kw/30min">Book a call with Kohl</a> <a class="btn" href="ask.html">Ask Dallas AI a follow-up</a></p>'''
    ld = {"@context": "https://schema.org", "@type": "Article", "headline": a["title"], "description": a["dek"], "datePublished": a["date"],
          "author": {"@type": "Person", "name": "Kohl Klaus"}, "publisher": {"@type": "Organization", "name": "The Dallas Real Estate Internet"}, "mainEntityOfPage": url}
    out = (TPL.replace("{{TITLE}}", e(a["title"] + " · Dallas Real Estate Internet")).replace("{{OGTITLE}}", e(a["title"]))
           .replace("{{DESC}}", e(a["dek"])).replace("{{URL}}", url).replace("{{SLUG}}", a["slug"]).replace("{{BODY}}", body)
           .replace("{{LD}}", json.dumps(ld, ensure_ascii=False)).replace("{{V}}", V))
    open(f"guides/{a['slug']}.html", "w").write(out)
sm = open("sitemap.xml").read()
sm = re.sub(r"  <url><loc>[^<]*/guides/[^<]*</loc>.*?</url>\n", "", sm)
sm = sm.replace("</urlset>", "".join(f"  <url><loc>{u}</loc><lastmod>2026-10-21</lastmod></url>\n" for u in urls) + "</urlset>")
open("sitemap.xml", "w").write(sm)
print(len(urls), "guide pages")
