(function () {
  const { esc, store, track, loadJSON, money } = window.DREI;
  const form = document.getElementById("pf");
  const FIELDS = ["name", "email", "role", "timeline", "budget", "commute", "beds", "homeType", "priorities"];

  function fill() {
    const p = store.get("profile", {});
    FIELDS.forEach((k) => { const el = form.elements[k]; if (el && p[k] != null && typeof p[k] !== "object") el.value = p[k]; });
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const p = store.get("profile", {});
    FIELDS.forEach((k) => (p[k] = form.elements[k].value.trim()));
    store.set("profile", p);
    track("save_profile", { from: "profile" });
    document.getElementById("pf-status").textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  });

  const empty = (t) => `<p class="muted" style="font-size:.9rem">${t}</p>`;
  function renderSaved(N) {
    const ids = store.get("saved", []);
    const rows = ids.map((id) => N.find((n) => n.id === id)).filter(Boolean);
    document.getElementById("saved").innerHTML = rows.length
      ? `<ul class="clean">${rows.map((n) => `<li><a class="link" href="neighborhoods.html#${esc(n.id)}">${esc(n.name)}</a></li>`).join("")}</ul>`
      : empty('No saved areas yet. Open any <a class="link" href="neighborhoods.html">neighborhood</a> and tap "Save area".');
  }
  const TOOL_NAMES = { affordability: "Affordability", proceeds: "Seller proceeds", move: "Move calculator", compare: "Compare", fit: "Where should I live?" };
  function renderTools() {
    const t = store.get("lastTools", {});
    const rows = Object.entries(t).map(([k, v]) => {
      let s = "";
      if (k === "affordability") s = `${money(v.comfortable)} – ${money(v.stretch)}`;
      if (k === "proceeds") s = `Net ${money(v.net)} at ${money(v.price)}`;
      if (k === "move") s = `${money(v.payment)}/mo on ${money(v.target)}`;
      if (k === "compare") s = (v.ids || []).join(" vs. ");
      if (k === "fit") s = (v.top || []).join(", ");
      return `<li><a class="link" href="tools.html#${k}">${TOOL_NAMES[k] || k}</a>: <span class="muted">${esc(s)}</span></li>`;
    });
    document.getElementById("tools").innerHTML = rows.length ? `<ul class="clean" style="font-size:.92rem">${rows.join("")}</ul>` : empty('Run a <a class="link" href="tools.html">tool</a> and your latest result appears here.');
  }
  function renderHistory() {
    const qs = store.get("questions", []).slice(-8).reverse();
    document.getElementById("questions").innerHTML = qs.length ? `<ul class="clean" style="font-size:.92rem">${qs.map((q) => `<li>${esc(q.q)} <span class="stamp">${esc(new Date(q.at).toLocaleDateString())}</span></li>`).join("")}</ul>` : empty("No questions yet.");
    const rs = store.get("requests", []).slice(-5).reverse();
    document.getElementById("requests").innerHTML = rs.length ? `<ul class="clean" style="font-size:.92rem">${rs.map((r) => `<li>${esc(r.goal)} · ${esc(r.timeline)} <span class="stamp">${esc(new Date(r.submitted_at).toLocaleDateString())}</span></li>`).join("")}</ul>` : empty("You haven't asked for human help yet.");
  }

  document.getElementById("clear").addEventListener("click", () => (document.getElementById("confirm").hidden = false));
  document.getElementById("clear-no").addEventListener("click", () => (document.getElementById("confirm").hidden = true));
  document.getElementById("clear-yes").addEventListener("click", () => {
    try { Object.keys(localStorage).filter((k) => k.startsWith("drei:")).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
    form.reset(); document.getElementById("confirm").hidden = true;
    renderTools(); renderHistory(); renderSaved(window._N || []);
  });

  fill(); renderTools(); renderHistory();
  loadJSON("data/neighborhoods.json").then((d) => { window._N = d.neighborhoods; renderSaved(d.neighborhoods); }).catch(() => renderSaved([]));
})();
