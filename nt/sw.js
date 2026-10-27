/* NT账本 · 多文件版 Service Worker
 * 公约 4.4：CACHE_NAME 必须随静态资源更新自增
 *
 * ============================================================
 * 策略：stale-while-revalidate（离线优先）
 * ============================================================
 *   · 命中缓存   → 立刻返回（断网也秒开），同时后台拿新的写回缓存
 *   · 没命中缓存 → 走网络，成功后写入缓存
 *   · 离线且没缓存 → 报错
 *
 * 之前是 network-first，问题在离线场景：每个请求都要等网络超时才回落缓存，
 * 130 多个模块叠起来就是一片白屏。而且 ASSETS 只预缓存了 7 个文件，
 * 其余模块断网时压根没有缓存可用。
 *
 * 更新路径（两条，都不依赖自动检测）：
 *   ① CACHE_NAME 变化 → 新 SW 在 install 阶段重新预缓存全部资源
 *   ② 页面「重载」按钮 → 等新 SW 装完 + SKIP_WAITING + 刷新（SW 换班，不注销）
 *
 * 注意：「清所有缓存 + 注销 SW」只在「已经打不开、必须重来」时用（连点 5 次版本号），
 * 它不是常规更新路径 —— 注销之后断网就是浏览器原生「打不开网页」。
 *
 * ASSETS 必须**完整**：漏掉的文件在离线时会直接加载失败。
 * 新增文件记得加进来（tools 里有生成脚本）。
 * ============================================================
 */
const CACHE_NAME = 'nt-v1.01';

const ASSETS = [
  './index.html',
  './text.html',
  './manifest.json',
  './templates/templates.html',
  './css/base.css',
  './css/debug.css',
  './css/flow.css',
  './css/range.css',
  './css/gate.css',
  './css/import.css',
  './css/layout.css',
  './css/modal.css',
  './css/path.css',
  './css/plan.css',
  './css/query.css',
  './css/settings.css',
  './css/shell.css',
  './css/suggest.css',
  './css/text-editor.css',
  './css/theme.css',
  './css/validate.css',
  './js/app.js',
  './js/browser/db.js',
  './js/browser/idb.js',
  './js/core/account-config.js',
  './js/core/account-index.js',
  './js/core/account-resolver.js',
  './js/core/auth-manager.js',
  './js/core/balance-calculator.js',
  './js/core/color.js',
  './js/core/crypto-engine.js',
  './js/core/flow-text.js',
  './js/core/format.js',
  './js/core/import-apply.js',
  './js/core/import-parser.js',
  './js/core/installment-engine.js',
  './js/core/ledger-file.js',
  './js/core/ledger-stats.js',
  './js/core/lz-file.js',
  './js/core/ledgers.js',
  './js/core/meta.js',
  './js/core/migrate.js',
  './js/core/opening-migrator.js',
  './js/core/qr-encode.js',
  './js/core/qr-matrix.js',
  './js/core/qr-rs.js',
  './js/core/query-engine.js',
  './js/core/scheduler-engine.js',
  './js/core/schema.js',
  './js/core/settings.js',
  './js/core/state-store.js',
  './js/core/stats.js',
  './js/core/sync-code.js',
  './js/core/sync-merge.js',
  './js/core/table-cols.js',
  './js/core/validate.js',
  './js/core/validator.js',
  './js/core/version.js',
  './js/graph/mw-data-fetcher.js',
  './js/graph/mw-path-calculator.js',
  './js/graph/mw-slot-calculator.js',
  './js/graph/path-tracer.js',
  './js/platform/device-profile.js',
  './js/text-app.js',
  './js/timeline/time-state.js',
  './js/ui/account-actions.js',
  './js/ui/account-config.js',
  './js/ui/account-dialog.js',
  './js/ui/account-table.js',
  './js/ui/add-dialog.js',
  './js/ui/apply-settings.js',
  './js/ui/checks-view.js',
  './js/ui/color-picker.js',
  './js/ui/debug-panel.js',
  './js/ui/debug-pip.js',
  './js/ui/debug-themes.js',
  './js/ui/file-io.js',
  './js/ui/fixed-table.js',
  './js/ui/flow-model.js',
  './js/ui/gate.js',
  './js/ui/inst-table.js',
  './js/ui/layout-text.js',
  './js/ui/modal.js',
  './js/ui/mw-svg-renderer.js',
  './js/ui/path-flow-table.js',
  './js/ui/path-view.js',
  './js/ui/pwa.js',
  './js/ui/qr-canvas.js',
  './js/ui/render-transactions.js',
  './js/ui/row-editor.js',
  './js/ui/share-block.js',
  './js/ui/suggest-popover.js',
  './js/ui/sync-dialog.js',
  './js/ui/table-layout.js',
  './js/ui/export-dialog.js',
  './js/ui/xlsx-write.js',
  './js/core/xlsx-write.js',
  './js/core/xlsx-template.js',
  './js/core/xlsx-template-read.js',
  './js/core/export-text.js',
  './js/ui/chart-gestures.js',
  './js/ui/import-dialog.js',
  './js/ui/import-map.js',
  './js/ui/xlsx-read.js',
  './js/core/import-table.js',
  './js/core/bill-parse.js',
  './js/core/csv.js',
  './js/core/date-query.js',
  './js/core/xlsx-xml.js',
  './js/ui/range-bar.js',
  './js/ui/cell-range.js',
  './js/ui/col-save.js',
  './js/ui/undo-bar.js',
  './js/ui/table.js',
  './js/ui/tabs.js',
  './js/ui/theme-manager.js',
  './js/ui/update-check.js',
  './js/views/flow.js',
  './js/views/path.js',
  './js/views/plan.js',
  './js/views/query.js',
  './js/views/settings.js',
  './js/views/stats.js',
  './js/views/validate.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      // 单个文件失败不该让整个安装失败（否则永远装不上）
      // ⚠️ 必须带 cache:'reload' —— c.add(url) 默认会走浏览器 HTTP 缓存。
      // GitHub Pages 的静态资源是 max-age=600，于是新 SW 预缓存时
      // 装进去的其实是**旧文件**，看起来就是「点了更新、版本号永远不动」。
      .then((c) => Promise.all(
        ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)),
      ))
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

  let sameOrigin = false;
  try {
    sameOrigin = new URL(e.request.url).origin === self.location.origin;
  } catch (err) {
    return;
  }
  if (!sameOrigin) return;

  e.respondWith((async () => {
    const cached = await caches.match(e.request);

    if (cached) {
      // 后台更新缓存，不阻塞返回 —— 下一次打开就是新版
      // 同样要 cache:'reload'，否则后台拿回来的还是 HTTP 缓存里的旧文件
      fetch(e.request, { cache: 'reload' })
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
          }
        })
        .catch(() => {});
      return cached;
    }

    try {
      const res = await fetch(e.request, { cache: 'reload' });
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
