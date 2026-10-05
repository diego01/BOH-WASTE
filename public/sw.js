/*
 * BOH Waste service worker.
 * - Build assets (/_next/static) are immutable: cache-first.
 * - The logging screens (/log, /log/history) are network-first and cached, so the
 *   app opens with no connection and keeps queuing entries (they sync later).
 * - Nothing else is cached: no API calls, no reports, no settings.
 * - The cached pages belong to whoever is signed in; the login screen tells the
 *   worker to drop them, so the next person never sees someone else's screen.
 */
const VERSION = "v1";
const STATIC = `boh-static-${VERSION}`;
const PAGES = `boh-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const OFFLINE_PAGES = ["/log", "/log/history"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("boh-") && ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGES));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    const cacheable = OFFLINE_PAGES.includes(url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only cache a real page for a signed-in user (a redirect means signed out).
          if (cacheable && res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          // "/" just redirects to the logging screen.
          const key = url.pathname === "/" ? "/log" : url.pathname;
          const cached = OFFLINE_PAGES.includes(key) ? await caches.match(key, { cacheName: PAGES }) : null;
          return cached || caches.match(OFFLINE_URL);
        }),
    );
  }
});
