/* 零日值班 · 网页版 Service Worker
   目标：装到主屏后离线也能玩；静态资源走「缓存优先 + 后台更新」。 */
'use strict';

const VERSION = 'zdd-v1.5.0-1';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(request, { ignoreSearch: true });

      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
          return response;
        })
        .catch(() => null);

      if (cached) {
        /* 有缓存先用，网络结果顺手更新 */
        event.waitUntil(network.then(() => {}).catch(() => {}));
        return cached;
      }

      const response = await network;
      if (response) return response;

      if (request.mode === 'navigate') {
        const fallback = await cache.match('./index.html', { ignoreSearch: true });
        if (fallback) return fallback;
      }
      return new Response('离线状态下没有这个资源', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    })(),
  );
});
