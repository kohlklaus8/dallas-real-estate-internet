#!/usr/bin/env python3
"""Builds side-by-side area comparison pages at /compare/<a>-vs-<b>.html plus /compare/index.html.
Pairs live in data/compare.json. Run from the repo root:  python3 tools/build_compare_pages.py <asset-version>
Everything on the page comes from data/neighborhoods.json and data/market.json, so rerun after those change."""
import json, html, re, sys, os
BASE = "https://dallasrealestateinternet.com/"
V = sys.argv[1] if len(sys.argv) > 1 else "1"
J = json.load(open("data/neighborhoods.json")); META = J["meta"]
N = {n["id"]: n for n in J["neighborhoods"]}
MK = json.load(open("data/market.json")); MA = {a["id"]: a for a in MK.get("by_area", [])}
PAIRS = json.load(open("data/compare.json"))["pairs"]
import datetime
ASOF = datetime.date.fromisoformat(MK.get("as_of", "2026-09") + "-01").strftime("%B %Y") if MK.get("as_of") else ""
TPL = open("tools/compare_template.html").read()
e = lambda s: html.escape(str(s), quote=True)
money = lambda v: "${:,.0f}".format(round(v / 1000) * 1000) if v else "n/a"
def hv_text(m):
    r = m.get("zip_range")
    if r: return money(r[0]) if abs(r[1] - r[0]) < 1000 else f"{money(r[0])} to {money(r[1])}"
    return money(m.get("home_value"))
PTS = [("downtown_dallas", "Downtown Dallas"), ("legacy_plano", "Legacy West (Plano)"), ("dfw_airport", "DFW Airport"), ("downtown_fw", "Downtown Fort Worth")]
SC = {"new_construction": ("newer homes and new construction", "established homes"), "lot_size": ("bigger lots", "smaller lots"),
      "amenities": ("more shopping, dining and things to do", "a quieter setting"), "commute_dallas": ("a shorter drive to Dallas", ""),
      "commute_north": ("a shorter drive to the Legacy/SH 121 job corridor", ""), "rail": ("rail access (DART or TEXRail)", ""),
      "lake": ("lake access", ""), "value": ("more home for the money", "")}
os.makedirs("compare", exist_ok=True)
def place(n): return n["name"] if n["name"] == n["city"] or n["city"] in n["name"] else f'{n["name"]} ({n["city"]})'
def short(n): return n["name"].split(" & ")[0]
def taxtot(n):
    r = n.get("tax", {}).get("rows", [])
    if not r: return None
    lo, hi = min(x["total"] for x in r), max(x["total"] for x in r)
    return f"{lo:.2f}%" if abs(hi - lo) < 0.005 else f"{lo:.2f}% to {hi:.2f}%"
urls, cards = [], []
for a_id, b_id in PAIRS:
    A, B = N[a_id], N[b_id]; ma, mb = MA.get(a_id, {}), MA.get(b_id, {})
    slug = f"{a_id}-vs-{b_id}"; url = f"{BASE}compare/{slug}.html"; urls.append(url)
    sa, sb = short(A), short(B)
    title = f"{sa} vs {sb}: Which Fits You Better?"
    # where each one leads, from the editorial scores (describe places, never people)
    leads_a = [SC[k][0] for k in SC if SC[k][0] and A["scores"].get(k, 0) - B["scores"].get(k, 0) >= 2]
    leads_b = [SC[k][0] for k in SC if SC[k][0] and B["scores"].get(k, 0) - A["scores"].get(k, 0) >= 2]
    def sent(name, items):
        if not items: return ""
        return f"Pick {name} for {', '.join(items[:-1]) + (' and ' if len(items) > 1 else '') + items[-1]}."
    verdict = " ".join(x for x in [sent(sa, leads_a), sent(sb, leads_b)] if x) or f"{sa} and {sb} are close on most measures, so the deciding factors are usually the exact school zone and the commute."
    hv = ""
    if (ma.get("zip_range") or ma.get("home_value")) and (mb.get("zip_range") or mb.get("home_value")):
        hv = f"Typical home values run {hv_text(ma)} in {sa} and {hv_text(mb)} in {sb}, by ZIP code (Zillow Home Value Index, {ASOF})."
    desc = f"{sa} vs {sb} side by side: home prices, home age, school districts, property tax rates and drive times. {verdict}"
    if len(desc) > 158: desc = desc[:155].rsplit(" ", 1)[0] + "…"
    row = lambda label, va, vb: f"<tr><th scope='row'>{e(label)}</th><td>{va}</td><td>{vb}</td></tr>"
    rows = [
        row("Typical home value, by ZIP", e(hv_text(ma)), e(hv_text(mb))),
        row("Citywide value trend, past year", e(f"{ma['home_value_yoy']:+.1f}% ({A['city']})") if ma.get("home_value_yoy") is not None else "n/a", e(f"{mb['home_value_yoy']:+.1f}% ({B['city']})") if mb.get("home_value_yoy") is not None else "n/a"),
        row("Price tier", "$" * A["price_tier"], "$" * B["price_tier"]),
        row("Home types", e(", ".join(A["home_types"])), e(", ".join(B["home_types"]))),
        row("Home age", e(A["home_age"]), e(B["home_age"])),
        row("Lots", e(A["lot_profile"]), e(B["lot_profile"])),
        row("HOA", e(A["hoa"]), e(B["hoa"])),
        row("School districts", e(", ".join(A["isd"])), e(", ".join(B["isd"]))),
        row(f"Property tax rate ({A.get('tax', {}).get('year', 2025)}, total)", e(taxtot(A) or "n/a"), e(taxtot(B) or "n/a")),
    ]
    for k, lab in PTS:
        ca, cb = A.get("commute", {}).get(k), B.get("commute", {}).get(k)
        if ca and cb: rows.append(row(f"Drive to {lab}", f"~{ca['min']} min <small>{ca['mi']} mi</small>", f"~{cb['min']} min <small>{cb['mi']} mi</small>"))
    rows.append(row("Major roads", e(", ".join(A["routes"])), e(", ".join(B["routes"]))))
    rows.append(row("Nearby", e(", ".join(A["amenities"][:5])), e(", ".join(B["amenities"][:5]))))
    side = lambda n: f'''<div class="card"><h3>{e(place(n))}</h3><p>{e(n["lifestyle_summary"])}</p>
<p><strong>Strengths</strong></p><ul>{"".join(f"<li>{e(x)}</li>" for x in n["pros"])}</ul>
<p><strong>Tradeoffs</strong></p><ul>{"".join(f"<li>{e(x)}</li>" for x in n["cons"])}</ul>
<p><a class="link" href="areas/{n["id"]}.html">Full {e(short(n))} profile: schools, taxes, places to eat →</a></p></div>'''
    body = f'''<p><a class="link" href="compare/">← All comparisons</a></p>
<span class="eyebrow">Area comparison</span>
<h1 style="font-size:var(--step-4);margin:.5rem 0 1rem">{e(sa)} vs {e(sb)}</h1>
<p class="lede">{e(verdict)} {e(hv)}</p>
<div class="table-wrap"><table class="compare-table"><thead><tr><th></th><th scope="col">{e(place(A))}</th><th scope="col">{e(place(B))}</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>
<p class="stamp">Home values: Zillow Home Value Index, {e(ASOF)}. Tax rates: {e(META.get("tax_source", ""))} Drive times: {e(META.get("commute_source", ""))} School districts vary by street, so verify by address.</p>
<div class="grid grid-2" style="margin-top:1.5rem">{side(A)}{side(B)}</div>
<h2>Still deciding?</h2>
<p>Tell the free DFW AI your commute, budget and must-haves and it will weigh {e(sa)} and {e(sb)} for you, or talk it through with Kohl.</p>
<p><a class="btn btn-brass" href="https://calendly.com/kohlklaus-kw/30min">Book a free 30-minute call</a> <a class="btn" href="ask.html">Ask the DFW AI</a> <a class="btn btn-ghost" href="tools.html#fit">Where should I live?</a></p>'''
    ld = {"@context": "https://schema.org", "@type": "Article", "headline": title, "description": desc, "datePublished": "2026-10-22",
          "author": {"@type": "Person", "name": "Kohl Klaus"}, "publisher": {"@type": "Organization", "name": "The Dallas Real Estate Internet"}, "mainEntityOfPage": url}
    out = (TPL.replace("{{TITLE}}", e(title + " · Dallas Real Estate Internet")).replace("{{OGTITLE}}", e(title)).replace("{{DESC}}", e(desc))
           .replace("{{URL}}", url).replace("{{SLUG}}", slug).replace("{{BODY}}", body).replace("{{LD}}", json.dumps(ld, ensure_ascii=False)).replace("{{V}}", V))
    open(f"compare/{slug}.html", "w").write(out)
    cards.append(f'<a class="card compare-card" href="compare/{slug}.html"><strong>{e(sa)} vs {e(sb)}</strong><span class="muted">{e(verdict)}</span></a>')
# index
iurl = BASE + "compare/"
ibody = f'''<span class="eyebrow">Compare areas</span>
<h1 style="font-size:var(--step-4);margin:.5rem 0 1rem">DFW suburbs and neighborhoods, side by side</h1>
<p class="lede">Home values, home age, school districts, property tax rates and drive times for the matchups people ask about most.</p>
<div class="grid grid-2">{"".join(cards)}</div>
<p style="margin-top:1.5rem"><a class="btn" href="tools.html#compare">Compare any two areas yourself →</a></p>'''
ild = {"@context": "https://schema.org", "@type": "CollectionPage", "name": "DFW area comparisons", "url": iurl}
out = (TPL.replace("{{TITLE}}", "Compare DFW Suburbs Side by Side · Dallas Real Estate Internet").replace("{{OGTITLE}}", "Compare DFW suburbs side by side")
       .replace("{{DESC}}", "Frisco vs McKinney, Prosper vs Celina, Rockwall vs Rowlett and more: home values, schools, taxes and commutes side by side.")
       .replace("{{URL}}", iurl).replace("{{SLUG}}", "index").replace("{{BODY}}", ibody).replace("{{LD}}", json.dumps(ild)).replace("{{V}}", V))
open("compare/index.html", "w").write(out)
sm = open("sitemap.xml").read()
sm = re.sub(r"  <url><loc>[^<]*/compare/[^<]*</loc>.*?</url>\n", "", sm)
sm = sm.replace("</urlset>", "".join(f"  <url><loc>{u}</loc><lastmod>2026-10-22</lastmod></url>\n" for u in [iurl] + urls) + "</urlset>")
open("sitemap.xml", "w").write(sm)
print(len(urls), "comparison pages")
