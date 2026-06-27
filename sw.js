const CACHE_NAME = 'kaikki-hyvin-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.jpg'
];

// Install Service Worker and cache assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Service Worker and clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch assets from network first, update cache, fallback to cache if offline
self.addEventListener('fetch', (e) => {
  // Only handle GET requests for caching
  if (e.request.method !== 'GET') {
    return;
  }
  
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // If response is valid, clone it and update the cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseCopy);
          });
        }
        return response;
      })
      .catch(() => {
        // If network request fails (offline), fallback to cache
        return caches.match(e.request);
      })
  );
});
