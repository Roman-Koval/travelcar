const CACHE_NAME = 'travelcar-v1';

const urlsToCache = [
  '/travelcar/',
  '/travelcar/index.html',
  '/travelcar/styles.css',
  '/travelcar/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
