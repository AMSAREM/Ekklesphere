// public/sw.js - Ekklesphere Progressive Web App & Push Notification Service Worker
const CACHE_NAME = 'ekklesphere-v3';
const ASSETS_TO_CACHE = [
  '/icon.svg',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Cache addAll skipped non-critical assets:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      }),
    ])
  );
});

// Network-first fetch handler for navigation & static asset caching (required for PWA installability)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache or intercept API routes or Vite dev modules
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  // Navigation requests: network-first with cached shell / offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = (await caches.match(request)) || (await caches.match('/'));
          if (cached) return cached;
          return new Response(
            '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Ekklesphere Offline</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#1D1B3A;color:#F2F2FA;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}.card{max-width:380px;background:#26244A;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:28px}h1{font-size:20px;margin:0 0 8px}p{font-size:14px;color:#A9ACC8;line-height:1.5;margin:0 0 18px}button{background:#6D5CF2;color:#fff;border:0;border-radius:12px;padding:10px 18px;font-weight:700;cursor:pointer}</style></head><body><div class="card"><h1>You are offline</h1><p>Reconnect to the internet to sync live sanctuary attendance and member updates.</p><button onclick="location.reload()">Try Again</button></div></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // Static PWA assets & built Vite bundles: stale-while-revalidate
  const isCacheableStatic =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/pwa-') ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/manifest.json';

  if (isCacheableStatic) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === 'basic') {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
        return cached || (await networkPromise);
      })
    );
  }
});

// Handle incoming Web Push notifications from server
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Ekklesphere Church Alert',
    body: 'You have a new update from church.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'ekklesphere-notification',
    data: { url: '/' },
  };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = { ...payload, ...json };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const notificationOptions = {
    body: payload.body,
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    tag: payload.tag || 'ekklesphere-' + Date.now(),
    data: payload.data || { url: '/' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    actions: payload.actions || [{ action: 'open', title: 'Open Ekklesphere' }],
  };

  event.waitUntil(self.registration.showNotification(payload.title, notificationOptions));
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
