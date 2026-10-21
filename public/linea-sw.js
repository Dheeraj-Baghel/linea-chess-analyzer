/* global importScripts */
// No background chess computation. This worker caches a bounded, versioned app
// shell for previously saved reviews. IndexedDB remains the game's source store.
importScripts('/linea-offline-version.js');
const CACHE_PREFIX = 'linea-offline-';
const CACHE = CACHE_PREFIX + self.LINEA_OFFLINE.version;
const ASSETS = new Set(self.LINEA_OFFLINE.assets);
const OPTIONAL = new Set(self.LINEA_OFFLINE.optionalAssets || []);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...ASSETS])));
  // No skipWaiting: never replace a running review's app/engine version silently.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    // Keep this app version coherent until its worker retires. Both cached index
    // and its exact engine/assets belong to the same immutable cache version.
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match('/index.html')) || fetch(event.request)));
  } else if (ASSETS.has(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  } else if (OPTIONAL.has(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const saved = await cache.match(url.pathname); if (saved) return saved;
      const response = await fetch(event.request); if (response.ok) await cache.put(url.pathname, response.clone()); return response;
    }));
  }
});
