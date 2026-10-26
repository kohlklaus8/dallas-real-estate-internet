/*
 * Service worker for the installable app. Network first for everything, so visitors always get the
 * latest site when they're online; the saved copy is only used when the network is down.
 * Calls to the Worker (listings, accounts) and other sites are never cached.
 */
const CACHE = "drei-app-v1";
const SHELL = ["/search.html", "/assets/css/site.css", "/assets/css/search.css", "/assets/js/config.js", "/assets/js/app.js",
  "/assets/js/search.js", "/assets/js/search-sample.js", "/assets/js/schools.js", "/assets/js/pwa.js", "/data/neighborhoods.json",
  "/assets/img/app-icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // Worker API, map tiles, fonts: straight to the network
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("/search.html", { ignoreSearch: true }) : Response.error())))
  );
});
