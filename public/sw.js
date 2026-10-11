/* Farm Command service worker — offline app shell + web push + notifications.
   Strategy:
   - Precache the offline fallback, app icons and the start URL.
   - Navigations: network-first, fall back to cache, then the offline page
     (the app itself is offline-first: data lives in IndexedDB, so a cached
     app shell + local database = a fully working farm app with no internet).
   - Static assets (/_next/static, icons, images): stale-while-revalidate —
     serve the cached copy instantly, refresh it in the background.
   - API GETs: network-first with cache fallback (recently-read responses stay
     viewable offline; POST/PUT/PATCH/DELETE are never intercepted or faked —
     the real local DB + outbox queue in the app handles offline mutations).
   - Push: server-delivered reminder notifications (Web Push / VAPID) with a
     notificationclick handler that focuses or opens the relevant screen.
*/
const VERSION = 'farmcommand-v4';
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/assets/') ||
    /\.(css|js|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App navigations: network first → cache → offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => cached || Response.error());
        return cached || network;
      })
    );
    return;
  }

  // API GETs: network first → cached copy (stale but readable offline).
  // NOTE: the app's primary data layer is IndexedDB; this is only an extra
  // safety net for pages that were read recently. Nothing sensitive is
  // cached beyond the same-origin responses the user already loaded.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});

/* ---------------- Notifications & Web Push ---------------- */

/** Show a notification from a data payload (push or local trigger). */
function showAppNotification(data) {
  const title = typeof data.title === 'string' && data.title ? data.title : 'Farm Command';
  return self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
    // Sound/vibration follow OS + browser settings on the platforms that
    // support them; vibrate is honoured by Android Chromium.
    vibrate: Array.isArray(data.vibrate) ? data.vibrate : undefined,
    requireInteraction: false,
  });
}

// Web Push: server-delivered reminders (only fires when a real push arrives).
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Farm Command', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(showAppNotification(payload));
});

// Clicking a notification focuses the app (or opens it) on the target screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
