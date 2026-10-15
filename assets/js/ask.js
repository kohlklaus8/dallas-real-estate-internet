(function () {
  const { C, esc, store, track, loadJSON, openHandoff } = window.DREI;
  const log = document.getElementById("log");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-q");
  const pill = document.getElementById("mode-pill");
  const LIVE = !!C.AI_WORKER_URL;
  pill.textContent = LIVE ? "Live AI" : "Demo mode";
  pill.classList.toggle("live", LIVE);
  pill.title = LIVE ? "Answers from Claude, grounded in this site's data" : "Answers built from this site's own data. Connect the AI Worker for full conversational answers.";

  const ctx = { calc: window.DREI_CALC };
  const ready = Promise.all([
    loadJSON("data/neighborhoods.json").then((d) => (ctx.data = d)).catch(() => (ctx.data = { neighborhoods: [] })),
    loadJSON("data/articles.json").then((d) => (ctx.articles = d)).catch(() => (ctx.articles = { articles: [] })),
    loadJSON("data/market.json").then((d) => (ctx.market = d)).catch(() => (ctx.market = {})),
  ]);

  // ---------- rendering ----------
  function mdLite(text) {
    // Safe, minimal markdown: paragraphs, bullet lists, **bold**, [label](relative-or-https link)
    const inline = (s) => esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(((?:https:\/\/|[a-z0-9-]+\.html)[^)\s]*)\)/gi, (m, l, h) => `<a class="link" href="${h}"${h.startsWith("https") ? ' target="_blank" rel="noopener"' : ""}>${l}</a>`);
    const blocks = String(text || "").trim().split(/\n{2,}/);
    return blocks.map((b) => {
      const lines = b.split("\n");
      if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) return "<ul>" + lines.map((l) => `<li>${inline(l.replace(/^\s*[-•*]\s+/, ""))}</li>`).join("") + "</ul>";
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    }).join("");
  }

  function addUser(text) {
    const el = document.createElement("div");
    el.className = "msg user"; el.textContent = text;
    log.appendChild(el); scroll();
  }

  function addAI(r) {
    const el = document.createElement("div");
    el.className = "msg ai";
    const srcs = (r.sources || []).filter(Boolean);
    el.innerHTML = `<div class="bubble">${r.html}</div>` +
      (srcs.length ? `<div class="src">Source: ${srcs.map(esc).join(" · ")}</div>` : "") +
      (r.handoff ? `<div class="handoff"><strong>Want a local expert on this?</strong><span style="font-size:.9rem">They'll see this conversation, so you won't start over.</span><div><button class="btn btn-brass btn-sm" type="button" data-ho-reason="${esc(r.reason || "")}">Talk to a local expert</button></div></div>` : "") +
      ((r.followups || []).length ? `<div class="followups">${r.followups.map((f) => `<button class="chip" type="button">${esc(f)}</button>`).join("")}</div>` : "");
    el.querySelectorAll(".followups .chip").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
    const ho = el.querySelector("[data-ho-reason]");
    if (ho) ho.addEventListener("click", () => openHandoff({ source: "ai-" + (r.intent || "chat"), reason: ho.getAttribute("data-ho-reason") }));
    el.querySelectorAll("[data-compare]").forEach((a) => a.addEventListener("click", () => store.set("compareIds", a.getAttribute("data-compare").split(","))));
    log.appendChild(el); scroll();
  }

  function typing(on) {
    let t = document.getElementById("typing");
    if (on && !t) { t = document.createElement("div"); t.id = "typing"; t.className = "msg ai"; t.innerHTML = '<span class="typing" aria-label="Thinking"><i></i><i></i><i></i></span>'; log.appendChild(t); scroll(); }
    if (!on && t) t.remove();
  }
  const scroll = () => { log.scrollTop = log.scrollHeight; };

  // ---------- answering ----------
  async function liveAnswer(q) {
    const history = store.get("conversation", []).slice(-12).map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch(C.AI_WORKER_URL.replace(/\/$/, "") + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, profile: store.get("profile", {}), page: location.href }),
    });
    if (!res.ok) throw new Error("Worker " + res.status);
    const d = await res.json();
    return { html: mdLite(d.reply), sources: d.sources || [], followups: d.followups || [], handoff: !!d.handoff, reason: d.reason || q, intent: d.intent || "live", text: d.reply };
  }

  let busy = false;
  async function ask(q) {
    q = String(q || "").trim();
    if (!q || busy) return;
    busy = true;
    input.value = "";
    addUser(q);
    store.push("conversation", { role: "user", content: q, at: new Date().toISOString() }, 60);
    store.push("questions", { q, at: new Date().toISOString() }, 500);
    track("ask", { length: q.length });
    typing(true);
    await ready;
    let r;
    try {
      if (LIVE) r = await liveAnswer(q);
    } catch (e) {
      r = null;
      pill.textContent = "Demo mode (AI offline)"; pill.classList.remove("live");
    }
    if (!r) {
      await new Promise((ok) => setTimeout(ok, 350));
      r = window.DREI_BRAIN.respond(q, ctx);
      r.text = r.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    typing(false);
    addAI(r);
    store.push("conversation", { role: "assistant", content: r.text, intent: r.intent, at: new Date().toISOString() }, 60);
    if (r.intent && /seller|buyer|compare|area|handoff/.test(r.intent)) track("intent_" + r.intent, {});
    busy = false;
    input.focus();
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  document.getElementById("clear-btn").addEventListener("click", () => { store.set("conversation", []); log.innerHTML = ""; greet(); });

  function greet() {
    addAI({
      html: `<p>Hi, I'm ${esc(C.AI_NAME)}. I know ${esc(C.LAUNCH_AREA)}: neighborhoods, commutes, Texas tax quirks and how to plan a sale or a move. What are you trying to figure out?</p>`,
      followups: ["Where should I live?", "Compare Frisco vs. Plano", "Should I sell?", "What can I afford?"],
    });
  }

  function renderContext() {
    const p = store.get("profile", {});
    const bits = [["Goal", p.role], ["Budget", p.budget], ["Timeline", p.timeline], ["Commute to", p.commute], ["Areas", (p.areas || []).join(", ")]].filter(([, v]) => v);
    document.getElementById("context-body").innerHTML = bits.length
      ? `<dl style="display:grid;grid-template-columns:auto 1fr;gap:.25rem .75rem;margin:0">${bits.map(([k, v]) => `<dt class="muted">${k}</dt><dd style="margin:0">${esc(v)}</dd>`).join("")}</dl>`
      : `<p class="muted">Nothing saved yet. Add your goal, budget and commute to get more specific answers.</p>`;
  }

  // restore conversation
  const prior = store.get("conversation", []);
  if (prior.length) {
    prior.slice(-20).forEach((m) => (m.role === "user" ? addUser(m.content) : addAI({ html: `<p>${esc(m.content)}</p>` })));
  } else greet();
  renderContext();

  const pending = store.get("pendingQ", "");
  if (pending) { store.set("pendingQ", ""); ask(pending); }
})();
