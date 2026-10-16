#!/usr/bin/env python3
"""
Build data/market.json from PUBLIC Zillow Research data only (no NTREIS/MLS data).
Input: a text snapshot made by the weekly task (see README "Market data"):
  ZIP <date>   zip,city,value_now,value_12mo_ago;...
  CITY <date>  city,,value_now,value_12mo_ago;...
  METRO        one line per metric: <name> <date> <now> <year_ago> [YYYY-MM:val,...]
Usage: python3 tools/build_market.py data_raw/zillow_YYYY-MM.txt
"""
import json, sys, datetime

ZILLOW_URL = "https://www.zillow.com/research/data/"


def pct(a, b):
    return round((a / b - 1) * 100, 1) if a and b else None


def parse(path):
    lines = open(path).read().strip().splitlines()
    out = {"zip": {}, "city": {}, "metro": {}}
    i = 0
    while i < len(lines):
        ln = lines[i].strip()
        if ln.startswith("ZIP ") or ln.startswith("CITY "):
            kind, date = ln.split()
            kind = kind.lower()
            out[kind + "_date"] = date
            for rec in lines[i + 1].split(";"):
                p = rec.split(",")
                if len(p) == 4:
                    out[kind][p[0]] = {"city": p[1], "now": int(p[2]), "ago": int(p[3])}
            i += 2
            continue
        if ln == "METRO":
            for m in lines[i + 1:]:
                p = m.split()
                if len(p) < 4:
                    continue
                series = [dict(zip(("month", "v"), kv.split(":"))) for kv in p[4].split(",")] if len(p) > 4 else []
                out["metro"][p[0]] = {"date": p[1], "now": float(p[2]), "ago": float(p[3]), "series": series}
            break
        i += 1
    return out


def main():
    Z = parse(sys.argv[1])
    N = json.load(open("data/neighborhoods.json"))["neighborhoods"]
    M = Z["metro"]
    month = lambda d: d[:7]

    by_zip = [{"zip": z, "city": v["city"], "home_value": v["now"], "home_value_yoy": pct(v["now"], v["ago"])} for z, v in sorted(Z["zip"].items())]
    zlookup = {r["zip"]: r for r in by_zip}

    by_area = []
    for n in N:
        names = [n["market_city"]] + (["Fairview"] if n["id"] == "lucas-fairview" else ["Melissa"] if n["id"] == "anna-melissa" else [])
        c = Z["city"].get(n["market_city"])
        row = {"id": n["id"], "name": n["name"], "city": n["market_city"], "cities": names, "zips": n.get("zips", [])}
        if c:
            row.update({"home_value": c["now"], "home_value_yoy": pct(c["now"], c["ago"])})
        vals = [zlookup[z]["home_value"] for z in n.get("zips", []) if z in zlookup]
        if vals:
            row["zip_range"] = [min(vals), max(vals)]
        by_area.append(row)

    inv, sales = M.get("inventory"), M.get("sales")
    moi = round(inv["now"] / sales["now"], 1) if inv and sales and sales["now"] else None
    moi_ago = round(inv["ago"] / sales["ago"], 1) if inv and sales and sales["ago"] else None
    g = lambda k: M.get(k) or {}
    metrics = {
        "home_value": {"label": "Typical home value", "value": int(g("zhvi").get("now", 0)) or None, "unit": "usd", "change_yoy_pct": pct(g("zhvi").get("now"), g("zhvi").get("ago")), "as_of": month(g("zhvi").get("date", ""))},
        "median_price": {"label": "Median sale price", "value": int(g("price").get("now", 0)) or None, "unit": "usd", "change_yoy_pct": pct(g("price").get("now"), g("price").get("ago")), "as_of": month(g("price").get("date", ""))},
        "active_listings": {"label": "Homes for sale", "value": int(g("inventory").get("now", 0)) or None, "unit": "count", "change_yoy_pct": pct(g("inventory").get("now"), g("inventory").get("ago")), "as_of": month(g("inventory").get("date", ""))},
        "months_inventory": {"label": "Months of supply", "value": moi, "unit": "months", "change_yoy_pct": None, "prior_year": moi_ago, "as_of": month(g("inventory").get("date", ""))},
        "days_on_market": {"label": "Median days to pending", "value": int(g("days_to_pending").get("now", 0)) or None, "unit": "days", "change_yoy_pct": None, "prior_year": g("days_to_pending").get("ago"), "as_of": month(g("days_to_pending").get("date", ""))},
        "homes_sold": {"label": "Homes sold (month)", "value": int(g("sales").get("now", 0)) or None, "unit": "count", "change_yoy_pct": pct(g("sales").get("now"), g("sales").get("ago")), "as_of": month(g("sales").get("date", ""))},
        "sale_to_list": {"label": "Sale-to-list price", "value": round(g("sale_to_list").get("now", 0) * 100, 1) or None, "unit": "pct", "change_yoy_pct": None, "as_of": month(g("sale_to_list").get("date", ""))},
    }
    ps = {s["month"]: int(s["v"]) for s in g("price").get("series", [])}
    isr = {s["month"]: int(s["v"]) for s in g("inventory").get("series", [])}
    ss = {s["month"]: int(s["v"]) for s in g("sales").get("series", [])}
    months = sorted(set(ps) | set(isr))
    monthly = [{"month": m, "median_price": ps.get(m), "active_listings": isr.get(m), "months_inventory": round(isr[m] / ss[m], 1) if m in isr and ss.get(m) else None} for m in months]

    hv, mp = metrics["home_value"], metrics["median_price"]
    temp = "seller-leaning" if moi is not None and moi < 4 else "balanced" if moi is not None and moi <= 6 else "buyer-leaning"
    summary = (f"Dallas–Fort Worth is a {temp} market right now, with about {moi} months of supply. "
               f"The typical home is worth about ${hv['value']:,} ({hv['change_yoy_pct']:+}% vs. a year ago), "
               f"and the median sale price was ${mp['value']:,} in {datetime.date.fromisoformat(mp['as_of'] + '-01').strftime('%B %Y')}.")
    out = {
        "_instructions": "Generated by tools/build_market.py from PUBLIC Zillow Research data. Do not add NTREIS/MLS figures here until broker and NTREIS approval is on file.",
        "region": "Dallas–Fort Worth metro area",
        "as_of": Z.get("zip_date", "")[:7],
        "fetched": datetime.date.today().isoformat(),
        "source": "Zillow Research",
        "sources": [{"name": "Zillow Research (ZHVI and housing data)", "url": ZILLOW_URL, "period": "through " + Z.get("zip_date", "")[:7]}],
        "summary": summary,
        "metrics": metrics,
        "series": {"monthly": monthly},
        "by_area": by_area,
        "by_zip": by_zip,
    }
    json.dump(out, open("data/market.json", "w"), indent=1, ensure_ascii=False)
    print(summary)
    print("areas with city value:", sum(1 for a in by_area if "home_value" in a), "/", len(by_area), "| zips:", len(by_zip))


if __name__ == "__main__":
    main()
