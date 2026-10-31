/* ==========================================================
   sw.js – Service Worker: macht FitBoard offline nutzbar
   - Eigene Dateien: erst Netzwerk (damit Updates sofort ankommen),
     ohne Netz aus dem Zwischenspeicher
   - Chart.js & Schriftarten: aus dem Zwischenspeicher (ändern sich nie)
   Bei neuen Dateien: Liste APP_FILES ergänzen und VERSION erhöhen.
   ========================================================== */

const VERSION = 'fitboard-v3';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/utils.js',
  './js/data.js',
  './js/charts.js',
  './js/sports.js',
  './js/progress.js',
  './js/plans.js',
  './js/nutrition-data.js',
  './js/nutrition.js',
  './js/mobile.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

const CDN_FILES = ['https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'];

// Beim Installieren alles Nötige vorab speichern
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      await cache.addAll(APP_FILES);
      await Promise.all(
        CDN_FILES.map((url) =>
          fetch(url, { mode: 'cors' })
            .then((response) => response.ok && cache.put(url, response))
            .catch(() => {})
        )
      );
    })
  );
  self.skipWaiting();
});

// Alte Versionen aufräumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // Eigene Dateien: Netzwerk zuerst, sonst Zwischenspeicher
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
    );
    return;
  }

  // Fremde Dateien (Chart.js, Google Fonts): Zwischenspeicher zuerst
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            if (response.ok || response.type === 'opaque') {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => Response.error())
    )
  );
});
