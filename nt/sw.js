/* NT账本 · 多文件版 Service Worker
 * 公约 4.4：CACHE_NAME 必须随静态资源更新自增（nt-v0.03 → nt-v0.04 …）
 *
 * 只预缓存「壳 + 入口 + 主题」，其余模块由 fetch 事件按需缓存。
 * 这样新增模块不用同步改这里，也不会因为漏列一个文件而让整个 install 失败。
 */
const CACHE_NAME = 'nt-v0.03.46';

const ASSETS = [
  './',
  './index.html',
  './text.html',
  './path.html',
  './manifest.json',
  './css/theme.css',
  './css/base.css',
  './css/layout.css',
  './css/flow.css',
  './css/shell.css',
  './js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
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

  // 同源才缓存；跨源请求直接放行
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  if (!sameOrigin) return;

  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => hit)),
  );
});
