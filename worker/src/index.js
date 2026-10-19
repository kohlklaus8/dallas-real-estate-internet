/**
 * Dallas Real Estate Internet — AI Worker (Cloudflare Workers)
 *
 * Routes
 *   POST /chat  { messages:[{role,content}], profile:{}, page }  ->  { reply, followups[], handoff, reason, intent, sources[{title,url}] }
 *   POST /lead  { ...handoff brief }                              ->  forwards to LEAD_WEBHOOK (optional; the site posts to FormSubmit directly)
 *   GET  /health
 *
 * Secrets / vars (Cloudflare dashboard → Worker → Settings → Variables and Secrets, or wrangler.toml):
 *   ANTHROPIC_API_KEY  (secret)   Claude API key — never put this in the website
 *   MODEL              (var)      Claude model id (default claude-sonnet-5-5)
 *   SITE_URL           (var)      the live site; the Worker reads /data/*.json from it (single source of truth)
 *   ALLOWED_ORIGINS    (var)      comma-separated origins allowed to call this Worker
 *   WEB_SEARCH         (var)      "on" (default) lets the assistant search the web for current info, with citations
 *   LEAD_WEBHOOK       (secret, optional)
 */

const DATA_TTL_MS = 10 * 60 * 1000;
const RATE = { windowMs: 60_000, max: 12 };
let dataCache = { at: 0, value: null };
const hits = new Map(); // best-effort per-isolate rate limiting

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (url.pathname === "/health" || url.pathname === "/") return json({ ok: true, model: env.MODEL || "claude-sonnet-5-5", key: !!env.ANTHROPIC_API_KEY });
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);
    if (allowed.length && !allowed.includes(origin)) return json({ error: "Origin not allowed" }, 403);

    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    const now = Date.now();
    const rec = (hits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
    if (rec.length >= RATE.max) return json({ error: "Too many requests. Try again in a minute." }, 429);
    rec.push(now); hits.set(ip, rec);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    if (url.pathname === "/lead") return handleLead(body, env, json);
    if (url.pathname === "/chat") return handleChat(body, env, json);
    return json({ error: "Not found" }, 404);
  },
};

async function loadData(env) {
  if (dataCache.value && Date.now() - dataCache.at < DATA_TTL_MS) return dataCache.value;
  const base = (env.SITE_URL || "").replace(/\/$/, "");
  const get = async (p) => { try { const r = await fetch(`${base}/data/${p}`, { cf: { cacheTtl: 300 } }); return r.ok ? r.json() : null; } catch { return null; } };
  const [hoods, articles, market, explore] = await Promise.all([get("neighborhoods.json"), get("articles.json"), get("market.json"), get("explore.json")]);
  dataCache = { at: Date.now(), value: { hoods, articles, market, explore } };
  return dataCache.value;
}

function compactKnowledge({ hoods, articles, market, explore }) {
  const areas = (hoods?.neighborhoods || []).map((n) => ({
    id: n.id, name: n.name, submarket: n.submarket, price_tier: n.price_tier, home_types: n.home_types, home_age: n.home_age,
    lots: n.lot_profile, hoa: n.hoa, taxes: n.tax_profile, isd: n.isd, zips: n.zips, routes: n.routes, commute: n.commute_profile,
    amenities: n.amenities, development: n.development, summary: n.lifestyle_summary, pros: n.pros, cons: n.cons,
    best_for: n.best_for, scores: n.scores, updated: n.last_updated,
  }));
  const guides = (articles?.articles || []).map((a) => ({ slug: a.slug, title: a.title, dek: a.dek, text: (a.body || []).map((b) => (Array.isArray(b[1]) ? b[1].join(" ") : b[1])).join(" ").slice(0, 3000) }));
  const mk = market ? { as_of: market.as_of, source: market.source, summary: market.summary, metrics: market.metrics, by_area: market.by_area, by_zip: market.by_zip } : null;
  const ex = explore ? {
    last_checked: explore.last_checked,
    developments: explore.developments,
    events: explore.events,
    places: ["eat", "drink", "do"].flatMap((k) => (explore[k] || []).map((p) => ({ section: k, name: p.name, area: p.area || p.city, hood: p.hood, kind: p.kind, why: p.why, known_for: p.known_for, address: p.address }))),
    sports: explore.sports,
    follow: (explore.social || []).map((s) => `${s.name} (@${s.handle}, ${s.platform})`),
  } : null;
  return { coverage: hoods?.meta?.coverage, areas, guides, market: mk, explore: ex };
}

function systemPrompt(k, today) {
  return `You are "Ask Dallas AI", the assistant on The Dallas Real Estate Internet, a guide to living, moving and buying or selling a home anywhere in Dallas–Fort Worth, run by Kohl Klaus, a licensed Texas REALTOR®. Today is ${today}.

YOUR JOB: be the most helpful local friend someone could ask. Answer the actual question fully and specifically, in plain English a busy person can scan in 20 seconds. Don't deflect to "contact an agent" when you can answer. Offer a human only when it truly helps (they want to tour, buy, sell, price a specific home, or ask for a person).

WHAT YOU CAN USE, in this order:
1. SITE KNOWLEDGE (JSON below): the site's own area profiles, guides, market snapshot (public Zillow data), developments, events, restaurants/bars/things to do. Prefer it and link to the right page.
2. Your general knowledge of DFW and Texas: cities, highways and commutes, school districts, property-tax basics (homestead exemption, appraisal districts, protests), HOAs/MUDs/PIDs, home-buying steps, Texas contracts and option periods, title/escrow, moving logistics (driver's license, vehicle registration, utilities and deregulated electricity, toll tags), weather/hail/foundations, etc. Use it freely for well-established facts.
3. WEB SEARCH (when available) for anything current or specific: today's mortgage rates, a business's hours, a recent news item, a new restaurant, an event date, a city announcement, a tax rate for this year, a specific school's info. Search instead of guessing. Keep it to what's needed (1–3 searches). Cite what you used.

ACCURACY:
- Never make up numbers, dates, addresses, names or quotes. If you're not sure and can't verify, say so briefly and say where to check.
- When you give a market number, say where it's from and its date (the site's snapshot is Zillow data; KNOWLEDGE.market.as_of).
- For quick money questions (rough payment, closing costs, net proceeds) you may give a clearly labeled ballpark showing your assumptions, then link the calculator for real numbers: [Affordability](tools.html#affordability), [Move calculator](tools.html#move), [Seller proceeds](tools.html#proceeds), [Compare areas](tools.html#compare), [Where should I live?](tools.html#fit).
- Never present a value for a specific home as an appraisal. For "what's my home worth," explain what drives value and offer Kohl's free comparative market analysis.
- Legal, tax-filing and loan-approval questions: give the general picture, then recommend the right licensed pro (real-estate attorney, CPA, lender).
- Never use or mention NTREIS/MLS data.

FAIR HOUSING (strict): Never describe, rank or recommend areas by race, color, religion, national origin, sex, familial status or disability, or by "safety"/crime reputation, "good/bad areas" or who lives there. If asked, say briefly that you don't steer that way, point to neutral official sources (city police crime maps, data.census.gov), and offer place-based criteria instead: commute, price, home age, lot size, taxes, amenities. For schools: you may share official facts (which ISD serves an area, TEA A–F ratings, programs) and link the site's [Schools page](schools.html#<area id>), but don't recommend areas based on school quality; remind them zones vary by address.

STYLE: Warm, direct, specific. Lead with the answer in the first sentence. Usually 80–250 words; go longer only when they ask for detail. Short paragraphs, bullets with "- " for lists, **bold** for the key takeaway. Link site pages: areas [Name](neighborhoods.html#id), guides [Title](intelligence.html#slug), market [Market](market.html), places/events [Explore](explore.html#eat) / (explore.html#calendar) / (explore.html#developments), schools [Schools](schools.html#id). For outside sources use full https links. No emojis.

AFTER your answer, on a new line, output exactly one metadata line (it is removed before display):
<meta>{"followups":["2-3 short next questions they might ask"],"handoff":true|false,"reason":"one-line summary of what they need, for Kohl","intent":"one of: buyer_fit, buyer_afford, seller, compare, area, market, tax, schools, relocation, places, events, escalate, fair_housing, general"}</meta>

SITE KNOWLEDGE:
${JSON.stringify(k)}`;
}

async function handleChat(body, env, json) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "Worker missing ANTHROPIC_API_KEY" }, 500);
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "Last message must be from the user" }, 400);

  const k = compactKnowledge(await loadData(env));
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "long", day: "numeric" });
  const tools = (env.WEB_SEARCH || "on") === "on" ? [{
    type: "web_search_20250305", name: "web_search", max_uses: 3,
    user_location: { type: "approximate", city: "Dallas", region: "Texas", country: "US", timezone: "America/Chicago" },
  }] : undefined;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env.MODEL || "claude-sonnet-5-5", max_tokens: 1600,
      system: [
        // Large, stable block is cached between requests (prompt caching) to cut cost and latency.
        { type: "text", text: systemPrompt(k, today), cache_control: { type: "ephemeral" } },
        { type: "text", text: "VISITOR PROFILE (voluntarily provided, may be empty): " + JSON.stringify(body.profile || {}).slice(0, 1500) + (body.page ? "\nPAGE THEY'RE ON: " + String(body.page).slice(0, 200) : "") },
      ],
      ...(tools ? { tools } : {}),
      messages,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.log("Anthropic error", res.status, detail.slice(0, 500));
    return json({ error: "AI service error", status: res.status }, 502);
  }
  const data = await res.json();
  return json(parseReply(data.content || []));
}

function parseReply(content) {
  // Join text blocks (web-search answers arrive as several text blocks with citations).
  let text = content.filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  const sources = [];
  const seen = new Set();
  content.forEach((c) => (c.citations || []).forEach((ct) => {
    if (ct.url && !seen.has(ct.url)) { seen.add(ct.url); sources.push({ title: ct.title || new URL(ct.url).hostname, url: ct.url }); }
  }));
  let meta = {};
  const m = text.match(/<meta>([\s\S]*?)<\/meta>/i);
  if (m) {
    try { meta = JSON.parse(m[1]); } catch { meta = {}; }
    text = text.replace(m[0], "").trim();
  }
  return {
    reply: text,
    followups: Array.isArray(meta.followups) ? meta.followups.slice(0, 3).map(String) : [],
    handoff: !!meta.handoff,
    reason: String(meta.reason || ""),
    intent: String(meta.intent || "general"),
    sources: sources.slice(0, 6),
  };
}

async function handleLead(body, env, json) {
  if (!body || !body.email || !body.name) return json({ error: "Name and email required" }, 400);
  if (!env.LEAD_WEBHOOK) return json({ error: "LEAD_WEBHOOK not configured" }, 500);
  const brief = { ...body, received_at: new Date().toISOString() };
  const r = await fetch(env.LEAD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brief) });
  return r.ok ? json({ ok: true }) : json({ error: "Lead webhook failed", status: r.status }, 502);
}
