/* MeteoCalc service worker.
   Bump VERSION whenever you ship a new build, so old caches are discarded.
   Required Notice: Copyright 2026 Jef Zerrudo (https://github.com/jbzerrudo/MeteoCalc)
   PolyForm Noncommercial License 1.0.0 */
const VERSION = 'meteocalc-v5';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // The page itself: network first, so anyone online always lands on the newest
  // build and can never get stuck on a stale calculator. Cache is the fallback.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(VERSION);
        c.put(req, res.clone());
        return res;
      } catch (err) {
        return (await caches.match(req)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // Everything else, the webfonts included: cache first, then network, storing
  // whatever succeeds so the second visit works with no connection at all.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const c = await caches.open(VERSION);
        c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
