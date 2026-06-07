const CACHE_NAME = 'litemeet-v2';
const STATIC_ASSETS = [
  '/',
  '/icon.png',
  '/manifest.json',
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API/navigation, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (LiveKit, Pusher, Firebase, etc.)
  if (url.origin !== self.location.origin) return;

  // API routes: network-first with no caching
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'You are offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Static assets & pages: cache-first, fallback to network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Return cached version, update cache in background
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse);
            });
          }
          return networkResponse.clone();
        }).catch(() => {});
        return cached;
      }

      // Not in cache: try network, then cache the response
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('/').then((fallback) => {
            return fallback || new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LiteMeet - Offline</title><style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#e5e7eb;font-family:system-ui,sans-serif;text-align:center;padding:2rem}.container{max-width:400px}h1{font-size:1.5rem;margin-bottom:1rem;color:#6366f1}p{color:#9ca3af;line-height:1.6}button{margin-top:1.5rem;padding:.75rem 2rem;background:#6366f1;color:#fff;border:none;border-radius:.5rem;font-size:1rem;cursor:pointer}button:hover{background:#4f46e5}</style></head><body><div class="container"><h1>You\'re Offline</h1><p>LiteMeet needs an internet connection for video conferencing. Please check your connection and try again.</p><button onclick="location.reload()">Try Again</button></div></body></html>',
              { status: 503, headers: { 'Content-Type': 'text/html' } }
            );
          });
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
