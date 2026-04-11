/**
 * Service worker for vite-plugin-pwa (`injectManifest` in vite.config.ts).
 * This file must exist at src/sw.ts; the build injects the precache manifest here.
 *
 * v2.0 — bump precache + activate cleanup when forcing clients off an old shell.
 */
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Drop precache entries from previous deployments (different revision hashes)
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

/** Let the app prompt for refresh; workbox-window sends this when the user taps Update */
self.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key.startsWith('workbox-')) return Promise.resolve();
          if (key.startsWith('vite-pwa') || key === 'offline' || key.startsWith('vano-legacy')) {
            return caches.delete(key);
          }
          return Promise.resolve();
        }),
      );
      await self.clients.claim();
    })(),
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'VANO', body: 'You have a new notification' };
  
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: data.body || 'You have a new notification',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'vano-notification',
    data: { url: data.url || '/jobs' },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'VANO', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/';
  // Prevent open redirect — only allow relative paths
  const url = rawUrl.startsWith('/') ? rawUrl : '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});
