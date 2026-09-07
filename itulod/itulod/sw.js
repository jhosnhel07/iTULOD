/* iTULOD service worker
   - web push display (unchanged)
   - offline app shell: network-first for pages, stale-while-revalidate for
     same-origin static assets, an offline fallback page when both miss.

   Bump CACHE_VERSION whenever the offline behaviour needs to change; old
   caches are dropped on activate. */
const CACHE_VERSION = 'itulod-v1';
const PRECACHE = ['/offline.html', '/assets/logo.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return /\.(?:css|js|png|jpg|jpeg|svg|webp|woff2?|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Page navigations: network-first, fall back to cache, then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (sameOrigin && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/offline.html'))),
    );
    return;
  }

  // Same-origin static assets: serve cache, refresh in the background.
  if (sameOrigin && isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(request).then((hit) => {
          const network = fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || network;
        }),
      ),
    );
  }
  // Everything else (Supabase API, CDNs, Mapbox tiles): straight to network.
});

/* ── web push ─────────────────────────────────────────────────────────── */
self.addEventListener('push', (event) => {
  let data = { title: 'iTULOD', body: '' };
  try { data = event.data.json(); } catch (_) {
    try { data.body = event.data.text(); } catch (_) { /* no payload */ }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'iTULOD', {
      body: data.body || '',
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const hit = wins.find((w) => w.url.includes(url));
      return hit ? hit.focus() : self.clients.openWindow(url);
    }),
  );
});
