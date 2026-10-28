# Home search backend (accounts, saved homes, alerts, MLS feed)

The home search page (`search.html`) works right now with **sample homes**. Accounts fall back to the
visitor's own browser, and every sign-up still emails Kohl as a lead. Do the steps below to turn on the real pieces.

## Step 1: Real accounts (do this now, about 5 minutes)

Real accounts let people sign in on any device, keep saved homes and get alert emails.

```bash
cd worker
npx wrangler kv namespace create VOW
```

Copy the `id` it prints. In `wrangler.toml`, uncomment the three `[[kv_namespaces]]` lines and paste the id. Then:

```bash
npx wrangler deploy
```

Check it: open `https://dallas-re-ai.klauspropertymgmt.workers.dev/health`. It should say `"accounts": true`.

What happens on sign-up: the visitor gets a "Confirm your email" message from kohl@dallasrealestateinternet.com
(through Resend, which is already set up), and Kohl gets a "New lead" email. Passwords are stored scrambled
(PBKDF2), never in plain text.

## Step 2: The MLS feed (after Anne and NTREIS approve)

Ask the approved IDX/VOW data vendor for a **RESO Web API** URL and token. Then:

1. In `wrangler.toml`, uncomment `FEED_URL` and paste the vendor's URL (for example `https://api.vendor.com/reso/odata`).
2. Add the token as a secret: `npx wrangler secret put FEED_TOKEN`
3. `npx wrangler deploy`, and check `/health` shows `"feed": true`.
4. In the website's `assets/js/config.js`, set `LISTINGS_SOURCE: "worker"` and replace `IDX_DISCLAIMER` with the exact wording NTREIS requires. Commit.

The sample homes disappear and real listings load. Sold prices only come back from the Worker for signed-in
accounts, which is how a VOW is supposed to work (the website never receives sold data for anonymous visitors).

Vendor differences you might need to adjust in `src/vow.js`:

- `FEED_RESOURCE` if the resource isn't called `Property`
- `FEED_MEDIA = "none"` if the vendor doesn't support `$expand=Media`
- `FEED_MUD_FIELD` if NTREIS has a field that flags MUD/PID districts
- `FEED_MAX` if NTREIS caps how many listings a search can show

## Step 3: Rules to confirm with Anne

- VOW mode is on by default (NTREIS VOW rules): every listing needs a free account with a confirmed email,
  access lasts `VOW_ACCESS_DAYS` (180) and then the visitor re-accepts the terms with one click, deleted accounts
  leave an audit record for `VOW_AUDIT_DAYS` (200), searches are rate-limited per account (`VOW_RATE_MIN` 40,
  `VOW_RATE_DAY` 1500), and seller opt-outs are honored (`FEED_OPTOUT` "on"). Set `VOW_GATE` to `"sold"` only
  if you switch to a public IDX feed. Bump `VOW_TERMS_VERSION` whenever terms.html changes.
- The Terms of Use page (`terms.html`) is a **draft**. Anne and NTREIS need to approve it.
- The listing disclaimer and attribution text (`IDX_DISCLAIMER` in config.js).

## Alert emails

A daily job (8 a.m. Central, set in `wrangler.toml` under `[triggers]`) emails each person the new listings
that match their saved searches. Every email has a one-click unsubscribe link. It does nothing until the feed is connected.

## Flood zones

The Worker looks up each home's FEMA flood zone from the public National Flood Hazard Layer and caches it.
If FEMA moves the service, set `FEMA_NFHL_URL`. If a lookup fails, the page links to FEMA's map instead.
