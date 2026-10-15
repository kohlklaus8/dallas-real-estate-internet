/* Shared site shell: header, footer, storage, analytics events, lead handoff, data loading. */
(function () {
  const C = window.DREI_CONFIG || {};
  const NAV = [
    ["ask.html", "Ask Dallas AI"],
    ["neighborhoods.html", "Neighborhoods"],
    ["market.html", "Market"],
    ["tools.html", "Tools"],
    ["intelligence.html", "Intelligence"],
    ["about.html", "About"],
  ];
  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n, opts = {}) => (isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, ...opts }) : "—");
  const pct = (n, d = 1) => (isFinite(n) ? `${n.toFixed(d)}%` : "—");

  const store = {
    get(key, fallback) { try { const v = localStorage.getItem("drei:" + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem("drei:" + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ } },
    push(key, value, max = 200) { const arr = store.get(key, []); arr.push(value); store.set(key, arr.slice(-max)); },
  };

  // ---------- analytics + intent scoring ----------
  const INTENT_WEIGHTS = { ask: 1, tool_complete: 3, seller_tool: 6, save_neighborhood: 2, save_profile: 3, handoff_open: 5, handoff_submit: 10, compare: 2 };
  function track(event, props = {}) {
    const rec = { event, props, at: new Date().toISOString(), page: here };
    store.push("events", rec);
    const score = store.get("intentScore", 0) + (INTENT_WEIGHTS[event] || 0);
    store.set("intentScore", score);
    try { if (window.gtag) window.gtag("event", event, props); } catch (e) {}
    try { if (window.posthog) window.posthog.capture(event, props); } catch (e) {}
  }

  function loadAnalytics() {
    if (C.GA4_ID) {
      const s = document.createElement("script");
      s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(C.GA4_ID);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date()); window.gtag("config", C.GA4_ID);
    }
    if (C.POSTHOG_KEY) {
      const s = document.createElement("script");
      s.async = true; s.src = (C.POSTHOG_HOST || "https://us.i.posthog.com") + "/static/array.js";
      s.onload = () => { try { window.posthog.init(C.POSTHOG_KEY, { api_host: C.POSTHOG_HOST }); } catch (e) {} };
      document.head.appendChild(s);
    }
  }

  // ---------- data ----------
  const cache = {};
  async function loadJSON(path) {
    if (cache[path]) return cache[path];
    cache[path] = fetch(path, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); });
    return cache[path];
  }

  // ---------- render bits ----------
  const TIER_LABEL = { 1: "Entry", 2: "Moderate", 3: "Upper-middle", 4: "Luxury" };
  function tier(n) {
    const on = "$".repeat(n), off = "$".repeat(4 - n);
    return `<span class="tier" title="Relative price tier: ${TIER_LABEL[n]} (editorial; verify with current MLS data)">${on}<span class="off">${off}</span> · ${TIER_LABEL[n]}</span>`;
  }
  function shield(route) {
    const r = String(route);
    const cls = /^DART|Rail|Line/i.test(r) ? "rail" : /DNT|Tollway|PGBT|SRT|SH 121|Turnpike|Toll/i.test(r) ? "toll" : "";
    return `<span class="shield ${cls}">${esc(r)}</span>`;
  }
  function shields(list) { return `<span class="shields">${(list || []).map(shield).join("")}</span>`; }

  // ---------- header / footer ----------
  function header() {
    const el = document.getElementById("site-header");
    if (!el) return;
    const links = NAV.map(([href, label]) => `<li><a href="${href}"${href === here ? ' aria-current="page"' : ""}>${label}</a></li>`).join("");
    el.className = "site-header";
    el.innerHTML = `
      <div class="wrap nav">
        <a class="brand" href="index.html" aria-label="${esc(C.BRAND_NAME)} home">
          <span class="brand-mark" aria-hidden="true">D</span>
          <span class="brand-name">${esc(C.BRAND_NAME)}<small>${esc(C.LAUNCH_AREA)}</small></span>
        </a>
        <ul class="nav-links" id="nav-links">${links}</ul>
        <div class="nav-actions">
          <a class="btn btn-ghost btn-sm hide-sm" href="profile.html"${here === "profile.html" ? ' aria-current="page"' : ""}>My Profile</a>
          <button class="btn btn-brass btn-sm" type="button" data-handoff="nav"><span class="lbl-long">Talk to a local expert</span><span class="lbl-short">Get help</span></button>
          <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav-links" id="menu-btn">Menu</button>
        </div>
      </div>`;
    const btn = document.getElementById("menu-btn");
    btn.addEventListener("click", () => {
      const ul = document.getElementById("nav-links");
      const open = ul.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  }

  function footer() {
    const el = document.getElementById("site-footer");
    if (!el) return;
    const year = new Date().getFullYear();
    el.className = "site-footer";
    el.innerHTML = `
      <div class="wrap">
        <div class="footer-grid">
          <div class="stack">
            <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true">D</span><span class="brand-name">${esc(C.BRAND_NAME)}</span></a>
            <p class="muted">${esc(C.TAGLINE)}. Local intelligence first; a licensed human when you want one.</p>
          </div>
          <div><h4>Explore</h4><ul>
            <li><a href="ask.html">Ask Dallas AI</a></li><li><a href="neighborhoods.html">Neighborhoods</a></li>
            <li><a href="market.html">Market</a></li><li><a href="intelligence.html">Intelligence</a></li></ul></div>
          <div><h4>Tools</h4><ul>
            <li><a href="tools.html#affordability">Affordability</a></li><li><a href="tools.html#move">Move calculator</a></li>
            <li><a href="tools.html#proceeds">Seller proceeds</a></li><li><a href="tools.html#compare">Compare areas</a></li>
            <li><a href="tools.html#fit">Where should I live?</a></li></ul></div>
          <div><h4>Contact</h4><ul>
            <li>${esc(C.AGENT_NAME)}, ${esc(C.AGENT_TITLE)}</li>
            <li><a href="tel:${esc(C.AGENT_PHONE)}">${esc(C.AGENT_PHONE)}</a></li>
            <li><a href="mailto:${esc(C.AGENT_EMAIL)}">${esc(C.AGENT_EMAIL)}</a></li>
            <li><a href="about.html">About this platform</a></li></ul></div>
        </div>
        <div class="legal">
          <div class="trec">
            <a href="${esc(C.IABS_URL)}" target="_blank" rel="noopener">Texas Real Estate Commission Information About Brokerage Services</a>
            <a href="${esc(C.CPN_URL)}" target="_blank" rel="noopener">Texas Real Estate Commission Consumer Protection Notice</a>
          </div>
          ${C.BROKER_NAME ? `<p>${esc(C.AGENT_NAME)} is a licensed real estate sales agent sponsored by ${esc(C.BROKER_NAME)}.</p>` : ""}
          <p>Equal Housing Opportunity. Neighborhood information is editorial and general in nature. It does not describe or rank areas by the characteristics of the people who live there. AI answers and calculator results are estimates, not appraisals, lending decisions, or legal or tax advice. Verify all figures before you rely on them.</p>
          <p>© ${year} ${esc(C.BRAND_NAME)}</p>
        </div>
      </div>`;
  }

  // ---------- lead handoff ----------
  function conversationSummary() {
    const convo = store.get("conversation", []);
    const qs = convo.filter((m) => m.role === "user").slice(-6).map((m) => "• " + m.content);
    return qs.join("\n");
  }

  function openHandoff(context = {}) {
    track("handoff_open", { source: context.source || "unknown" });
    const prof = store.get("profile", {});
    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "handoff-title");
    const reason = context.reason || "";
    wrap.innerHTML = `
      <div class="modal-card">
        <button class="modal-close" type="button" data-close>Close ✕</button>
        <div class="stack" style="gap:.4rem">
          <span class="eyebrow">Human help</span>
          <h2 id="handoff-title" style="font-size:1.6rem">Talk with ${esc(C.AGENT_NAME)}</h2>
          <p class="muted">Share a little context. Your recent questions come along, so the first conversation starts where the AI left off.</p>
        </div>
        <form class="form" id="handoff-form" novalidate>
          <div class="form-row">
            <label for="ho-name">Name<input id="ho-name" name="name" autocomplete="name" required value="${esc(prof.name || "")}"></label>
            <label for="ho-email">Email<input id="ho-email" name="email" type="email" autocomplete="email" required value="${esc(prof.email || "")}"></label>
          </div>
          <div class="form-row">
            <label for="ho-phone"><span>Phone <span class="hint">optional</span></span><input id="ho-phone" name="phone" type="tel" autocomplete="tel" value="${esc(prof.phone || "")}"></label>
            <label for="ho-goal">I'm looking to
              <select id="ho-goal" name="goal">
                ${["Buy", "Sell", "Buy and sell", "Relocate to North Texas", "Invest", "Just exploring"].map((g) => `<option${(prof.role || "") === g ? " selected" : ""}>${g}</option>`).join("")}
              </select></label>
          </div>
          <label for="ho-timeline">Timeline
            <select id="ho-timeline" name="timeline">
              ${["0–3 months", "3–6 months", "6–12 months", "12+ months", "Not sure"].map((t) => `<option${(prof.timeline || "") === t ? " selected" : ""}>${t}</option>`).join("")}
            </select></label>
          <label for="ho-msg">What would be most helpful?<textarea id="ho-msg" name="message" placeholder="e.g. I'd like a tour in Frisco this weekend, or a rough idea of what my home in Plano would net.">${esc(reason)}</textarea></label>
          <label style="display:flex;gap:.5rem;align-items:flex-start;font-weight:400"><input id="ho-consent" type="checkbox" style="width:auto;margin-top:.25rem" required> I agree to be contacted about my request by phone, text or email.</label>
          <p class="muted" id="ho-error" role="alert" style="color:var(--bad)"></p>
          <button class="btn btn-brass" type="submit">Send to ${esc(C.AGENT_NAME.split(" ")[0])}</button>
        </form>
        <div id="ho-done" hidden></div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.hasAttribute("data-close")) close(); });
    document.addEventListener("keydown", function onKey(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } });
    wrap.querySelector("#ho-name").focus();

    wrap.querySelector("#handoff-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const err = wrap.querySelector("#ho-error");
      const data = Object.fromEntries(new FormData(f).entries());
      if (!data.name || !/.+@.+\..+/.test(data.email || "")) { err.textContent = "Add your name and a valid email so we can reply."; return; }
      if (!wrap.querySelector("#ho-consent").checked) { err.textContent = "Check the consent box so we're allowed to contact you."; return; }
      const brief = {
        ...data,
        source: context.source || "site",
        intent_score: store.get("intentScore", 0),
        profile: store.get("profile", {}),
        saved_neighborhoods: store.get("saved", []),
        recent_questions: conversationSummary(),
        tool_results: store.get("lastTools", {}),
        submitted_at: new Date().toISOString(),
        page: location.href,
      };
      store.set("profile", { ...store.get("profile", {}), name: data.name, email: data.email, phone: data.phone, role: data.goal, timeline: data.timeline });
      store.push("requests", brief, 20);
      let sent = false;
      if (C.LEAD_ENDPOINT) {
        try {
          const r = await fetch(C.LEAD_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(brief) });
          sent = r.ok;
        } catch (e2) { sent = false; }
      }
      track("handoff_submit", { goal: data.goal, timeline: data.timeline, sent });
      f.hidden = true;
      const done = wrap.querySelector("#ho-done");
      done.hidden = false;
      done.innerHTML = sent
        ? `<div class="note"><strong>Request received.</strong> ${esc(C.AGENT_NAME)} will follow up${data.timeline === "0–3 months" ? " shortly" : ""} with your questions in hand.</div>
           ${C.CALENDAR_URL ? `<a class="btn btn-brass" href="${esc(C.CALENDAR_URL)}" target="_blank" rel="noopener">Book a time now</a>` : ""}`
        : `<div class="note"><strong>Your request is saved on this device, but it wasn't sent.</strong> Reach ${esc(C.AGENT_NAME)} directly and paste the summary below.</div>
           <p><strong>${esc(C.AGENT_PHONE)}</strong> · <strong>${esc(C.AGENT_EMAIL)}</strong></p>
           <textarea id="ho-summary" readonly style="min-height:140px">${esc(`Hi ${C.AGENT_NAME.split(" ")[0]}, I'm ${data.name} (${data.email}${data.phone ? ", " + data.phone : ""}). Goal: ${data.goal}. Timeline: ${data.timeline}.\n${data.message || ""}\n\nRecent questions:\n${brief.recent_questions || "(none)"}`)}</textarea>
           <button class="btn btn-sm" type="button" id="ho-copy">Copy summary</button>`;
      const copy = done.querySelector("#ho-copy");
      if (copy) copy.addEventListener("click", async () => {
        const ta = done.querySelector("#ho-summary");
        try { await navigator.clipboard.writeText(ta.value); copy.textContent = "Copied"; } catch (e3) { ta.select(); copy.textContent = "Selected. Press Ctrl/⌘+C"; }
      });
    });
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-handoff]");
    if (t) { e.preventDefault(); openHandoff({ source: t.getAttribute("data-handoff"), reason: t.getAttribute("data-reason") || "" }); }
  });

  // ---------- boot ----------
  header();
  footer();
  loadAnalytics();
  track("page_view", { page: here });

  window.DREI = { C, esc, money, pct, store, track, loadJSON, tier, shield, shields, openHandoff, TIER_LABEL };
})();
