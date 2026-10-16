# Dallas Real Estate Internet

An AI-first real-estate intelligence site for North Dallas & Collin County. It's a static site that runs on GitHub Pages, and the AI chat runs through a small Cloudflare Worker that keeps your Claude API key private.

```
/                     ← the website (GitHub Pages serves this folder)
  index.html          Home: hero AI prompt, entry points, featured content
  ask.html            Ask Dallas AI: chat with sources, follow-ups and handoff to a person
  neighborhoods.html  19 area profiles (#frisco, #richardson, …)
  market.html         Market dashboard (fills in from data/market.json)
  tools.html          Affordability · Move · Seller proceeds · Compare · Where should I live?
  intelligence.html   Guides & explainers (#slug)
  about.html          Who's behind it + contact
  profile.html        Saved preferences, areas, questions (browser-only for now)
  assets/js/config.js ← THE file to edit: name, contact info, Worker URL, lead endpoint, analytics
  data/*.json         The knowledge base: neighborhoods, articles, market snapshot
  worker/             Cloudflare Worker for live Claude answers + lead forwarding
```

## 1. Put it on GitHub Pages (about 10 minutes)

1. On GitHub (signed in as **kohlklaus8**), create a new **public** repo named `dallas-real-estate-internet`. You can also put it under the `klauspropertymgmt` org, but this brand is separate from KPG.
2. Upload everything in this folder (drag-and-drop works). Keep the folder structure.
3. Go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
4. In a minute or two it's live at `https://kohlklaus8.github.io/dallas-real-estate-internet/`.

The chat works right away in **Demo mode**, which answers from the site's own data. It handles comparisons, area profiles, the fair-housing guardrails and handoff to a person.

## 2. Turn on live Claude answers (Cloudflare Worker, free tier)

1. Create a free Cloudflare account. Get a Claude API key at console.anthropic.com.
2. On your Mac:
   ```bash
   cd worker
   npx wrangler login
   # edit wrangler.toml: set SITE_URL and ALLOWED_ORIGINS to your GitHub Pages URL
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler deploy
   ```
3. Copy the URL it prints (for example `https://dallas-re-ai.<you>.workers.dev`) into `AI_WORKER_URL` in `assets/js/config.js`, then commit.
4. The chat badge switches from **Demo mode** to **Live AI**. If the Worker is ever down, the chat falls back to demo answers automatically.

The Worker reads `data/*.json` from your live site, so updating a neighborhood profile updates the AI too. Its system prompt enforces the spec's guardrails: no invented statistics, no math in chat, fair-housing rules, escalation of professional questions, and sources with dates. Prompt caching keeps the cost per question low.

## 3. Get leads to your inbox or CRM

Pick one option and set `LEAD_ENDPOINT` in `config.js`:

- **Easiest:** a free [Formspree](https://formspree.io) form. Paste its endpoint URL. Requests go to your email.
- **CRM:** a Zapier or Make webhook URL that sends to your CRM, Gmail or a Google Sheet.
- **Through the Worker:** set `LEAD_ENDPOINT` to `https://<worker>/lead`, then run `npx wrangler secret put LEAD_WEBHOOK` with your Zapier/Make URL.

Each request carries a context brief: goal, timeline, recent questions, saved areas, latest tool results and an intent score. Your first call starts where the AI left off. With no endpoint set, visitors see your phone and email plus a copy-ready summary.

## 4. Keep it fresh (Explore page)

Everything on **Explore** (developments, eat & drink, things to do, sports, events calendar, follow local) lives in `data/explore.json`.
Edit it right on GitHub (open the file, click the pencil, save). Update `last_checked` when you review it; that date shows on the site.
Photos live in `data/photos.json`. Each one is a verified, location-tagged Unsplash photo or your own file in `assets/img/`.

## 5. Keep the data honest

- **Market numbers:** `data/market.json` is built weekly from **public Zillow Research data** (typical home value by ZIP and city, plus DFW metro sales, inventory and days to pending) by `tools/build_market.py`. NTREIS/MLS figures stay off the site until your broker and NTREIS approve it in writing (Rules 17.01 and 17.12).
- **Neighborhood metrics:** each profile has a `metrics` block (`median_price`, `inventory`, `days_on_market`, `as_of`), and it stays `null` until you load verified data.
- **New areas:** copy a profile in `data/neighborhoods.json`. Scores are 0–5 and relative. Keep them about places, never people.
- **Articles:** add to `data/articles.json` (blocks: `p`, `h2`, `ul`, `note`).

## 6. Before you promote it publicly (launch checklist)

- [ ] **TREC broker disclosure:** add your sponsoring broker's name to `BROKER_NAME` in `config.js`. TREC advertising rules require it in ads, and the footer shows it automatically.
- [ ] **IABS form:** fill out TREC's *Information About Brokerage Services* form, save it as `assets/docs/IABS.pdf`, and point `IABS_URL` at it. The Consumer Protection Notice link is already in the footer.
- [ ] Have a compliance/legal reviewer check fair housing, advertising, privacy and AI disclaimers (spec §16).
- [ ] Add `GA4_ID` or `POSTHOG_KEY` for analytics.
- [ ] Optional custom domain: add a `CNAME` file and set DNS. Then update `SITE_URL`/`ALLOWED_ORIGINS` in the Worker.
- [ ] Recruit 25–50 test users and read the questions they ask (spec §25).

## What's already built vs. next (from the MVP spec)

| Built now | Next (Phase 2, driven by real usage) |
|---|---|
| AI chat with grounding, sources, guardrails and demo fallback | Accounts with cross-device sync (Clerk/Auth.js) and email alerts |
| 19 neighborhood profiles | 25–50 profiles plus verified MLS metrics |
| 5 deterministic tools, including Texas tax proration | Saved searches and IDX listing search (after licensing is confirmed) |
| Market dashboard that shows only verified data | Weekly market briefs and Development Watch |
| Lead handoff with context brief and intent scoring | CRM sync, calendar booking, lead routing |
| Local profile, saved areas, question log | Postgres + pgvector backend when the static model outgrows itself |
