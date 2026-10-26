/*
 * SAMPLE listings for the home search while the MLS feed is pending.
 * Made-up homes placed around the real area centers in data/neighborhoods.json, in the same
 * RESO field names the live feed returns. Turn off by setting LISTINGS_SOURCE: "worker" in config.js.
 */
window.DREI_SAMPLE = function buildSample(areas) {
  const IDS = ["frisco", "west-plano", "downtown-east-plano", "mckinney", "allen", "prosper", "celina", "richardson", "far-north-dallas", "preston-hollow",
    "lake-highlands", "east-dallas", "uptown", "the-colony", "little-elm", "murphy", "wylie", "addison", "carrollton", "lucas-fairview"];
  let seed = 4207;
  const R = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(R() * a.length)];
  const between = (a, b) => a + R() * (b - a);
  const STREETS = ["Oak Hollow", "Cedar Ridge", "Willow Bend", "Stonegate", "Meadow Creek", "Brookhaven", "Hidden Glen", "Pecan Grove", "Sunset Ridge", "Lakeview", "Magnolia", "Bluebonnet", "Prairie Wind", "Cottonwood", "Rolling Hills", "Shady Brook", "Timber Trail", "Briar Oak", "Copper Canyon", "Live Oak"];
  const SUF = ["Dr", "Ln", "Ct", "Way", "Trl", "Cir", "Pl"];
  const OFFICES = ["Sample Realty Group", "Example Homes DFW", "Placeholder Properties", "Demo Brokerage Co."];
  const PPSF = { 1: 205, 2: 235, 3: 275, 4: 430 };
  const day = 864e5, now = Date.now(), iso = (t) => new Date(t).toISOString().slice(0, 10);
  const out = [];
  const list = IDS.map((id) => areas.find((a) => a.id === id)).filter((a) => a && a.geo);
  for (let i = 0; i < 220; i++) {
    const a = list[i % list.length];
    const urban = /urban|uptown/i.test(a.submarket || "") || a.id === "uptown";
    const type = urban ? (R() < 0.55 ? "Condo" : "Townhouse") : R() < 0.82 ? "Single Family" : R() < 0.6 ? "Townhouse" : "Condo";
    const sq = Math.round(type === "Condo" ? between(750, 1800) : type === "Townhouse" ? between(1300, 2700) : between(1400, 4800));
    const beds = Math.max(1, Math.min(6, Math.round(sq / 800 + between(-0.4, 0.6))));
    const baths = Math.max(1, Math.min(5, Math.round(beds * 0.8 + between(-0.3, 0.7))));
    const list$ = Math.round((sq * (PPSF[a.price_tier] || 250) * between(0.82, 1.22) * (type === "Condo" ? 0.85 : 1)) / 1000) * 1000;
    const r = R(), status = r < 0.52 ? "Active" : r < 0.62 ? "Pending" : "Closed";
    const dom = Math.round(between(1, 110)), closeAgo = Math.round(between(5, 360));
    const newish = (a.scores?.new_construction || 2) >= 4;
    const yr = Math.round(newish ? between(2004, 2025) : urban ? between(1985, 2022) : between(1960, 2020));
    const rad = (a.geo.radius_mi || 3) * 0.6 / 69;
    const orig = R() < 0.3 ? Math.round((list$ * between(1.02, 1.08)) / 1000) * 1000 : list$;
    const relist = R() < 0.12;
    const fz = R();
    out.push({
      ListingKey: "S" + (100000 + i), ListingId: "SAMPLE-" + (20000 + i), StandardStatus: status, PropertyType: "Residential", PropertySubType: type,
      ListPrice: list$, OriginalListPrice: orig, ClosePrice: status === "Closed" ? Math.round((list$ * between(0.93, 1.03)) / 500) * 500 : null,
      CloseDate: status === "Closed" ? iso(now - closeAgo * day) : null,
      ListingContractDate: iso(now - (status === "Closed" ? closeAgo + dom : dom) * day),
      DaysOnMarket: dom, CumulativeDaysOnMarket: relist ? dom + Math.round(between(20, 120)) : dom,
      BedroomsTotal: beds, BathroomsTotalInteger: baths, LivingArea: sq, LotSizeAcres: type === "Single Family" ? +between(0.12, 0.6).toFixed(2) : null, YearBuilt: yr,
      StreetNumber: String(Math.round(between(100, 9800))), StreetName: pick(STREETS), StreetSuffix: pick(SUF),
      City: a.city || a.name, StateOrProvince: "TX", PostalCode: pick(a.zips || ["75000"]),
      Latitude: a.geo.lat + between(-rad, rad), Longitude: a.geo.lon + between(-rad * 1.2, rad * 1.2),
      AssociationFee: type !== "Single Family" || R() < 0.6 ? Math.round(between(5, 70)) * 5 : 0,
      TaxAnnualAmount: Math.round((list$ * between(0.55, 0.85) * 2.0) / 100 / 10) * 10,
      MUD: newish && R() < 0.4, FloodZone: fz < 0.05 ? "AE" : "X", ListOfficeName: pick(OFFICES), _sample: true,
    });
  }
  return out;
};
