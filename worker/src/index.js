/**
 * Dallas Real Estate Internet — AI Worker (Cloudflare Workers)
 *
 * Routes
 *   POST /chat  { messages:[{role,content}], profile:{} }  ->  { reply, followups[], handoff, reason, intent, sources[] }
 *   POST /lead  { ...handoff brief }                       ->  forwards to LEAD_WEBHOOK (CRM / Zapier / Make / email)
 *   GET  /health
 *
 * Secrets / vars (see wrangler.toml and README):
 *   ANTHROPIC_API_KEY  (secret)   your Claude API key — never put this in the website
 *   MODEL              (var)      Claude model id
 *   SITE_URL           (var)      where the website is hosted; the Worker reads /data/*.json from it (single source of truth)
 *   ALLOWED_ORIGINS    (var)      comma-separated origins allowed to call this Worker
 *   LEAD_WEBHOOK       (secret, optional) URL that receives lead briefs as JSON
 */

const DATA_TTL_MS = 10 * 60 * 1000;
const RATE = { windowMs: 60_000, max: 20 };
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

    if (url.pathname === "/health") return json({ ok: true, model: env.MODEL });
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
  const [hoods, articles, market] = await Promise.all([get("neighborhoods.json"), get("articles.json"), get("market.json")]);
  dataCache = { at: Date.now(), value: { hoods, articles, market } };
  return dataCache.value;
}

function compactKnowledge({ hoods, articles, market }) {
  const areas = (hoods?.neighborhoods || []).map((n) => ({
    id: n.id, name: n.name, submarket: n.submarket, price_tier: n.price_tier, home_types: n.home_types, home_age: n.home_age,
    lots: n.lot_profile, hoa: n.hoa, taxes: n.tax_profile, isd: n.isd, routes: n.routes, commute: n.commute_profile,
    amenities: n.amenities, development: n.development, summary: n.lifestyle_summary, pros: n.pros, cons: n.cons,
    best_for: n.best_for, scores: n.scores, metrics: n.metrics, updated: n.last_updated,
  }));
  const guides = (articles?.articles || []).map((a) => ({ slug: a.slug, title: a.title, dek: a.dek, text: a.body.map((b) => (Array.isArray(b[1]) ? b[1].join(" ") : b[1])).join(" ") }));
  return { coverage: hoods?.meta?.coverage, score_keys: hoods?.meta?.score_keys, areas, guides, market };
}

function systemPrompt(k) {
  return `You are "Ask Dallas AI", the assistant on the Dallas Real Estate Internet, a local real-estate intelligence site for North Dallas & Collin County, Texas, run by a licensed Texas REALTOR®.

GOAL: Give genuinely useful, plain-English answers so people understand Dallas-area real estate. Offer human help when they show buying/selling intent or ask for it. Never push.

GROUNDING RULES (strict):
1. For local facts, rely on the KNOWLEDGE JSON below. If it isn't there, say you don't have verified data rather than guessing.
2. NEVER state or invent market statistics, median prices, inventory, days on market, interest rates, tax rates, listing availability or specific property facts unless they appear in KNOWLEDGE with an as-of date. Market figures appear only in KNOWLEDGE.market. If its as_of is null, say no verified snapshot is loaded.
3. Do NOT do payment, affordability, proceeds or equity math yourself. Point users to the site's calculators: [Affordability](tools.html#affordability), [Move calculator](tools.html#move), [Seller proceeds](tools.html#proceeds), [Compare areas](tools.html#compare), [Where should I live?](tools.html#fit). Explaining methodology in words is fine.
4. Price tiers are relative (1 entry … 4 luxury). Area scores are editorial 0–5 within the coverage area. Describe them that way.
5. Distinguish editorial/historical content from current data. Mention "as of" dates when you cite data.

FAIR HOUSING (strict): Never describe, rank or recommend areas by race, color, religion, national origin, sex, familial status, disability, or by "safety"/crime reputation, "good/bad areas" or demographics. If asked, briefly explain you don't do that, point to neutral official sources (city police crime maps, data.census.gov), and offer place-based criteria instead: commute, home age, lot size, taxes, amenities, price tier. Don't rank schools or recommend areas by school quality. You may list which ISDs serve an area (from KNOWLEDGE), note boundaries vary by address, and point people to the site's [Schools page](schools.html#<area id>), which shows official TEA A–F ratings for every nearby public school plus private schools.

ESCALATION: Legal, tax-filing, lending-approval and appraisal questions go to the right licensed professional (attorney, CPA, lender, appraiser). Never present any value as an appraisal. For a specific home's value, offer a comparative market analysis from the local REALTOR®.

STYLE: Warm, direct, concise (usually 80–220 words). Short paragraphs; bullets with "- " when listing. Use **bold** sparingly. Link to areas as [Name](neighborhoods.html#id) and guides as [Title](intelligence.html#slug). No emojis.

OUTPUT FORMAT: Respond with ONLY a JSON object, no code fences:
{"reply": "<markdown answer>", "followups": ["<2-3 short next questions the user might ask>"], "handoff": <true if the user shows buying/selling/touring intent or asks for a person, else false>, "reason": "<one-line summary of what they need, for the agent>", "intent": "<one of: buyer_fit, buyer_afford, seller, compare, area, market, tax, schools, relocation, escalate, fair_housing, general>", "sources": ["<short labels of KNOWLEDGE items used, e.g. 'Frisco profile · 2026-10-15'>"]}

KNOWLEDGE:
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
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.MODEL, max_tokens: 1000, system: [
      // Large, stable block is cached between requests (prompt caching) to cut cost and latency.
      { type: "text", text: systemPrompt(k), cache_control: { type: "ephemeral" } },
      { type: "text", text: "USER PROFILE (voluntarily provided, may be empty): " + JSON.stringify(body.profile || {}).slice(0, 1500) },
    ], messages }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.log("Anthropic error", res.status, detail.slice(0, 500));
    return json({ error: "AI service error", status: res.status }, 502);
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  return json(parseReply(text));
}

function parseReply(text) {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const o = JSON.parse(text.slice(start, end + 1));
      if (typeof o.reply === "string") {
        return {
          reply: o.reply,
          followups: Array.isArray(o.followups) ? o.followups.slice(0, 3).map(String) : [],
          handoff: !!o.handoff,
          reason: String(o.reason || ""),
          intent: String(o.intent || "general"),
          sources: Array.isArray(o.sources) ? o.sources.slice(0, 5).map(String) : [],
        };
      }
    } catch { /* fall through */ }
  }
  return { reply: text, followups: [], handoff: false, reason: "", intent: "general", sources: [] };
}

async function handleLead(body, env, json) {
  if (!body || !body.email || !body.name) return json({ error: "Name and email required" }, 400);
  if (!env.LEAD_WEBHOOK) return json({ error: "LEAD_WEBHOOK not configured" }, 500);
  const brief = { ...body, received_at: new Date().toISOString() };
  const r = await fetch(env.LEAD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brief) });
  return r.ok ? json({ ok: true }) : json({ error: "Lead webhook failed", status: r.status }, 502);
}
