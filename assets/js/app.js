/* Shared site shell: header, footer, storage, analytics events, lead handoff, data loading. */
(function () {
  const C = window.DREI_CONFIG || {};
  const MENU = [
    { label: "Why DFW", key: "why", items: [
      ["why.html", "Why people move here", "Jobs, no state income tax, lifestyle"],
      ["moving.html", "Moving to DFW: start here", "The relocation playbook"],
      ["why.html#costs", "Cost of living & taxes", "What a DFW budget looks like"],
      ["why.html#getting-around", "Getting around", "Highways, toll roads, DART, airports"],
      ["market.html", "The housing market now", "Plain-English market dashboard"],
    ] },
    { label: "Neighborhoods", key: "areas", wide: true, groups: [
      ["Dallas · Urban core", [["uptown", "Uptown & Victory Park"], ["deep-ellum", "Deep Ellum & Downtown"], ["knox-henderson", "Knox-Henderson & Oak Lawn"], ["design-district", "Design District & Love Field"], ["lower-greenville", "Lower Greenville & M Streets"]]],
      ["Dallas · Neighborhoods", [["oak-cliff", "Oak Cliff & Bishop Arts"], ["east-dallas", "East Dallas & Lakewood"], ["lake-highlands", "Lake Highlands"], ["park-cities", "Park Cities"], ["preston-hollow", "Preston Hollow"], ["far-north-dallas", "Far North Dallas"]]],
      ["Fort Worth", [["fort-worth", "Fort Worth overview"], ["downtown-fw", "Downtown & Sundance Square"], ["near-southside", "Near Southside & Magnolia"], ["west-7th", "West 7th & Cultural District"], ["tcu-berkeley", "TCU & Berkeley"]]],
      ["Collin County North", [["frisco", "Frisco"], ["mckinney", "McKinney"], ["prosper", "Prosper"], ["celina", "Celina"], ["anna-melissa", "Anna & Melissa"], ["princeton", "Princeton"], ["little-elm", "Little Elm"]]],
      ["Plano & US 75", [["west-plano", "West Plano"], ["downtown-east-plano", "Downtown & East Plano"], ["allen", "Allen"], ["richardson", "Richardson"], ["murphy", "Murphy"], ["lucas-fairview", "Lucas & Fairview"]]],
      ["Close-in & the lakes", [["addison", "Addison"], ["carrollton", "Carrollton"], ["the-colony", "The Colony"], ["garland", "Garland"], ["rowlett", "Rowlett"], ["rockwall", "Rockwall"], ["wylie", "Wylie"]]],
      ["Mid-Cities", [["las-colinas", "Las Colinas (Irving)"], ["grapevine", "Grapevine"], ["flower-mound", "Flower Mound"], ["arlington", "Arlington"]]],
    ], foot: [["neighborhoods.html", "All neighborhoods"], ["schools.html", "Schools by area"], ["tools.html#fit", "Where should I live?"], ["tools.html#compare", "Compare areas"], ["compare/", "Side-by-side matchups"]] },
    { label: "Explore", key: "explore", items: [
      ["explore.html#developments", "What's being built", "New developments, updated regularly"],
      ["explore.html#eat", "Eat & drink", "Restaurants and bars locals love"],
      ["explore.html#markets", "Farmers markets", "Days, hours and seasons by city"],
      ["explore.html#festivals", "Festivals", "Annual events, month by month"],
      ["explore.html#do", "Things to do", "Parks, museums, downtowns"],
      ["explore.html#sports", "Sports", "Teams, venues, schedules"],
      ["explore.html#calendar", "Events calendar", "What's happening and when"],
      ["explore.html#follow", "Follow local", "Instagram accounts worth following"],
      ["intelligence.html#living", "Living here guides", "Toll roads, squares, lakes"],
    ] },
    { label: "Moving Here", key: "moving", items: [
      ["moving.html", "Moving to DFW: start here", "Money, areas, Texas homes, checklist"],
      ["guides/dfw-moving-checklist.html", "First 90 days checklist", "Licenses, registration, homestead"],
      ["schools.html", "Schools", "Official ratings for every public school"],
      ["guides/choosing-electricity-in-dfw.html", "Electricity & utilities", "How to pick a plan"],
      ["guides/moving-to-dfw-from-california.html", "Relocating from out of state", "What surprises people"],
      ["moving.html#guide", "Free Moving to DFW Guide", "12-page PDF by email"],
      ["intelligence.html#moving", "All moving guides", ""],
    ] },
    { label: "Real Estate", key: "re", items: [
      [C.KW_SEARCH_URL || "market.html", "Search homes for sale", "Live listings on Kohl's KW site"],
      ["home-value.html", "What's my home worth?", "Free market analysis from Kohl"],
      ["market.html", "Market dashboard", "Prices, inventory, timing"],
      ["tools.html#affordability", "Buying: what can I afford?", "Texas taxes included"],
      ["tools.html#proceeds", "Selling: what would I net?", "Itemized proceeds"],
      ["tools.html#move", "Moving up or down", "Sell and buy, next payment"],
      ["guides/texas-homestead-exemption.html", "Homestead exemption", "Save on taxes; file free"],
      ["guides/protest-property-taxes-dfw.html", "Protest your property taxes", "Deadline, evidence, steps"],
      ["guides/muds-and-pids-explained.html", "New construction & MUD taxes", ""],
      ["intelligence.html#real-estate", "All real estate guides", ""],
    ] },
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
    try {
      if (window.gtag && event !== "page_view") window.gtag("event", event, props); // GA4 counts page views itself
      // One standard "generate_lead" event per real lead, so GA4 can count conversions.
      const leadType = event === "handoff_submit" ? (props.kind === "guide" ? "guide" : "request") : (event === "seller_tool" && props.kind === "home_value_request") ? "home_value" : "";
      if (window.gtag && leadType) window.gtag("event", "generate_lead", { lead_type: leadType });
    } catch (e) {}
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
    const cur = here + (location.hash || "");
    const link = ([href, title, sub]) => `<a href="${href}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ""}${href === cur ? ' aria-current="page"' : ""}>${esc(title)}${sub ? `<span>${esc(sub)}</span>` : ""}</a>`;
    const isCur = (m) => (m.items || []).some(([h]) => h.split("#")[0] === here && here !== "index.html" && (!h.includes("#") || h === cur)) || (m.key === "areas" && here === "neighborhoods.html");
    const panels = MENU.map((m) => `
      <li><details class="dd${isCur(m) ? " is-current" : ""}"><summary>${esc(m.label)}</summary>
        <div class="panel${m.wide ? " wide" : ""}">
          ${m.groups ? m.groups.map(([g, list]) => `<div><h5>${esc(g)}</h5>${list.map(([id, n]) => link([`areas/${id}.html`, n])).join("")}</div>`).join("") : m.items.map(link).join("")}
          ${m.foot ? `<div class="foot">${m.foot.map(([h, t]) => `<a href="${h}">${esc(t)} →</a>`).join("")}</div>` : ""}
        </div></details></li>`).join("");
    el.className = "site-header";
    el.innerHTML = `
      <div class="wrap hdr">
        <a class="logo" href="index.html" aria-label="${esc(C.BRAND_NAME)} home"><i aria-hidden="true">D</i><span><b>${esc(C.BRAND_NAME)}</b><small>Live · Move · Invest in DFW</small></span></a>
        <ul class="menu" id="menu">${panels}
          <li><details class="dd"><summary>Tools</summary><div class="panel">
            ${[["tools.html#fit", "Where should I live?", "A shortlist in a minute"], ["tools.html#affordability", "What can I afford?", ""], ["tools.html#proceeds", "Seller proceeds", ""], ["tools.html#move", "Move calculator", ""], ["tools.html#compare", "Compare areas", ""], ["profile.html", "My saved stuff", "Areas, questions, results"]].map(link).join("")}
          </div></details></li>
        </ul>
        <div class="hdr-actions">
          <a class="btn btn-ghost btn-sm hide-sm" href="ask.html">Ask AI</a>
          <button class="btn btn-brass btn-sm" type="button" data-handoff="nav"><span class="lbl-long">Talk to ${esc(C.AGENT_NAME.split(" ")[0])}</span><span class="lbl-short">Help</span></button>
          <button class="burger" type="button" aria-expanded="false" aria-controls="menu" id="burger">Menu</button>
        </div>
      </div>`;
    const dds = [...el.querySelectorAll("details.dd")];
    dds.forEach((d) => d.addEventListener("toggle", () => { if (d.open) dds.forEach((o) => o !== d && (o.open = false)); }));
    document.addEventListener("click", (e) => { if (!el.contains(e.target)) dds.forEach((d) => (d.open = false)); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") dds.forEach((d) => (d.open = false)); });
    el.querySelectorAll(".panel a").forEach((a) => a.addEventListener("click", () => { dds.forEach((d) => (d.open = false)); document.getElementById("menu").classList.remove("open"); }));
    const burger = document.getElementById("burger");
    burger.addEventListener("click", () => {
      const open = document.getElementById("menu").classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
      burger.textContent = open ? "Close" : "Menu";
    });
  }

  function photoUrl(p, w = 1200) {
    if (!p) return "";
    if (/images\.pexels\.com/.test(p.src)) return `${p.src}?auto=compress&cs=tinysrgb&w=${w}`;
    if (/Special:FilePath/.test(p.src)) return `${p.src}?width=${w}`;
    return /^(https?:|assets\/)/.test(p.src) ? p.src : `https://images.unsplash.com/${p.src}?auto=format&fit=crop&w=${w}&q=70`;
  }
  const GRADS = ["#1463f3,#58b4ff", "#0b8f83,#7be0c9", "#ff7a1a,#ffc36b", "#7a5af5,#b9a6ff", "#d63f74,#ff9cb8", "#2a7de0,#7fd1e8", "#21924a,#9be3a8"];
  function areaCard(n, photos, i = 0) {
    const p = n.photo && photos ? photos[n.photo] : null;
    const style = p ? `background-image:url('${photoUrl(p, 800)}')` : `background:linear-gradient(140deg,${GRADS[i % GRADS.length]})`;
    return `<a class="area" href="areas/${esc(n.id)}.html" data-id="${esc(n.id)}">
      <div class="ph${p ? " photo" : ""}" style="${style}"${p ? ` role="img" aria-label="${esc(p.place)}"` : ""}><b>${esc(n.name)}</b><span class="price" title="Relative price tier">${"$".repeat(n.price_tier)}</span></div>
      <div class="body"><p>${esc(n.lifestyle_summary)}</p><div class="tags">${n.best_for.slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      ${p ? `<span class="stamp">Photo: ${esc(p.by)} / ${esc(p.site || "Unsplash")}${p.license ? ` (${esc(p.license)})` : ""}</span>` : ""}</div></a>`;
  }
  function photoCredit(p) {
    return p ? `Photo: <a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(p.by)}</a> / ${esc(p.site || "Unsplash")}${p.license ? ` (${esc(p.license)})` : ""}` : "";
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
            <a class="logo" href="index.html"><i aria-hidden="true">D</i><span><b>${esc(C.BRAND_NAME)}</b></span></a>
            <p class="muted">Neighborhoods, schools, market numbers and moving help for Dallas–Fort Worth, plus an AI that answers your questions.</p>
          </div>
          <div><h4>Explore</h4><ul>
            <li><a href="why.html">Why DFW</a></li><li><a href="neighborhoods.html">Neighborhoods</a></li><li><a href="schools.html">Schools</a></li><li><a href="intelligence.html#moving">Moving Here</a></li>
            <li><a href="intelligence.html#living">Living Here</a></li><li><a href="intelligence.html#real-estate">Real Estate</a></li><li><a href="ask.html">Ask AI</a></li></ul></div>
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
            <a href="privacy.html">Privacy policy</a>
          </div>
          ${C.BROKER_NAME ? `<p><strong>${esc(C.AGENT_NAME)}</strong>, ${esc(C.AGENT_TITLE)}, Texas license #${esc(C.AGENT_LICENSE || "")}${C.TEAM_NAME ? `, ${esc(C.TEAM_NAME)}` : ""}. Licensed real estate sales agent sponsored by <strong>${esc(C.BROKER_NAME)}</strong>.</p>` : ""}
          <p>Equal Housing Opportunity. Neighborhood information is editorial and general in nature. It does not describe or rank areas by the characteristics of the people who live there. AI answers and calculator results are estimates, not appraisals, lending decisions, or legal or tax advice. Verify all figures before you rely on them.</p>
          <p>Photos from Unsplash, Pexels and Wikimedia Commons photographers, credited on each image with license. © ${year} ${esc(C.BRAND_NAME)}</p>
        </div>
      </div>`;
  }

  // ---------- lead handoff ----------
  function conversationSummary() {
    const convo = store.get("conversation", []);
    const qs = convo.filter((m) => m.role === "user").slice(-6).map((m) => "• " + m.content);
    return qs.join("\n");
  }

  /** Lead delivery: queued in an on-device outbox, sent in the background (keepalive), retried on the next page load. */
  function leadBody(brief) {
    const flat = {};
    const pretty = (v) => (v == null || v === "" ? "" : typeof v === "object" ? (Array.isArray(v) ? v.join(", ") : Object.entries(v).filter(([, x]) => x !== "" && x != null && !(Array.isArray(x) && !x.length)).map(([k, x]) => `${k}: ${Array.isArray(x) ? x.join(", ") : typeof x === "object" ? JSON.stringify(x) : x}`).join(" | ")) : String(v));
    Object.entries(brief).forEach(([k, v]) => { const t = pretty(v); if (t) flat[k.replace(/_/g, " ")] = t; });
    return { _subject: `New lead · ${C.BRAND_NAME}: ${brief.name || "visitor"}${brief.goal ? " (" + brief.goal + ")" : ""}`, _template: "table", _captcha: "false", name: brief.name || "", email: brief.email || "", ...flat };
  }
  // Leads go to the site's own mail service first (branded emails via the Worker), then FormSubmit as a backup.
  function viaWorker(brief) {
    if (!C.AI_WORKER_URL || !brief) return Promise.resolve(false);
    return fetch(C.AI_WORKER_URL.replace(/\/$/, "") + "/lead", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(brief) })
      .then((r) => r.ok).catch(() => false);
  }
  function deliver(item) {
    const viaForm = () => (C.LEAD_ENDPOINT ? fetch(C.LEAD_ENDPOINT, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(item.body) })
      .then((r) => r.json().catch(() => ({})).then((j) => r.ok && (j.success === undefined || String(j.success) === "true")))
      .catch(() => false) : Promise.resolve(false));
    return viaWorker(item.brief).then((ok) => ok || viaForm())
      .then((ok) => { if (ok) store.set("outbox", store.get("outbox", []).filter((x) => x.id !== item.id)); return ok; });
  }
  /** Returns true right away when the lead is queued (it finishes sending in the background). */
  function sendLead(brief) {
    if (!C.LEAD_ENDPOINT && !C.AI_WORKER_URL) return false;
    const item = { at: Date.now(), id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), body: leadBody(brief), brief };
    store.set("outbox", [...store.get("outbox", []), item].slice(-10));
    deliver(item);
    return true;
  }
  // Retry anything that didn't finish sending last time (e.g. the visitor closed the tab mid-send).
  setTimeout(() => { if (C.LEAD_ENDPOINT || C.AI_WORKER_URL) store.get("outbox", []).filter((x) => Date.now() - (x.at || 0) > 120000).forEach((x) => { x.at = Date.now(); store.set("outbox", store.get("outbox", []).map((y) => (y.id === x.id ? x : y))); deliver(x); }); }, 1500);

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 400); }, 6000);
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
          <label style="display:flex;gap:.5rem;align-items:flex-start;font-weight:400"><input id="ho-consent" type="checkbox" style="width:auto;margin-top:.25rem" required> I agree to be contacted about my request by phone, text or email. <a class="link" href="privacy.html" target="_blank">Privacy</a></label>
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
          sent = sendLead(brief);
        } catch (e2) { sent = false; }
      }
      track("handoff_submit", { goal: data.goal, timeline: data.timeline, sent });
      f.hidden = true;
      const done = wrap.querySelector("#ho-done");
      done.hidden = false;
      done.innerHTML = sent
        ? `<div class="note" style="font-size:1.05rem"><strong>✓ Sent! Thanks, ${esc(data.name.split(" ")[0])}.</strong> ${esc(C.AGENT_NAME)} will reach out${data.timeline === "0–3 months" ? " shortly" : " soon"} with your questions in hand.</div>
           <button class="btn btn-sm" type="button" data-close>Close</button>
           ${C.CALENDAR_URL ? `<a class="btn btn-brass" href="${esc(C.CALENDAR_URL)}" target="_blank" rel="noopener">Book a 30-min call now</a>` : ""}`
        : `<div class="note"><strong>Your request is saved on this device, but it wasn't sent.</strong> Reach ${esc(C.AGENT_NAME)} directly and paste the summary below.</div>
           <p><strong>${esc(C.AGENT_PHONE)}</strong> · <strong>${esc(C.AGENT_EMAIL)}</strong></p>
           <textarea id="ho-summary" readonly style="min-height:140px">${esc(`Hi ${C.AGENT_NAME.split(" ")[0]}, I'm ${data.name} (${data.email}${data.phone ? ", " + data.phone : ""}). Goal: ${data.goal}. Timeline: ${data.timeline}.\n${data.message || ""}\n\nRecent questions:\n${brief.recent_questions || "(none)"}`)}</textarea>
           <button class="btn btn-sm" type="button" id="ho-copy">Copy summary</button>`;
      if (sent) { wrap.remove(); toast(`✓ Thanks, ${data.name.split(" ")[0]}! ${C.AGENT_NAME.split(" ")[0]} will reach out shortly.`); return; }
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


  // ---------- free guide (lead magnet) ----------
  // Sends a branded email with the PDF (and a lead alert to Kohl) and shows the download button right away.
  const GUIDE_PDF = "assets/guide/Moving-to-DFW-Guide.pdf";
  function guideDone(form, name) {
    form.innerHTML = `<div style="display:grid;gap:.6rem"><p style="margin:0;font-weight:800;color:var(--teal)">Thanks${name ? ", " + esc(name) : ""}! Your guide is ready right now:</p><a class="btn btn-brass" href="${GUIDE_PDF}" target="_blank" rel="noopener" style="justify-content:center">Download the guide (PDF)</a><span style="font-size:.85rem;color:var(--ink-2)">We also emailed you a copy for later. Check spam or Promotions if you don't see it in a few minutes.</span><span style="font-size:.85rem;color:var(--mute)">Questions? Call or text Kohl at ${esc(C.AGENT_PHONE || "337-794-9971")}.</span></div>`;
  }
  function guideForm(form, msg, source) {
    if (!form) return;
    const hp = document.createElement("input"); hp.type = "text"; hp.name = "hp_confirm_field"; hp.tabIndex = -1; hp.autocomplete = "new-password"; hp.setAttribute("data-lpignore", "true"); hp.setAttribute("data-1p-ignore", ""); hp.setAttribute("aria-hidden", "true"); hp.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0";
    form.appendChild(hp);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = form.name.value.trim(), email = form.email.value.trim();
      if (!name || !/^\S+@\S+\.\S+$/.test(email)) { if (msg) { msg.textContent = "Please add your first name and a valid email."; msg.style.color = "var(--bad)"; } return; }
      const bot = !!hp.value;
      store.set("profile", { ...store.get("profile", {}), name, email });
      track("handoff_submit", { kind: "guide", source });
      sendLead({ name, email, ...(bot ? { website: hp.value } : {}), kind: "guide", goal: "Relocate to DFW", request: "Moving to DFW guide (12-page PDF, emailed automatically)", source, page: location.pathname, submitted_at: new Date().toISOString(), profile: store.get("profile", {}) });
      guideDone(form, name);
      setTimeout(() => toast("\u2713 Your guide is ready to download. A copy is on its way by email."), 200);
    });
    if (/[?&]guide=sent/.test(location.search)) guideDone(form, store.get("profile", {}).name || "");
  }

  // Sticky Call / Text / Book bar on phones.
  function mobileBar() {
    if (document.getElementById("m-bar") || !C.AGENT_PHONE) return;
    const tel = C.AGENT_PHONE.replace(/[^0-9+]/g, "");
    const b = document.createElement("nav");
    b.id = "m-bar"; b.className = "m-bar"; b.setAttribute("aria-label", "Contact Kohl");
    b.innerHTML = `<a href="tel:${tel}" data-mb="call">Call</a><a href="sms:${tel}" data-mb="text">Text</a>${C.CALENDAR_URL ? `<a class="hot" href="${esc(C.CALENDAR_URL)}" target="_blank" rel="noopener" data-mb="book">Book a call</a>` : ""}`;
    b.addEventListener("click", (e) => { const a = e.target.closest("a"); if (a) track("mobile_bar", { action: a.dataset.mb }); });
    document.body.appendChild(b);
    document.body.classList.add("has-m-bar");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mobileBar); else mobileBar();

  // Book-a-call links: any element with data-cal points at CALENDAR_URL (hidden when it's blank).
  function wireCal() {
    document.querySelectorAll("[data-cal]").forEach((a) => {
      if (!C.CALENDAR_URL) { a.hidden = true; return; }
      a.href = C.CALENDAR_URL; a.target = "_blank"; a.rel = "noopener"; a.hidden = false;
      if (!a.dataset.calWired) { a.dataset.calWired = "1"; a.addEventListener("click", () => track("book_call", { from: a.dataset.cal })); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireCal); else wireCal();

  window.DREI = { guideForm, sendLead, C, esc, money, pct, store, track, loadJSON, tier, shield, shields, openHandoff, TIER_LABEL, photoUrl, photoCredit, areaCard, GRADS, toast };
})();
