/*
 * Site configuration — the only file you should need to edit before launch.
 * Everything here is public (it ships to the browser). Never put API keys here.
 */
window.DREI_CONFIG = {
  // Brand
  BRAND_NAME: "The Dallas Real Estate Internet", // e.g. "The Dallas Intranet" — changes the name everywhere
  BRAND_SHORT: "Dallas RE Internet",
  AI_NAME: "Ask Dallas AI",
  TAGLINE: "The Internet for Living, Moving & Investing in Dallas–Fort Worth",

  // The human behind the platform
  AGENT_NAME: "Kohl Klaus",
  AGENT_TITLE: "REALTOR®",
  AGENT_EMAIL: "kohlklaus@kw.com",
  AGENT_PHONE: "337-794-9971",
  AGENT_LICENSE: "0735490", // TREC sales agent license
  TEAM_NAME: "Templeton Real Estate Group",
  HEADSHOT: "assets/img/kohl-klaus-headshot.jpg?v=2",
  REVIEWS_URL: "https://www.google.com/maps/search/?api=1&query=Templeton+Real+Estate+Group+3800+Maple+Ave+Dallas+TX",
  KW_SEARCH_URL: "https://kohlklaus.kw.com/search", // live MLS listings on Kohl's KW site (brokerage IDX)
  TURNSTILE_SITEKEY: "0x4AAAAAAFf5iNNK_GlLAsl_", // Cloudflare Turnstile (bot check) for the home value lookup
  CALENDAR_URL: "https://calendly.com/kohlklaus-kw/30min", // e.g. "https://calendly.com/your-link" — shows a "Book a time" button when set

  // Texas license-holder disclosures (TREC). Required on the website of a license holder.
  // BROKER_NAME: TREC advertising rules require your sponsoring broker's name in advertisements.
  // Fill it in before you promote the site publicly.
  BROKER_NAME: "Keller Williams Realty Urban Dallas",
  IABS_URL: "https://www.trec.texas.gov/forms/information-about-brokerage-services", // replace with YOUR completed IABS PDF (put it in /assets/docs/)
  CPN_URL: "https://www.trec.texas.gov/forms/consumer-protection-notice",

  // Live AI — URL of the deployed Cloudflare Worker (see /worker/README.md).
  // Leave blank to run the built-in demo engine that answers from the site's own data.
  AI_WORKER_URL: "https://dallas-re-ai.klauspropertymgmt.workers.dev",

  // Lead handoff — a form endpoint that accepts JSON POSTs (Formspree, Basin, a Zapier/Make webhook, or your Worker's /lead route).
  // Leave blank and requests fall back to showing your email/phone so the visitor can reach you directly.
  LEAD_ENDPOINT: "https://formsubmit.co/ajax/f9c197508c0e4ee2ca973c2076cc34b1", // FormSubmit → klauspropertymgmt@gmail.com (same inbox as the KPG site)

  // Home search (search.html)
  // "sample" shows made-up homes until the MLS feed is approved. Switch to "worker" once FEED_URL/FEED_TOKEN are set on the Worker.
  LISTINGS_SOURCE: "sample",
  VOW_REQUIRED: true,          // NTREIS VOW: visitors need a free account (confirmed email) to see any listing data
  SEARCH_ACCOUNTS: "worker",   // "worker" = real accounts via the Worker's /vow routes (falls back to this device if the Worker isn't set up); "device" = this browser only
  SEARCH_RATE: 6.5,            // interest rate used for the monthly cost on each home
  // Swap in NTREIS's exact required wording if their VOW rules give one.
  IDX_DISCLAIMER: "Listing data © North Texas Real Estate Information Systems, Inc. (NTREIS). Information is deemed reliable but is not guaranteed accurate by the MLS or Keller Williams Realty Urban Dallas, and should be independently verified. Provided for consumers' personal, non-commercial use only, and may not be used for any purpose other than to identify properties consumers may be interested in buying, selling or leasing.",

  // Analytics (optional)
  GA4_ID: "G-B703VN6CV8",        // e.g. "G-XXXXXXX"
  POSTHOG_KEY: "",     // e.g. "phc_..."
  POSTHOG_HOST: "https://us.i.posthog.com",

  LAUNCH_AREA: "Dallas–Fort Worth",
};
