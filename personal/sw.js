/* NT账本 · Service Worker
   策略：**缓存优先**（用本地版本启动，快且离线可用）。
   想换新版时，去「校验」页点「检查更新」，由页面发 SKIP_WAITING 让新 SW 接管。 */
const CACHE = 'mw-personal-v12.38';
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' 强制回源，绕开 GitHub Pages 的 max-age=600
      // 关键：**只缓存 2xx 响应**。早期版本直接用 c.add()，一旦某次回源拿到 404，
      // 那个 404 就会被永久缓存下来 —— 之后每次打开页面都是 404，只能手动清缓存。
      .then(c => Promise.allSettled(ASSETS.map(a =>
        fetch(new Request(a, { cache: 'reload' }))
          .then(res => (res && res.ok) ? c.put(a, res.clone()) : null)
          .catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);
  // 感谢墙与赞助码要能随时更新：直接放行给浏览器，不经过 SW 缓存
  if (url.pathname.endsWith('/thanks.json') || url.pathname.endsWith('/thanks-qr.png')) return;
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/')
    || url.pathname.endsWith('/index.html');

  if (isPage) {
    // 页面：用缓存秒开，同时后台静默更新缓存（stale-while-revalidate）
    e.respondWith(
      caches.match('./index.html').then(hit => {
        // 缓存里如果是坏的（非 200），丢掉，直接走网络
        if (hit && hit.status !== 200) hit = null;
        const net = fetch(new Request(req.url, { cache: 'no-store' }))
          .then(res => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => null);
        if (hit) return hit;              // 秒开
        return net.then(r => r || new Response('离线且没有可用缓存', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        }));
      })
    );
    return;
  }

  // 其它静态资源：本地优先
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit && hit.status === 200) return hit;
      return fetch(req, { cache: 'no-store' }).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html').then(fb => fb && fb.status === 200 ? fb : null));
    })
  );
});

// 页面点「检查更新」时会发这条消息，让新 SW 立刻接管
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
