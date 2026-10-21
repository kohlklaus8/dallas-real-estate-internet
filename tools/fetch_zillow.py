#!/usr/bin/env python3
"""
Download PUBLIC Zillow Research CSVs for the Dallas-Fort Worth metro and write the text snapshot
that tools/build_market.py reads. Runs weekly in GitHub Actions (.github/workflows/market.yml).
No NTREIS/MLS data is used.
Usage: python3 tools/fetch_zillow.py data_raw/zillow_latest.txt
"""
import csv, io, sys, urllib.request

BASE = "https://files.zillowstatic.com/research/public_csvs/"
METRO_NAME = "Dallas, TX"                      # Zillow's name for the Dallas-Fort Worth-Arlington metro
METRO_LONG = "Dallas-Fort Worth-Arlington, TX"  # value in the Metro column of city/ZIP files

# Each series lists candidate files; the first one that downloads is used.
FILES = {
    "zip": ["zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"],
    "city": ["zhvi/City_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"],
    "zhvi": ["zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"],
    "price": ["median_sale_price/Metro_median_sale_price_uc_sfrcondo_sm_sa_month.csv",
              "median_sale_price/Metro_median_sale_price_uc_sfrcondo_sm_month.csv",
              "median_sale_price/Metro_median_sale_price_uc_sfrcondo_month.csv"],
    "inventory": ["invt_fs/Metro_invt_fs_uc_sfrcondo_sm_month.csv", "invt_fs/Metro_invt_fs_uc_sfrcondo_month.csv"],
    "sales": ["sales_count_now/Metro_sales_count_now_uc_sfrcondo_month.csv"],
    "days_to_pending": ["med_doz_pending/Metro_med_doz_pending_uc_sfrcondo_sm_month.csv",
                        "med_doz_pending/Metro_med_doz_pending_uc_sfrcondo_month.csv",
                        "mean_doz_pending/Metro_mean_doz_pending_uc_sfrcondo_sm_month.csv"],
    "sale_to_list": ["median_sale_to_list/Metro_median_sale_to_list_uc_sfrcondo_sm_month.csv",
                     "median_sale_to_list/Metro_median_sale_to_list_uc_sfrcondo_month.csv"],
}


def get(key):
    for path in FILES[key]:
        try:
            req = urllib.request.Request(BASE + path, headers={"User-Agent": "dallasrealestateinternet.com market updater"})
            with urllib.request.urlopen(req, timeout=120) as r:
                rows = list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))
                print(f"{key}: {path} ({len(rows)} rows)")
                return rows
        except Exception as e:  # try the next candidate
            print(f"{key}: {path} failed ({e})")
    return None


def dates(row):
    return sorted(k for k in row if len(k) == 10 and k[4] == "-" and k[7] == "-")


def last_pair(row):
    """(latest date, latest value, value 12 months earlier) using the last non-empty month."""
    ds = [d for d in dates(row) if row[d] not in ("", None)]
    if not ds:
        return None
    d = ds[-1]
    y, m = int(d[:4]), int(d[5:7])
    ago_key = next((k for k in ds if k.startswith(f"{y - 1:04d}-{m:02d}")), None)
    return d, float(row[d]), float(row[ago_key]) if ago_key else 0.0


def main(out_path):
    lines = []
    for kind in ("zip", "city"):
        rows = get(kind) or []
        rows = [r for r in rows if r.get("Metro") == METRO_LONG and r.get("State") == "TX"]
        recs, date = [], ""
        for r in rows:
            lp = last_pair(r)
            if not lp or not lp[2]:
                continue
            date = max(date, lp[0])
            name = r["RegionName"]
            city = r.get("City", "") if kind == "zip" else ""
            recs.append(f"{name},{city.replace(',', ' ')},{int(lp[1])},{int(lp[2])}")
        lines += [f"{kind.upper()} {date}", ";".join(recs)]
    lines.append("METRO")
    for key in ("zhvi", "price", "inventory", "sales", "days_to_pending", "sale_to_list"):
        rows = get(key) or []
        r = next((x for x in rows if x.get("RegionName") == METRO_NAME), None)
        if not r:
            continue
        lp = last_pair(r)
        if not lp:
            continue
        series = ",".join(f"{d[:7]}:{int(float(r[d]))}" for d in dates(r)[-13:] if r[d] not in ("", None)) if key in ("price", "inventory", "sales") else ""
        lines.append(f"{key} {lp[0]} {lp[1]} {lp[2]}" + (f" {series}" if series else ""))
    open(out_path, "w").write("\n".join(lines) + "\n")
    print("wrote", out_path)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data_raw/zillow_latest.txt")
