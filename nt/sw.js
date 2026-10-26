/* NT账本 · 多文件版 Service Worker
 * 公约 4.4：CACHE_NAME 必须随静态资源更新自增（nt-v0.01 → nt-v0.02 …）
 */
const CACHE_NAME = 'nt-v0.01';

const ASSETS = [
  './',
  './index.html',
  './css/base.css',
  './css/layout.css',
  './css/flow.css',
  './js/app.js',
  './js/core/state.js',
  './js/core/stats.js',
  './js/core/validate.js',
  './js/core/migrate.js',
  './js/core/format.js',
  './js/ui/flow-model.js',
  './js/ui/flow-view.js',
  './js/browser/store.js',
  './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => hit)),
  );
});
