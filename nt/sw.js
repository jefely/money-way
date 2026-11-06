/* NT账本 · 多文件版 Service Worker
 * 公约 4.4：CACHE_NAME 必须随静态资源更新自动变
 *
 * ============================================================
 * 策略：stale-while-revalidate（离线优先）
 * ============================================================
 *   · 命中缓存   → 立刻返回（断网也秒开），同时后台拿新的写回缓存。
 *   · 没命中缓存 → 走网络，成功后写入缓存。
 *   · 离线且没缓存 → 报错
 *
 * 之前是 network-first，问题在离线场景：每个请求都要等网络超时才回落缓存，
 * 130 多个模块叠起来就是一片白屏。而且 ASSETS 只预缓存了 7 个文件，
 * 其余模块断网时压根没有缓存可用。
 *
 * 更新路径（两条，都不依赖自动检测）：
 *   ① CACHE_NAME 变化 → 新 SW 的 install 阶段重新预缓存全部资源
 *   ② 页面「重载」按钮 → 等新 SW 装完 + SKIP_WAITING + 刷新（SW 换班，不注销）
 *
 * 注意：「清所有缓存 + 注销 SW」只在「已经打不开、必须重来」时用（连点 5 次版本号），
 * 它不是常规更新路径 —— 注销之后断网就是浏览器原生「打不开网页」。
 *
 * ASSETS 必须**完整**：漏掉的文件在离线时会直接加载失败。
 * 新增文件记得加进来（tools 里有生成脚本）。
 * ============================================================
 */
const CACHE_NAME = 'nt-v1.341';

const ASSETS = [
  './css/base.css',
  './css/debug.css',
  './css/flow.css',
  './css/gate.css',
  './css/import.css',
  './css/layout.css',
  './css/modal.css',
  './css/path.css',
  './css/plan.css',
  './css/query.css',
  './css/range.css',
  './css/settings.css',
  './css/shell.css',
  './css/stats.css',
  './css/suggest.css',
  './css/text-editor.css',
  './css/thanks.css',
  './css/theme.css',
  './css/validate.css',
  './index.html',
  './js/app.js',
  './js/browser/db.js',
  './js/browser/idb.js',
  './js/core/account-config.js',
  './js/core/account-index.js',
  './js/core/account-match.js',
  './js/core/account-order.js',
  './js/core/account-resolver.js',
  './js/core/auth-manager.js',
  './js/core/backup-file.js',
  './js/core/backup-reminder.js',
  './js/core/balance-calculator.js',
  './js/core/bill-parse.js',
  './js/core/calc-engine.js',
  './js/core/category-query.js',
  './js/core/color.js',
  './js/core/crypto-engine.js',
  './js/core/csv.js',
  './js/core/date-query.js',
  './js/core/draft-book.js',
  './js/core/event-engine.js',
  './js/core/export-text.js',
  './js/core/flow-text.js',
  './js/core/format.js',
  './js/core/import-apply.js',
  './js/core/import-dedupe.js',
  './js/core/import-parser.js',
  './js/core/import-table.js',
  './js/core/installment-cells.js',
  './js/core/installment-engine.js',
  './js/core/ledger-file.js',
  './js/core/ledger-stats.js',
  './js/core/ledgers.js',
  './js/core/lexicon.js',
  './js/core/lz-file.js',
  './js/core/meta.js',
  './js/core/migrate.js',
  './js/core/mw-settings.js',
  './js/core/opening-migrator.js',
  './js/core/opening-tx.js',
  './js/core/phrase-entry.js',
  './js/core/phrase-parser.js',
  './js/core/pinyin.js',
  './js/core/plan-occurrence.js',
  './js/core/qr-encode.js',
  './js/core/qr-matrix.js',
  './js/core/qr-rs.js',
  './js/core/query-engine.js',
  './js/core/reset-book.js',
  './js/core/scheduler-engine.js',
  './js/core/schema.js',
  './js/core/settings-schema.js',
  './js/core/settings.js',
  './js/core/state-store.js',
  './js/core/stats.js',
  './js/core/stats-panels.js',
  './js/core/sync-code.js',
  './js/core/sync-merge.js',
  './js/core/sync-window.js',
  './js/core/table-cols.js',
  './js/core/undo-stack.js',
  './js/core/validate.js',
  './js/core/validator.js',
  './js/core/vault-cas.js',
  './js/core/vault-rekey.js',
  './js/core/version.js',
  './js/core/xlsx-template-read.js',
  './js/core/xlsx-template.js',
  './js/core/xlsx-write.js',
  './js/core/xlsx-xml.js',
  './js/graph/mw-chord-shape.js',
  './js/graph/mw-data-fetcher.js',
  './js/graph/mw-depth.js',
  './js/graph/mw-layers.js',
  './js/graph/mw-path-calculator.js',
  './js/graph/mw-slot-calculator.js',
  './js/graph/path-tracer.js',
  './js/platform/device-profile.js',
  './js/text-app.js',
  './js/timeline/time-state.js',
  './js/ui/account-actions.js',
  './js/ui/account-config.js',
  './js/ui/account-dialog.js',
  './js/ui/account-new.js',
  './js/ui/account-table.js',
  './js/ui/add-dialog.js',
  './js/ui/apply-settings.js',
  './js/ui/backup-guard.js',
  './js/ui/cat-suggest.js',
  './js/ui/cell-range.js',
  './js/ui/chart-gestures.js',
  './js/ui/chart-tip.js',
  './js/ui/checks-view.js',
  './js/ui/col-save.js',
  './js/ui/col-widths.js',
  './js/ui/color-picker.js',
  './js/ui/composer.js',
  './js/ui/datalists.js',
  './js/ui/debug-panel.js',
  './js/ui/debug-pip.js',
  './js/ui/debug-themes.js',
  './js/ui/export-dialog.js',
  './js/ui/file-io.js',
  './js/ui/fixed-table.js',
  './js/ui/flow-ends.js',
  './js/ui/flow-model.js',
  './js/ui/flow-shell.js',
  './js/ui/fly-in.js',
  './js/ui/gate.js',
  './js/ui/global-undo.js',
  './js/ui/import-dialog.js',
  './js/ui/import-hub.js',
  './js/ui/import-map.js',
  './js/ui/inst-add.js',
  './js/ui/inst-blanks.js',
  './js/ui/inst-layout.js',
  './js/ui/inst-range.js',
  './js/ui/inst-table.js',
  './js/ui/layout-text.js',
  './js/ui/modal.js',
  './js/ui/mw-params.js',
  './js/ui/mw-svg-renderer.js',
  './js/ui/note-popover.js',
  './js/ui/note-table.js',
  './js/ui/path-debug.js',
  './js/ui/path-filter.js',
  './js/ui/path-flow-table.js',
  './js/ui/path-legend.js',
  './js/ui/path-view.js',
  './js/ui/plan-links.js',
  './js/ui/plan-rows.js',
  './js/ui/pwa.js',
  './js/ui/qr-canvas.js',
  './js/ui/range-bar.js',
  './js/ui/render-transactions.js',
  './js/ui/reset-dialog.js',
  './js/ui/review-tip.js',
  './js/ui/row-editor.js',
  './js/ui/share-block.js',
  './js/ui/share-file.js',
  './js/ui/stats-category.js',
  './js/ui/stats-group-tables.js',
  './js/ui/stats-split.js',
  './js/ui/suggest-popover.js',
  './js/ui/sync-dialog.js',
  './js/ui/sync-wheel.js',
  './js/ui/tab-guard.js',
  './js/ui/table-layout.js',
  './js/ui/table-parts.js',
  './js/ui/table.js',
  './js/ui/tabs.js',
  './js/ui/thanks-wall.js',
  './js/ui/theme-manager.js',
  './js/ui/type-picker.js',
  './js/ui/undo-bar.js',
  './js/ui/update-check.js',
  './js/ui/xlsx-read.js',
  './js/ui/xlsx-write.js',
  './js/views/flow.js',
  './js/views/path.js',
  './js/views/plan.js',
  './js/views/query.js',
  './js/views/settings.js',
  './js/views/stats.js',
  './js/views/validate.js',
  './manifest.json',
  './templates/templates.html',
  './text.html',
  './thanks-admin.html',
  './thanks.enc.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      // 单个文件失败不该让整个安装失败（否则永远装不上）
      // ⚠️ 必须带 cache:'reload' —— c.add(url) 默认会走浏览器的 HTTP 缓存，
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

/* 代码和样式走 **network-first**，其余走 stale-while-revalidate。
 *
 * 为什么必须分开（2026-11 用户反复踩）：
 *   stale-while-revalidate 命中缓存就**立刻返回旧文件**，后台再去更新。
 *   对图片这类「慢一点无所谓」的资源很好，但对 css/js 是灾难 ——
 *   改完样式后用户打开看到的永远是上一版，得手动开两次、或者点「更新」。
 *   用户报的「备注列怎么都不拉伸」就是这么来的：服务端已经是新 CSS，
 *   浏览器一直在跑旧的那份。
 *
 * network-first 的代价只有一次网络往返：`fetch` 默认走 HTTP 缓存
 * （GitHub Pages 是 max-age=600），命中时几乎零成本；断网时 fetch 会快速失败，
 * 落到下面的 cache 分支，离线能力照样在。
 * 注意这里**不能**用 `cache: 'reload'` —— 那会绕过 HTTP 缓存，
 * 130 多个模块每个都重新下载，首屏会明显变慢。
 */
const NETWORK_FIRST = /\.(?:js|css)(?:\?|$)/;

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
    const path = new URL(e.request.url).pathname;
    const cached = await caches.match(e.request);

    if (NETWORK_FIRST.test(path) || path.endsWith('/') || path.endsWith('.html')) {
      try {
        // 默认 cache 模式：走 HTTP 缓存，不额外压网络
        const res = await fetch(e.request);
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      } catch (err) {
        return cached || Response.error();
      }
    }

    if (cached) {
      // 后台更新缓存，不阻塞返回 —— 下一次打开就是新版
      // 同样带 cache:'reload'，否则后台拿回来的还是 HTTP 缓存里的旧文件
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

