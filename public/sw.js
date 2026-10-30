// public/sw.js - Ekklesphere Progressive Web App & Push Notification Service Worker
const CACHE_NAME = 'ekklesphere-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.json'
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
      })
    ])
  );
});

// Handle incoming Web Push notifications from server
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Ekklesphere Church Alert',
    body: 'You have a new update from church.',
    icon: '/icon.svg',
    badge: '/icon.svg',
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
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/icon.svg',
    tag: payload.tag || 'ekklesphere-' + Date.now(),
    data: payload.data || { url: '/' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    actions: payload.actions || [
      { action: 'open', title: 'Open Ekklesphere' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
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
