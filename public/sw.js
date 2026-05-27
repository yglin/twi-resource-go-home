const CACHE_NAME = 'ray-going-home-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline pages and assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Cleaning up old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  // Let the browser handle non-GET requests or requests to API paths
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  // Strictly skip caching any dev scripts, modules, or bundler-specific endpoints
  const url = event.request.url;
  if (
    url.includes('/src/') ||
    url.includes('/node_modules/') ||
    url.includes('.ts') ||
    url.includes('.tsx') ||
    url.includes('.jsx') ||
    url.includes('?v=') ||
    url.includes('?t=') ||
    url.includes('@vite/') ||
    url.includes('@id/')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache (Stale-While-Revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {/* Ignore background sync network errors */});
        
        return cachedResponse;
      }

      // Live request if not cached
      return fetch(event.request).then((networkResponse) => {
        // Avoid caching dynamic/hot module JS chunks altogether - only cache generic static resources
        const contentType = networkResponse.headers.get('content-type') || '';
        const isStaticAsset = contentType.includes('image/') || 
                              contentType.includes('font/') || 
                              url.endsWith('.png') || 
                              url.endsWith('.jpg') || 
                              url.endsWith('.jpeg') || 
                              url.endsWith('.svg') || 
                              url.endsWith('.ico') || 
                              url.endsWith('.webmanifest') ||
                              url.endsWith('/manifest.json');

        if (networkResponse.status === 200 && networkResponse.type === 'basic' && isStaticAsset) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback to home layout if html request fails offline
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
      });
    })
  );
});
