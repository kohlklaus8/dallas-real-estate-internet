/*
 * Installable app: registers the service worker and shows a small "Get the app" card on the home search.
 * Android / desktop Chrome get a one-tap Install button; iPhone gets the two-step Share → Add to Home Screen hint.
 */
(function () {
  const D = window.DREI || {}, store = D.store || { get: (k, d) => d, set() {} };
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) { document.documentElement.classList.add("is-app"); if (D.track) D.track("app_open", {}); return; }
  const ua = navigator.userAgent, iOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = iOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
  const snoozed = Date.now() - (store.get("appCardDismissed", 0) || 0) < 14 * 864e5;
  let deferred = null;
  function card(html) {
    if (snoozed || document.getElementById("appCard")) return null;
    const c = document.createElement("div");
    c.id = "appCard"; c.className = "app-card"; c.setAttribute("role", "region"); c.setAttribute("aria-label", "Get the app");
    c.innerHTML = `<img src="assets/img/app-icon-192.png" alt="" width="44" height="44"><div class="app-txt">${html}</div><button type="button" class="app-x" aria-label="Not now">✕</button>`;
    c.querySelector(".app-x").addEventListener("click", () => { store.set("appCardDismissed", Date.now()); c.remove(); });
    const list = document.getElementById("list");
    (list ? list.parentNode.insertBefore(c, list.parentNode.firstChild) : document.body.appendChild(c));
    return c;
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    const c = card(`<b>Get the DFW Homes app</b><span>One tap from your home screen. Free.</span>`);
    if (!c) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-brass btn-sm"; b.textContent = "Install";
    b.addEventListener("click", async () => { if (!deferred) return; deferred.prompt(); const r = await deferred.userChoice; if (D.track) D.track("app_install_prompt", { outcome: r.outcome }); deferred = null; c.remove(); });
    c.insertBefore(b, c.querySelector(".app-x"));
  });
  window.addEventListener("appinstalled", () => { if (D.track) D.track("app_installed", {}); const c = document.getElementById("appCard"); if (c) c.remove(); });
  if (safari) setTimeout(() => card(`<b>Get the DFW Homes app</b><span>Tap <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px" aria-label="Share"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg> Share, then <b>Add to Home Screen</b>.</span>`), 4000);
})();
