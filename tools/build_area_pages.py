#!/usr/bin/env python3
"""Builds a crawlable page per area at /areas/<id>.html from data/neighborhoods.json.
Run from the repo root after editing area data:  python3 tools/build_area_pages.py
The page ships the key facts as plain HTML (for Google and link previews); neighborhoods.js
then replaces it with the full interactive profile."""
import json, html, re, sys
BASE = "https://dallasrealestateinternet.com/"
V = sys.argv[1] if len(sys.argv) > 1 else "1"
J = json.load(open("data/neighborhoods.json")); M = J["meta"]
P = json.load(open("data/photos.json"))
e = lambda s: html.escape(str(s), quote=True)
PTS = [("downtown_dallas", "Downtown Dallas"), ("legacy_plano", "Legacy West (Plano)"), ("dfw_airport", "DFW Airport"), ("downtown_fw", "Downtown Fort Worth")]
lbl = lambda x: "You're there" if x["min"] <= 2 else "~%d min" % x["min"]
fmt = lambda r: (("%.4f" % r).rstrip("0").rstrip("."))
TPL = open("tools/area_template.html").read()
urls = []
for n in J["neighborhoods"]:
    place = n["name"] if n["name"] == n["city"] or n["city"] in n["name"] else f'{n["name"]}, {n["city"]}'
    title = f"Living in {place}, TX: Homes, Schools, Commutes & Taxes"
    desc = n["lifestyle_summary"]
    if len(desc) > 158: desc = desc[:155].rsplit(" ", 1)[0] + "…"
    ph = P.get(n.get("photo") or "", {})
    img = ph.get("url") or ph.get("src") or ""
    c = n.get("commute", {}); t = n.get("tax", {})
    commute = "".join(f'<li><span>{lab}</span> <strong>{lbl(c[k])}</strong> <small>{c[k]["mi"]} mi</small></li>' for k, lab in PTS if k in c)
    taxrows = "".join(f'<tr><td>{e(r["label"])}</td><td class="num">{fmt(r["city"])}</td><td class="num">{fmt(r["isd"])}</td><td class="num">{fmt(r["county"])}</td><td class="num"><strong>{fmt(r["total"])}%</strong></td></tr>' for r in t.get("rows", []))
    body = f'''<div class="area-static">
  <p><a class="link" href="neighborhoods.html">← All neighborhoods</a></p>
  <span class="eyebrow">{e(n["submarket"])}</span>
  <h1>Living in {e(place)}</h1>
  <p class="lede">{e(n["lifestyle_summary"])}</p>
  <div class="facts">
    <div class="fact"><span class="k">Home types</span><span class="v">{e(", ".join(n["home_types"]))}</span></div>
    <div class="fact"><span class="k">Home age</span><span class="v">{e(n["home_age"])}</span></div>
    <div class="fact"><span class="k">Lots</span><span class="v">{e(n["lot_profile"])}</span></div>
    <div class="fact"><span class="k">HOA</span><span class="v">{e(n["hoa"])}</span></div>
    <div class="fact"><span class="k">School districts</span><span class="v">{e(", ".join(n["isd"]))}</span></div>
  </div>
  <h2>Getting around</h2><p>{e(n["commute_profile"])}</p>
  <ul class="clean">{commute}</ul>
  <p class="stamp">{e(M.get("commute_source", ""))}</p>
  <h2>{t.get("year", "")} property tax rates</h2>
  <div class="table-wrap"><table><thead><tr><th>Location</th><th class="num">City</th><th class="num">School district</th><th class="num">County</th><th class="num">Total</th></tr></thead><tbody>{taxrows}</tbody></table></div>
  <p class="stamp">{e(M.get("tax_source", ""))}</p>
  <h2>Strengths</h2><ul>{"".join(f"<li>{e(x)}</li>" for x in n["pros"])}</ul>
  <h2>Tradeoffs</h2><ul>{"".join(f"<li>{e(x)}</li>" for x in n["cons"])}</ul>
  <h2>Nearby</h2><p>{e(", ".join(n["amenities"]))}</p>
  <h2>Development watch</h2><p>{e(n["development"])}</p>
  <p><a class="btn btn-brass" href="https://calendly.com/kohlklaus-kw/30min">Book a call about {e(n["name"])}</a> <a class="btn btn-ghost" href="tel:3377949971">Call or text Kohl</a></p>
</div>'''
    url = f"{BASE}areas/{n['id']}.html"; urls.append(url)
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Neighborhoods", "item": BASE + "neighborhoods.html"},
        {"@type": "ListItem", "position": 2, "name": n["name"], "item": url}]}
    out = (TPL.replace("{{TITLE}}", e(title + " · Dallas Real Estate Internet")).replace("{{OGTITLE}}", e(title))
           .replace("{{DESC}}", e(desc)).replace("{{URL}}", url).replace("{{ID}}", n["id"]).replace("{{BODY}}", body)
           .replace("{{LD}}", json.dumps(ld, ensure_ascii=False)).replace("{{V}}", V))
    open(f"areas/{n['id']}.html", "w").write(out)
# sitemap: keep top-level pages, replace area urls
sm = open("sitemap.xml").read()
sm = re.sub(r"  <url><loc>[^<]*/areas/[^<]*</loc>.*?</url>\n", "", sm)
today = M.get("last_updated", "")
add = "".join(f"  <url><loc>{u}</loc><lastmod>2026-10-21</lastmod></url>\n" for u in urls)
sm = sm.replace("</urlset>", add + "</urlset>")
open("sitemap.xml", "w").write(sm)
print(len(urls), "area pages")
