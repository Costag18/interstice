// sw.js — Cache-first service worker for offline shell.
//
// On install: pre-cache the entire app shell.
// On activate: drop old cache versions, claim all clients.
// On fetch: cache-first for same-origin; passthrough for cross-origin
//           (fonts, YouTube embed); fall back to index.html on offline navigation.

const CACHE = 'interstice-v25';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/app.js',
  './src/db.js',
  './src/router.js',
  './src/theme.js',
  './src/shortcuts.js',
  './src/safe-dom.js',
  './src/sync.js',
  './src/sync-meta.js',
  './src/crypto.js',
  './src/ask-llm.js',
  './src/helpers/date.js',
  './src/helpers/prefs.js',
  './src/components/nav.js',
  './src/components/topbar.js',
  './src/components/fab.js',
  './src/views/today.js',
  './src/views/new-entry.js',
  './src/views/calendar.js',
  './src/views/day-detail.js',
  './src/views/stickies.js',
  './src/views/hybrid.js',
  './src/views/search.js',
  './src/views/about.js',
  './src/views/settings.js',
  './src/views/onboarding.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('SW install partial failure', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin requests through

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
