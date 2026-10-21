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
  HEADSHOT: "assets/img/kohl-klaus-headshot.jpg",
  REVIEWS_URL: "https://www.google.com/maps/search/?api=1&query=Templeton+Real+Estate+Group+3800+Maple+Ave+Dallas+TX",
  CALENDAR_URL: "", // e.g. "https://calendly.com/your-link" — shows a "Book a time" button when set

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

  // Analytics (optional)
  GA4_ID: "",          // e.g. "G-XXXXXXX"
  POSTHOG_KEY: "",     // e.g. "phc_..."
  POSTHOG_HOST: "https://us.i.posthog.com",

  LAUNCH_AREA: "Dallas–Fort Worth",
};
