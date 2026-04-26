const DEV_MODE = false; // Set to false for production

const APP_CACHE = 'banguide-v13';
const RUNTIME_CACHE = 'banguide-runtime-v13';

const SHELL_ASSETS = [
  './',
  './index.html',
  './course.html',
  './hole.html',
  './offline.html',
  './css/main.css',
  './css/components.css',
  './css/map.css',
  './js/courses.js',
  './js/holes.js',
  './js/map.js',
  './js/overlay.js',
  './js/clubs.js',
  './js/offline.js',
  './js/imported-data.js',
  './js/archive-import.js',
  './js/measurement.js',
  './js/scorecards.js'
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

async function networkFirstNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch {
    const cachedPage = await caches.match(request);
    if (cachedPage) return cachedPage;

    const offlinePage = await caches.match('./offline.html');
    return offlinePage || Response.error();
  }
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
    event.respondWith(networkFirstNavigation(request));
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
