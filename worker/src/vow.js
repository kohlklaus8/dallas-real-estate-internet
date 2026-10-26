/**
 * Home search backend (VOW): accounts, saved homes, search alerts, and the MLS listings proxy.
 *
 * Routes (all JSON; auth = "Authorization: Bearer <session token>")
 *   GET  /listings?mode=sale|sold&n=&s=&e=&w=&min=&max=&beds=&baths=&type=&q=&days=&pending=1
 *                                  → { configured, listings:[RESO-shaped records], count, capped }
 *                                    Sold (Closed) records require a signed-in account (VOW rule).
 *   GET  /listing?id=<ListingKey>  → { listing }   (Closed requires sign-in)
 *   GET  /flood?lat=&lon=          → { zone, subtype, sfha }   FEMA flood zone for one point (cached)
 *   POST /vow/register  { name, email, password, phone?, agree:true, website? }  → { token, user }
 *   POST /vow/login     { email, password }        → { token, user }
 *   POST /vow/logout    (auth)                     → { ok }
 *   POST /vow/delete    (auth)                     → { ok, deleted }   deletes the account and its saved homes and alerts
 *   GET  /vow/me        (auth)                     → { user }
 *   POST /vow/saved     (auth) { saved:[ListingKey] }          → { saved }
 *   POST /vow/alerts    (auth) { alerts:[{ id, label, filters }] } → { alerts }
 *   GET  /vow/verify?t=                            → redirects to the site after confirming the email
 *   GET  /vow/unsub?u=&a=&t=                       → one-click alert unsubscribe (no sign-in needed)
 *   Cron (scheduled)                               → emails new matches for every active alert
 *
 * Setup (see worker/README-search.md):
 *   VOW                (KV binding)  accounts, sessions, alerts, flood-zone cache. Without it, accounts return 503
 *                                    and the website falls back to on-device accounts.
 *   FEED_URL           (var)         RESO Web API base URL from the MLS/IDX vendor, e.g. https://api.vendor.com/reso/odata
 *   FEED_TOKEN         (secret)      the vendor's bearer token
 *   FEED_RESOURCE      (var)         resource name, default "Property"
 *   FEED_MEDIA         (var)         "expand" (default) adds $expand=Media for the first photo; "none" skips photos
 *   FEED_MAX           (var)         max listings per search, default 350 (the MLS may set a lower cap)
 *   FEED_MUD_FIELD     (var)         optional feed field that flags MUD/PID/special tax districts
 *   VOW_REQUIRE_VERIFY (var)         "on" = sold prices only after the visitor clicks the email link. Default "off".
 *   VOW_SESSION_DAYS   (var)         default 30
 *   FEMA_NFHL_URL      (var)         flood-zone layer query URL (default: FEMA NFHL public layer 28)
 */

const enc = new TextEncoder();
const PBKDF2_ITER = 100000; // the Workers runtime caps PBKDF2 at 100k iterations
const RESO_TYPES = { "Single Family": "Single Family Residence", Townhouse: "Townhouse", Condo: "Condominium" };
const SELECT = [
  "ListingKey", "ListingId", "StandardStatus", "PropertyType", "PropertySubType", "ListPrice", "OriginalListPrice", "ClosePrice", "CloseDate",
  "ListingContractDate", "OnMarketDate", "PurchaseContractDate", "OriginalEntryTimestamp", "ModificationTimestamp", "DaysOnMarket", "CumulativeDaysOnMarket",
  "BedroomsTotal", "BathroomsTotalInteger", "LivingArea", "LotSizeAcres", "YearBuilt", "StreetNumber", "StreetName", "StreetSuffix", "UnitNumber",
  "City", "StateOrProvince", "PostalCode", "CountyOrParish", "Latitude", "Longitude", "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount", "TaxYear",
  "ListOfficeName", "PublicRemarks", "ElementarySchool", "MiddleOrJuniorSchool", "HighSchool", "HighSchoolDistrict",
];
const memo = new Map(); // short in-isolate cache for feed queries
const hits = new Map(); // best-effort rate limit for sign-in attempts

// ---------- small helpers ----------
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const token = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const normEmail = (e) => String(e || "").trim().toLowerCase().slice(0, 120);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const odq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
// OData servers expect %20 for spaces, not "+", so build query strings by hand.
const qstr = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k).replace(/%24/g, "$")}=${encodeURIComponent(v)}`).join("&");

async function hashPassword(password, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256);
  return { salt: hex(salt), hash: hex(bits) };
}
function sameHex(a, b) { if (!a || !b || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
function limited(key, max, windowMs = 60_000) {
  const now = Date.now(), rec = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (rec.length >= max) return true;
  rec.push(now); hits.set(key, rec); return false;
}
const publicUser = (u) => ({ name: u.name, email: u.email, phone: u.phone || "", verified: !!u.verified, saved: u.saved || [], alerts: (u.alerts || []).map(({ unsub, ...a }) => a), created: u.created });

async function sessionUser(request, env) {
  if (!env.VOW) return null;
  const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+([\w-]{20,})$/);
  if (!m) return null;
  const email = await env.VOW.get("s:" + m[1]);
  if (!email) return null;
  const u = await env.VOW.get("u:" + email, "json");
  return u ? { u, tok: m[1] } : null;
}
async function newSession(env, email) {
  const t = token();
  const days = Math.max(1, Math.min(90, +(env.VOW_SESSION_DAYS || 30)));
  await env.VOW.put("s:" + t, email, { expirationTtl: days * 86400 });
  return t;
}
const canSeeSold = (env, s) => !!s && (String(env.VOW_REQUIRE_VERIFY || "off") !== "on" || s.u.verified);

// ---------- main router ----------
export async function handleSearch(request, env, url, json, mail) {
  const p = url.pathname;
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  try {
    if (p === "/listings" && request.method === "GET") return json(await listings(url, request, env));
    if (p === "/listing" && request.method === "GET") return json(await oneListing(url, request, env));
    if (p === "/flood" && request.method === "GET") return json(await flood(env, num(url.searchParams.get("lat")), num(url.searchParams.get("lon"))));
    if (p === "/vow/verify" && request.method === "GET") return verify(url, env);
    if (p === "/vow/unsub" && request.method === "GET") return unsub(url, env, mail);

    if (!env.VOW) return json({ error: "Accounts aren't set up yet", setup: "kv" }, 503);
    if (p === "/vow/me" && request.method === "GET") {
      const s = await sessionUser(request, env);
      return s ? json({ user: publicUser(s.u), soldAccess: canSeeSold(env, s) }) : json({ error: "signin" }, 401);
    }
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);
    let body = {};
    try { body = await request.json(); } catch { body = {}; }

    if (p === "/vow/register") {
      if (limited("reg" + ip, 6)) return json({ error: "Too many attempts. Try again in a minute." }, 429);
      return register(body, env, json, mail, url);
    }
    if (p === "/vow/login") {
      if (limited("login" + ip, 10)) return json({ error: "Too many attempts. Try again in a minute." }, 429);
      return login(body, env, json);
    }
    const s = await sessionUser(request, env);
    if (!s) return json({ error: "signin" }, 401);
    if (p === "/vow/logout") { await env.VOW.delete("s:" + s.tok); return json({ ok: true }); }
    if (p === "/vow/delete") { // account deletion (required by the App Store for apps with sign-up)
      await env.VOW.delete("u:" + s.u.email); await env.VOW.delete("s:" + s.tok);
      return json({ ok: true, deleted: true });
    }
    if (p === "/vow/saved") {
      s.u.saved = [...new Set((Array.isArray(body.saved) ? body.saved : []).map(String).filter((k) => /^[\w-]{1,64}$/.test(k)))].slice(0, 300);
      await env.VOW.put("u:" + s.u.email, JSON.stringify(s.u));
      return json({ saved: s.u.saved });
    }
    if (p === "/vow/alerts") {
      const prev = new Map((s.u.alerts || []).map((a) => [a.id, a]));
      s.u.alerts = (Array.isArray(body.alerts) ? body.alerts : []).slice(0, 10).map((a) => {
        const id = String(a.id || token(6)).slice(0, 24), old = prev.get(id);
        return { id, label: String(a.label || "My search").slice(0, 80), filters: cleanFilters(a.filters || {}), created: old?.created || new Date().toISOString(), lastRun: old?.lastRun || new Date().toISOString(), paused: !!a.paused, unsub: old?.unsub || token(12) };
      });
      await env.VOW.put("u:" + s.u.email, JSON.stringify(s.u));
      return json({ alerts: publicUser(s.u).alerts });
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: "Server error", detail: String(e && e.message || e).slice(0, 200) }, 500);
  }
}

// ---------- accounts ----------
async function register(b, env, json, mail, url) {
  const name = String(b.name || "").trim().slice(0, 80), email = normEmail(b.email), phone = String(b.phone || "").trim().slice(0, 30), pw = String(b.password || "");
  if (b.website) return json({ error: "Rejected" }, 400); // honeypot
  if (!name || !validEmail(email)) return json({ error: "Add your name and a valid email." }, 400);
  if (pw.length < 8) return json({ error: "Password needs 8 or more characters." }, 400);
  if (!b.agree) return json({ error: "Please accept the Terms of Use." }, 400);
  if (await env.VOW.get("u:" + email)) return json({ error: "That email already has an account. Sign in instead.", code: "exists" }, 409);
  const { salt, hash } = await hashPassword(pw);
  const now = new Date().toISOString();
  const u = { name, email, phone, salt, hash, verified: false, created: now, termsAcceptedAt: now, termsVersion: env.VOW_TERMS_VERSION || "draft-1", ip: (b._ip || ""), saved: [], alerts: [] };
  await env.VOW.put("u:" + email, JSON.stringify(u));
  const vt = token(24);
  await env.VOW.put("v:" + vt, email, { expirationTtl: 3 * 86400 });
  const t = await newSession(env, email);
  // Emails: verification for the visitor, lead alert for Kohl. Failures here never block the sign-up.
  try { await sendVerify(env, mail, u, `${url.origin}/vow/verify?t=${vt}`); } catch (e) {}
  try { if (mail.lead) await mail.lead({ name, email, phone, kind: "search_signup", goal: "Home search account", source: "search", request: "Created a free home search account (sold prices, saved homes, alerts)", submitted_at: now }); } catch (e) {}
  return json({ token: t, user: publicUser(u), soldAccess: canSeeSold(env, { u }) });
}
async function login(b, env, json) {
  const email = normEmail(b.email), pw = String(b.password || "");
  const u = email && (await env.VOW.get("u:" + email, "json"));
  if (!u) return json({ error: "Email or password doesn't match." }, 401);
  const { hash } = await hashPassword(pw, u.salt);
  if (!sameHex(hash, u.hash)) return json({ error: "Email or password doesn't match." }, 401);
  u.lastLogin = new Date().toISOString();
  await env.VOW.put("u:" + email, JSON.stringify(u));
  const t = await newSession(env, email);
  return json({ token: t, user: publicUser(u), soldAccess: canSeeSold(env, { u }) });
}
async function verify(url, env) {
  const site = (env.PUBLIC_URL || "https://dallasrealestateinternet.com").replace(/\/$/, "");
  const t = url.searchParams.get("t") || "";
  const email = env.VOW && /^[\w-]{20,}$/.test(t) ? await env.VOW.get("v:" + t) : null;
  if (email) {
    const u = await env.VOW.get("u:" + email, "json");
    if (u) { u.verified = true; u.verifiedAt = new Date().toISOString(); await env.VOW.put("u:" + email, JSON.stringify(u)); }
    await env.VOW.delete("v:" + t);
  }
  return Response.redirect(`${site}/search.html?verified=${email ? 1 : 0}`, 302);
}
async function sendVerify(env, mail, u, link) {
  if (!env.RESEND_API_KEY || !mail.sendMail) return false;
  const site = (env.PUBLIC_URL || "https://dallasrealestateinternet.com").replace(/\/$/, "");
  const first = u.name.split(/\s+/)[0];
  const html = mail.shell(`<h1 style="margin:0 0 12px;font-size:24px">Welcome, ${mail.escH(first)}!</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#2a3550">Your free home search account is ready. You can see sold prices, save homes and get alerts when new homes match your search.</p>
<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:#ff7a1a;color:#0f1b33;font-weight:bold;text-decoration:none;padding:14px 24px;border-radius:999px">Confirm my email</a></p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#44506a">Your info goes only to me. It's never sold. Questions about a home? Just reply, or call or text <b>337-794-9971</b>.</p>
<p style="margin:16px 0 0;font-size:15px">Kohl</p>`, site);
  return mail.sendMail(env, { from: env.MAIL_FROM || "Kohl Klaus <kohl@dallasrealestateinternet.com>", to: [u.email], reply_to: env.REPLY_TO || env.LEAD_TO || "klauspropertymgmt@gmail.com", subject: "Confirm your email for home search", html });
}

// ---------- listings ----------
function cleanFilters(f) {
  const o = {};
  ["min", "max", "beds", "baths", "days"].forEach((k) => { const v = num(f[k]); if (v != null) o[k] = v; });
  ["n", "s", "e", "w"].forEach((k) => { const v = num(f[k]); if (v != null && Math.abs(v) <= 180) o[k] = v; });
  if (RESO_TYPES[f.type]) o.type = f.type;
  if (f.q) o.q = String(f.q).trim().slice(0, 60);
  o.pending = f.pending === true || f.pending === "1" || f.pending === 1;
  o.mode = f.mode === "sold" ? "sold" : "sale";
  return o;
}
function buildFilter(f, sinceIso) {
  const c = ["PropertyType eq 'Residential'"];
  if (f.mode === "sold") {
    const days = Math.min(730, Math.max(7, f.days || 365));
    c.push("StandardStatus eq 'Closed'", `CloseDate ge ${new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)}`);
  } else c.push(f.pending ? "(StandardStatus eq 'Active' or StandardStatus eq 'Pending' or StandardStatus eq 'Active Under Contract')" : "StandardStatus eq 'Active'");
  const priceField = f.mode === "sold" ? "ClosePrice" : "ListPrice";
  if (f.min != null) c.push(`${priceField} ge ${f.min}`);
  if (f.max != null) c.push(`${priceField} le ${f.max}`);
  if (f.beds) c.push(`BedroomsTotal ge ${f.beds}`);
  if (f.baths) c.push(`BathroomsTotalInteger ge ${f.baths}`);
  if (f.type) c.push(`PropertySubType eq ${odq(RESO_TYPES[f.type])}`);
  if (f.n != null && f.s != null && f.e != null && f.w != null) c.push(`Latitude ge ${f.s} and Latitude le ${f.n} and Longitude ge ${f.w} and Longitude le ${f.e}`);
  const hasBox = f.n != null && f.s != null && f.e != null && f.w != null;
  if (f.q && !hasBox) {
    if (/^\d{5}$/.test(f.q)) c.push(`PostalCode eq ${odq(f.q)}`);
    else c.push(`City eq ${odq(f.q.replace(/\b\w/g, (m) => m.toUpperCase()))}`);
  }
  if (sinceIso) c.push(`OriginalEntryTimestamp gt ${sinceIso}`);
  return c.join(" and ");
}
async function feedQuery(env, f, sinceIso) {
  if (!env.FEED_URL || !env.FEED_TOKEN) return null;
  const max = Math.max(25, Math.min(1000, +(env.FEED_MAX || 350)));
  const qs = new URLSearchParams({ $filter: buildFilter(f, sinceIso), $select: SELECT.join(","), $top: String(max), $orderby: "ModificationTimestamp desc" });
  if ((env.FEED_MEDIA || "expand") === "expand") qs.set("$expand", "Media($select=MediaURL,Order;$orderby=Order;$top=1)");
  if (env.FEED_MUD_FIELD) qs.set("$select", SELECT.concat(env.FEED_MUD_FIELD).join(","));
  const u = `${env.FEED_URL.replace(/\/$/, "")}/${env.FEED_RESOURCE || "Property"}?${qstr(Object.fromEntries(qs))}`;
  const hit = memo.get(u);
  if (hit && Date.now() - hit.at < 120_000) return hit.v;
  const r = await fetch(u, { headers: { Authorization: `Bearer ${String(env.FEED_TOKEN).trim()}`, Accept: "application/json" } });
  if (!r.ok) throw new Error("Feed " + r.status);
  const d = await r.json();
  const v = (d.value || []).map((x) => normalize(x, env));
  memo.set(u, { at: Date.now(), v });
  if (memo.size > 200) memo.delete(memo.keys().next().value);
  return v;
}
function normalize(x, env) {
  const o = {};
  SELECT.forEach((k) => { if (x[k] != null) o[k] = x[k]; });
  if (x.StandardStatus === "Active Under Contract") o.StandardStatus = "Pending";
  const m = Array.isArray(x.Media) && x.Media[0];
  if (m && m.MediaURL) o.Photo = m.MediaURL;
  if (env.FEED_MUD_FIELD) o.MUD = !!x[env.FEED_MUD_FIELD] && !/^(no|none|false|0)$/i.test(String(x[env.FEED_MUD_FIELD]));
  if (o.AssociationFee && /annual/i.test(o.AssociationFeeFrequency || "")) o.AssociationFee = Math.round(o.AssociationFee / 12);
  if (o.AssociationFee && /quarter/i.test(o.AssociationFeeFrequency || "")) o.AssociationFee = Math.round(o.AssociationFee / 3);
  if (o.DaysOnMarket == null) { const d = o.OnMarketDate || o.ListingContractDate; if (d) o.DaysOnMarket = Math.max(0, Math.round(((o.CloseDate ? Date.parse(o.CloseDate) : Date.now()) - Date.parse(d)) / 864e5)); }
  return o;
}
async function listings(url, request, env) {
  const f = cleanFilters(Object.fromEntries(url.searchParams));
  if (!env.FEED_URL || !env.FEED_TOKEN) return { configured: false, listings: [] };
  if (f.mode === "sold") {
    const s = await sessionUser(request, env);
    if (!canSeeSold(env, s)) return { configured: true, listings: [], signin: true };
  }
  const v = (await feedQuery(env, f)) || [];
  await addFlood(env, v);
  return { configured: true, listings: v, count: v.length, capped: v.length >= +(env.FEED_MAX || 350), asOf: new Date().toISOString() };
}
async function oneListing(url, request, env) {
  const id = String(url.searchParams.get("id") || "");
  if (!/^[\w-]{1,64}$/.test(id) || !env.FEED_URL || !env.FEED_TOKEN) return { listing: null };
  const qs = new URLSearchParams({ $filter: `ListingKey eq ${odq(id)}`, $select: SELECT.join(","), $top: "1" });
  if ((env.FEED_MEDIA || "expand") === "expand") qs.set("$expand", "Media($select=MediaURL,Order;$orderby=Order;$top=1)");
  const r = await fetch(`${env.FEED_URL.replace(/\/$/, "")}/${env.FEED_RESOURCE || "Property"}?${qstr(Object.fromEntries(qs))}`, { headers: { Authorization: `Bearer ${String(env.FEED_TOKEN).trim()}`, Accept: "application/json" } });
  if (!r.ok) return { listing: null };
  const x = ((await r.json()).value || [])[0];
  if (!x) return { listing: null };
  const l = normalize(x, env);
  if (l.StandardStatus === "Closed" && !canSeeSold(env, await sessionUser(request, env))) return { listing: null, signin: true };
  await addFlood(env, [l]);
  return { listing: l };
}

// ---------- FEMA flood zones (public NFHL) ----------
async function flood(env, lat, lon) {
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { zone: null };
  const key = `fz:${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (env.VOW) { const c = await env.VOW.get(key, "json"); if (c) return c; }
  const base = env.FEMA_NFHL_URL || "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";
  const qs = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF", returnGeometry: "false", f: "json" });
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3500);
    const d = await fetch(`${base}?${qs}`, { signal: ctl.signal }).then((r) => r.json()); clearTimeout(t);
    const a = (d.features || [])[0]?.attributes;
    const out = a ? { zone: a.FLD_ZONE || null, subtype: a.ZONE_SUBTY || "", sfha: a.SFHA_TF === "T" } : { zone: "X", subtype: "no mapped flood hazard", sfha: false };
    if (env.VOW && !d.error) await env.VOW.put(key, JSON.stringify(out), { expirationTtl: 120 * 86400 });
    return d.error ? { zone: null } : out;
  } catch (e) { return { zone: null }; }
}
async function addFlood(env, list) {
  const todo = list.filter((l) => l.Latitude && l.Longitude).slice(0, 120);
  let i = 0;
  const worker = async () => { while (i < todo.length) { const l = todo[i++]; const r = await flood(env, l.Latitude, l.Longitude); if (r.zone) { l.FloodZone = r.zone; l.FloodSFHA = r.sfha; } } };
  await Promise.all(Array.from({ length: 6 }, worker));
}

// ---------- alert emails (cron) ----------
async function unsub(url, env, mail) {
  const site = (env.PUBLIC_URL || "https://dallasrealestateinternet.com").replace(/\/$/, "");
  const email = normEmail(url.searchParams.get("u")), id = url.searchParams.get("a"), t = url.searchParams.get("t");
  let ok = false;
  if (env.VOW && email) {
    const u = await env.VOW.get("u:" + email, "json");
    const a = u && (u.alerts || []).find((x) => x.id === id && x.unsub && x.unsub === t);
    if (a) { a.paused = true; await env.VOW.put("u:" + email, JSON.stringify(u)); ok = true; }
  }
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial,sans-serif;padding:40px;text-align:center;color:#0f1b33"><h1>${ok ? "You're unsubscribed" : "Link expired"}</h1><p>${ok ? "You won't get emails for that search anymore." : "That link didn't work. Reply to any alert email and we'll stop it."}</p><p><a href="${site}/search.html" style="color:#1463f3">Back to home search</a></p></body>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
export async function runAlerts(env, mail, workerOrigin) {
  if (!env.VOW || !env.FEED_URL || !env.FEED_TOKEN || !env.RESEND_API_KEY) return { skipped: true };
  const site = (env.PUBLIC_URL || "https://dallasrealestateinternet.com").replace(/\/$/, "");
  const origin = (env.WORKER_URL || workerOrigin || "").replace(/\/$/, "");
  let cursor, sent = 0;
  do {
    const page = await env.VOW.list({ prefix: "u:", cursor });
    for (const k of page.keys) {
      const u = await env.VOW.get(k.name, "json");
      if (!u || !(u.alerts || []).some((a) => !a.paused)) continue;
      let changed = false;
      for (const a of u.alerts) {
        if (a.paused) continue;
        const startedAt = new Date().toISOString();
        let homes = [];
        try { homes = (await feedQuery(env, { ...a.filters, mode: "sale" }, a.lastRun || a.created)) || []; } catch (e) { continue; }
        a.lastRun = startedAt; changed = true;
        if (!homes.length) continue;
        const rows = homes.slice(0, 8).map((h) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e3e9f4">
          <a href="${site}/search.html#home=${encodeURIComponent(h.ListingKey)}" style="color:#0f1b33;text-decoration:none"><b style="font-size:18px">$${Number(h.ListPrice || 0).toLocaleString()}</b><br>
          <span style="font-size:14px;color:#44506a">${h.BedroomsTotal || "?"} bd · ${h.BathroomsTotalInteger || "?"} ba · ${Number(h.LivingArea || 0).toLocaleString()} sq ft<br>${mail.escH([h.StreetNumber, h.StreetName, h.StreetSuffix].filter(Boolean).join(" "))}, ${mail.escH(h.City || "")}</span></a>
          <br><span style="font-size:11px;color:#6b7690">Listing courtesy of ${mail.escH(h.ListOfficeName || "")}</span></td></tr>`).join("");
        const off = origin ? `${origin}/vow/unsub?u=${encodeURIComponent(u.email)}&a=${encodeURIComponent(a.id)}&t=${encodeURIComponent(a.unsub)}` : `${site}/search.html`;
        const html = mail.shell(`<p style="margin:0 0 4px;font-size:13px;color:#b54708;font-weight:bold;letter-spacing:.08em">NEW HOMES FOR YOU</p>
<h1 style="margin:0 0 6px;font-size:22px">${homes.length} new match${homes.length === 1 ? "" : "es"}: ${mail.escH(a.label)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<p style="margin:18px 0 0"><a href="${site}/search.html" style="display:inline-block;background:#ff7a1a;color:#0f1b33;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:999px">See all on the map</a></p>
<p style="margin:18px 0 0;font-size:13px;color:#44506a">Want to see one in person? Just reply. Kohl</p>
<p style="margin:14px 0 0;font-size:11px;color:#6b7690">Listing data from NTREIS, deemed reliable but not guaranteed. <a href="${off}" style="color:#6b7690">Unsubscribe from this search</a></p>`, site);
        const ok = await mail.sendMail(env, { from: env.MAIL_FROM || "Kohl Klaus <kohl@dallasrealestateinternet.com>", to: [u.email], reply_to: env.REPLY_TO || env.LEAD_TO || "klauspropertymgmt@gmail.com", subject: `${homes.length} new home${homes.length === 1 ? "" : "s"}: ${a.label}`, html });
        if (ok) sent++;
      }
      if (changed) await env.VOW.put(k.name, JSON.stringify(u));
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return { sent };
}
