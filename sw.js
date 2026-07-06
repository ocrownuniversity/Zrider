// Zrider service worker
// Strategy:
//  - App shell (index.html, manifest, icons) is precached on install and
//    served cache-first so the app opens instantly and works offline.
//  - Same-origin navigations use a network-first strategy with a cache
//    fallback, so users always get the newest build when online, but the
//    app still opens if they're offline.
//  - Cross-origin requests (Firebase/Firestore, Google Fonts, Nominatim,
//    Paystack, Google Maps) are NEVER cached and always go straight to the
//    network — this is a live ride-hailing app, so real-time data, auth,
//    and payments must never be served stale or intercepted.

const CACHE_VERSION = 'zrider-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-144.png',
  './icon-152.png',
  './icon-192.png',
  './icon-384.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests on our own origin — everything else
  // (Firestore, Firebase Auth, Paystack, Nominatim, Google Fonts/Maps,
  // POST/PUT requests, etc.) is left completely untouched so the service
  // worker never interferes with live data, payments, or auth.
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Page navigations: network-first, falling back to the cached app
  // shell when offline (so the app still opens without a connection).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets (icons, manifest, etc.): cache-first, updating the
  // cache in the background when a fresh copy is fetched.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// Allow the page to trigger an immediate update (e.g. from an
// "update available" banner) without waiting for the next navigation.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
