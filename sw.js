const DEV_MODE = false; // Set to false for production

const APP_CACHE = 'banguide-v20';
const RUNTIME_CACHE = 'banguide-runtime-v20';

const SHELL_ASSETS = [
  './',
  './index.html',
  './course.html',
  './hole.html',
  './offline.html',
  './manifest.webmanifest',
  './css/main.css',
  './css/components.css',
  './css/map.css',
  './js/courses.js',
  './js/holes.js',
  './js/map.js',
  './js/overlay.js',
  './js/clubs.js',
  './js/club-settings.js',
  './js/offline.js',
  './js/imported-data.js',
  './js/archive-import.js',
  './js/measurement.js',
  './js/scorecards.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  if (!DEV_MODE) {
    event.waitUntil(
      caches.open(APP_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
    );
  }
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== APP_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// Serve a cached page immediately when we have one, and refresh it in the
// background. This keeps repeat hole-to-hole navigation instant (the whole app
// is static) while still picking up new builds on the next visit.
async function staleWhileRevalidateNavigation(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cachedPage = await cache.match(request);

  const networkRequest = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone()).catch(() => {});
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cachedPage) {
    return cachedPage;
  }

  const networkResponse = await networkRequest;
  if (networkResponse) return networkResponse;

  const offlinePage = await caches.match('./offline.html');
  return offlinePage || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (DEV_MODE) return; // Bypass cache in dev mode

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidateNavigation(request));
    return;
  }

  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.startsWith('/data/')
  ) {
    event.respondWith(cacheFirst(request));
  }
});
