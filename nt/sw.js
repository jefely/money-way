/* NT账本 · 多文件版 Service Worker
 * 公约 4.4：CACHE_NAME 必须随静态资源更新自增（nt-v0.05 → nt-v0.06 …）
 *
 * 缓存策略：**network-first**。
 * 之前是 cache-first，问题很硬：只预缓存少数文件、其余按需缓存，
 * 一旦缓存过就永远命中旧版 —— 改了 js/views/*.js、js/ui/*.js 用户完全收不到更新，
 * 表现是「版本号显示是新的，界面还是旧的」。
 *
 * 现在：在线时总是取最新并顺手写缓存；只有离线（fetch 失败）才回退缓存。
 * 代价是每次多一次网络往返，换来「改了就生效」。
 */
const CACHE_NAME = 'nt-v0.12';

const ASSETS = [
  './index.html',
  './text.html',
  './path.html',
  './manifest.json',
  './css/theme.css',
  './css/base.css',
  './css/layout.css',
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

/* 页面可以主动要求换班：postMessage({type:'SKIP_WAITING'}) */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // 同源才管；跨源请求直接放行
  let sameOrigin = false;
  try {
    sameOrigin = new URL(e.request.url).origin === self.location.origin;
  } catch (err) {
    return;
  }
  if (!sameOrigin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // 拿到新的就顺手更新缓存（写失败不影响返回）
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || Response.error())),
  );
});
