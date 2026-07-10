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

// autoUpdate: take over as soon as a new deploy installs, so visitors aren't
// left on a stale cached shell; clients.claim() below then controls open tabs.
self.addEventListener('install', () => {
  self.skipWaiting();
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
  // event.data.json() THROWS on a non-JSON payload — `??` only covers a null
  // data, so a malformed push crashed the handler before showNotification and
  // Chrome then showed the generic "site updated in the background" notice
  // (repeats can get the subscription throttled). Parse defensively.
  let data: { title?: string; body?: string; tag?: string; url?: string };
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = {};
  }

  const options: NotificationOptions & { vibrate?: number[] } = {
    body: data.body || 'You have a new notification',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'vano-notification',
    // Default to the site root, NOT '/jobs' — that legacy route was deleted
    // and 404s, so a payload without a url used to land the tap on a dead page.
    data: { url: data.url || '/' },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'VANO', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/';
  // Prevent open redirect. The previous `rawUrl.startsWith('/')` check
  // accepted protocol-relative URLs ("//evil.com/phish") because they
  // also start with '/'. Combined with the fact that any user can
  // currently push-notify any other (notify-new-message accepts a
  // free-text body), this was a one-tap phishing vector. Canonicalise
  // through `new URL(...).pathname + .search` so only the path part
  // of the user-supplied URL survives — same-origin, no scheme/host
  // smuggling possible.
  let url = '/';
  try {
    const parsed = new URL(rawUrl, self.location.origin);
    if (parsed.origin === self.location.origin) {
      url = parsed.pathname + parsed.search;
    }
  } catch {
    /* malformed URL — fall back to '/' */
  }
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available. navigate() REJECTS for a client
      // the SW doesn't control yet (first visit since install, no reload), and
      // the unhandled rejection left the tab on the old page — await it and
      // fall back to opening a fresh window so the tap always lands on `url`.
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.navigate(url).then((c) => (c ?? client).focus()).catch(() => self.clients.openWindow(url));
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});
