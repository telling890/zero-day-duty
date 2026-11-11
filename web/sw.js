/* 零日值班 · 网页版 Service Worker
   目标：装到主屏后离线也能玩；代码更新后不要被旧缓存困住。

   策略：
   - 页面、脚本、样式：网络优先（在线永远拿到最新版本），离线回退缓存
   - 图标、manifest：缓存优先，后台更新
   - 离线时导航回退到缓存的 index.html
*/
'use strict';

const VERSION = 'zdd-v1.5.0-2';
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

function isFreshFirst(request, url) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  if (request.destination === 'script' || request.destination === 'style') return true;
  return /\.(?:js|css|html)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);

      if (isFreshFirst(request, url)) {
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
          if (fresh) return fresh;
        } catch (error) {
          // 离线，落到缓存
        }
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const fallback = await cache.match('./index.html', { ignoreSearch: true });
          if (fallback) return fallback;
        }
        return new Response('离线状态下没有这个资源', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network.then(() => {}).catch(() => {}));
        return cached;
      }

      const response = await network;
      if (response) return response;
      return new Response('离线状态下没有这个资源', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    })(),
  );
});
