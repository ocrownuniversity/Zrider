// Zrider Service Worker — v1.0.0
// Provides offline shell, background sync, and push notification support.

const CACHE_NAME = 'zrider-v1';
const OFFLINE_URL = './index.html';

// Files to pre-cache for offline access
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch (Network-first with offline fallback) ─────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin (Firebase, Google Maps, Paystack, Nominatim)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache fresh copy of same-origin assets
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        // Offline: serve from cache or fall back to app shell
        caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
  );
});

// ─── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Zrider', body: 'You have a new notification.' };
  try {
    data = event.data ? event.data.json() : data;
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
      vibrate: [200, 100, 200],
      data: data.url || './',
      actions: [
        { action: 'open', title: 'Open Zrider' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

// ─── Notification Click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data || './index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ─── Background Sync (e.g. queued ride requests while offline) ────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'zrider-sync') {
    event.waitUntil(Promise.resolve()); // Firebase handles its own sync on reconnect
  }
});
