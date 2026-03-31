const CACHE_NAME = 'travelcar-v2.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/version.json',
  '/travelcar-icon-192.png',
  '/travelcar-icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => 
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  
  if (STATIC_ASSETS.some(a => request.url.includes(a.split('/').pop()))) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
    return;
  }
  
  event.respondWith(
    fetch(request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return res;
      })
      .catch(() => caches.match(request))
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-expenses') {
    event.waitUntil(syncPendingExpenses());
  }
});

async function syncPendingExpenses() {
  console.log('Background sync: expenses');
}

self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'TravelCar', {
      body: data.body || 'Новое уведомление',
      icon: '/travelcar-icon-192.png',
      badge: '/travelcar-icon-192.png'
    })
  );
});
