/* NT璐︽湰 路 澶氭枃浠剁増 Service Worker
 * 鍏害 4.4锛欳ACHE_NAME 蹇呴』闅忛潤鎬佽祫婧愭洿鏂拌嚜鍔ㄥ彉
 *
 * ============================================================
 * 绛栫暐锛歴tale-while-revalidate锛堢绾夸紭鍏堬級
 * ============================================================
 *   路 鍛戒腑缂撳瓨   鈫?绔嬪埢杩斿洖锛堟柇缃戜篃绉掑紑锛夛紝鍚屾椂鍚庡彴鎷挎柊鐨勫啓鍥炵紦瀛樸€?
 *   路 娌″懡涓紦瀛?鈫?璧扮綉缁滐紝鎴愬姛鍚庡啓鍏ョ紦瀛樸€?
 *   路 绂荤嚎涓旀病缂撳瓨 鈫?鎶ラ敊
 *
 * 涔嬪墠鏄?network-first锛岄棶棰樺湪绂荤嚎鍦烘櫙锛氭瘡涓姹傞兘瑕佺瓑缃戠粶瓒呮椂鎵嶅洖钀界紦瀛橈紝
 * 130 澶氫釜妯″潡鍙犺捣鏉ュ氨鏄竴鐗囩櫧灞忋€傝€屼笖 ASSETS 鍙缂撳瓨浜?7 涓枃浠讹紝
 * 鍏朵綑妯″潡鏂綉鏃跺帇鏍规病鏈夌紦瀛樺彲鐢ㄣ€?
 *
 * 鏇存柊璺緞锛堜袱鏉★紝閮戒笉渚濊禆鑷姩妫€娴嬶級锛?
 *   鈶?CACHE_NAME 鍙樺寲 鈫?鏂?SW 鐨?install 闃舵閲嶆柊棰勭紦瀛樺叏閮ㄨ祫婧?
 *   鈶?椤甸潰銆岄噸杞姐€嶆寜閽?鈫?绛夋柊 SW 瑁呭畬 + SKIP_WAITING + 鍒锋柊锛圫W 鎹㈢彮锛屼笉娉ㄩ攢锛?
 *
 * 娉ㄦ剰锛氥€屾竻鎵€鏈夌紦瀛?+ 娉ㄩ攢 SW銆嶅彧鍦ㄣ€屽凡缁忔墦涓嶅紑銆佸繀椤婚噸鏉ャ€嶆椂鐢紙杩炵偣 5 娆＄増鏈彿锛夛紝
 * 瀹冧笉鏄父瑙勬洿鏂拌矾寰?鈥斺€?娉ㄩ攢涔嬪悗鏂綉灏辨槸娴忚鍣ㄥ師鐢熴€屾墦涓嶅紑缃戦〉銆嶃€?
 *
 * ASSETS 蹇呴』**瀹屾暣**锛氭紡鎺夌殑鏂囦欢鍦ㄧ绾挎椂浼氱洿鎺ュ姞杞藉け璐ャ€?
 * 鏂板鏂囦欢璁板緱鍔犺繘鏉ワ紙tools 閲屾湁鐢熸垚鑴氭湰锛夈€?
 * ============================================================
 */
const CACHE_NAME = 'nt-v1.513';

const ASSETS = [
  './css/base.css',
  './css/debug.css',
  './css/flow.css',
  './css/gate.css',
  './css/import.css',
  './css/layout.css',
  './css/lifevein.css',
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
  './js/browser/thanks-sign.js',
  './js/app.js',
  './js/browser/db.js',
  './js/browser/alias-store.js',
  './js/browser/idb.js',
  './js/core/account-config.js',
  './js/core/account-index.js',
  './js/core/account-match.js',
  './js/core/account-merge.js',
  './js/core/account-order.js',
  './js/core/account-resolver.js',
  './js/core/alias-table.js',
  './js/core/auth-manager.js',
  './js/core/backup-file.js',
  './js/core/backup-reminder.js',
  './js/core/balance-calculator.js',
  './js/core/bill-apply.js',
  './js/core/bill-match.js',
  './js/core/bill-parse.js',
  './js/core/bill-plan.js',
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
  './js/core/keyword-dict.js',
  './js/core/keyword-engine.js',
  './js/core/ledger-adapter.js',
  './js/core/ledger-file.js',
  './js/core/ledger-stats.js',
  './js/core/ledgers.js',
  './js/core/lexicon.js',
  './js/core/lifevein-model.js',
  './js/core/lz-file.js',
  './js/core/meta.js',
  './js/core/migrate.js',
  './js/core/mw-settings.js',
  './js/core/note-stats.js',
  './js/core/node-relations.js',
  './js/core/opening-migrator.js',
  './js/core/opening-tx.js',
  './js/core/phrase-entry.js',
  './js/core/phrase-parser.js',
  './js/core/phrase-slots.js',
  './js/core/pinyin.js',
  './js/core/plan-occurrence.js',
  './js/core/qr-baked.js',
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
  './js/core/table-fit.js',
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
  './js/ui/alias-batch.js',
  './js/ui/apply-settings.js', './js/ui/batch-render.js',
  './js/ui/backup-guard.js',
  './js/ui/cat-suggest.js',
  './js/ui/cell-caret.js',
  './js/ui/cell-clip.js',
  './js/ui/cell-edit.js',
  './js/ui/cell-geom.js',
  './js/ui/cell-menu.js', './js/ui/cell-nav.js',
  './js/ui/cell-proxy.js',
  './js/ui/cell-range.js',
  './js/ui/cell-select.js',
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
  './js/ui/excel-grid.js',
  './js/ui/file-io.js',
  './js/ui/fixed-table.js',
  './js/ui/flow-ends.js',
  './js/ui/flow-model.js',
  './js/ui/flow-shell.js',
  './js/ui/fly-in.js',
  './js/ui/gate.js',
  './js/ui/global-undo.js',
  './js/ui/import-backup.js',
  './js/ui/import-bill.js',
  './js/ui/import-dialog.js',
  './js/ui/import-hub.js',
  './js/ui/import-map.js',
  './js/ui/import-source.js',
  './js/ui/inst-add.js',
  './js/ui/inst-blanks.js',
  './js/ui/inst-layout.js',
  './js/ui/inst-range.js',
  './js/ui/inst-table.js',
  './js/ui/layout-text.js', './js/ui/leave-hooks.js',
  './js/ui/locate-tx.js',
  './js/ui/modal.js',
  './js/ui/mw-params.js',
  './js/ui/mw-svg-renderer.js',
  './js/ui/note-popover.js',
  './js/ui/note-stats.js',
  './js/ui/note-table.js', './js/ui/open-drafts.js', './js/ui/open-rows.js',
  './js/ui/node-relations.js',
  './js/ui/path-debug.js',
  './js/ui/path-filter.js',
  './js/ui/path-flow-table.js',
  './js/ui/path-legend.js',
  './js/ui/path-view.js',
  './js/ui/phrase-preview.js',
  './js/ui/plan-links.js',
  './js/ui/plan-rows.js',
  './js/ui/pwa.js',
  './js/ui/qr-canvas.js',
  './js/ui/range-bar.js',
  './js/ui/render-transactions.js',
  './js/ui/reset-actions.js',
  './js/ui/reset-dialog.js',
  './js/ui/review-tip.js',
  './js/ui/row-editor.js',
  './js/ui/share-block.js',
  './js/ui/share-file.js',
  './js/ui/stat-fit.js',
  './js/ui/stat-order.js',
  './js/ui/stat-resize.js',
  './js/ui/stats-category.js',
  './js/ui/stats-group-tables.js', './js/ui/stats-notes.js',
  './js/ui/stats-split.js',
  './js/ui/stats-swipe.js',
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
  './js/ui/width-fit.js',
  './js/ui/xlsx-read.js',
  './js/ui/xlsx-write.js',
  './js/views/flow.js',
  './js/views/lifevein.js',
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
      // 鍗曚釜鏂囦欢澶辫触涓嶈璁╂暣涓畨瑁呭け璐ワ紙鍚﹀垯姘歌繙瑁呬笉涓婏級
      // 鈿狅笍 蹇呴』甯?cache:'reload' 鈥斺€?c.add(url) 榛樿浼氳蛋娴忚鍣ㄧ殑 HTTP 缂撳瓨锛?
      // GitHub Pages 鐨勯潤鎬佽祫婧愭槸 max-age=600锛屼簬鏄柊 SW 棰勭紦瀛樻椂
      // 瑁呰繘鍘荤殑鍏跺疄鏄?*鏃ф枃浠?*锛岀湅璧锋潵灏辨槸銆岀偣浜嗘洿鏂般€佺増鏈彿姘歌繙涓嶅姩銆嶃€?
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

/* 椤甸潰鍙互涓诲姩瑕佹眰鎹㈢彮锛歱ostMessage({type:'SKIP_WAITING'}) */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* 浠ｇ爜鍜屾牱寮忚蛋 **network-first**锛屽叾浣欒蛋 stale-while-revalidate銆?
 *
 * 涓轰粈涔堝繀椤诲垎寮€锛?026-11 鐢ㄦ埛鍙嶅韪╋級锛?
 *   stale-while-revalidate 鍛戒腑缂撳瓨灏?*绔嬪埢杩斿洖鏃ф枃浠?*锛屽悗鍙板啀鍘绘洿鏂般€?
 *   瀵瑰浘鐗囪繖绫汇€屾參涓€鐐规棤鎵€璋撱€嶇殑璧勬簮寰堝ソ锛屼絾瀵?css/js 鏄伨闅?鈥斺€?
 *   鏀瑰畬鏍峰紡鍚庣敤鎴锋墦寮€鐪嬪埌鐨勬案杩滄槸涓婁竴鐗堬紝寰楁墜鍔ㄥ紑涓ゆ銆佹垨鑰呯偣銆屾洿鏂般€嶃€?
 *   鐢ㄦ埛鎶ョ殑銆屽娉ㄥ垪鎬庝箞閮戒笉鎷変几銆嶅氨鏄繖涔堟潵鐨勶細鏈嶅姟绔凡缁忔槸鏂?CSS锛?
 *   娴忚鍣ㄤ竴鐩村湪璺戞棫鐨勯偅浠姐€?
 *
 * network-first 鐨勪唬浠峰彧鏈変竴娆＄綉缁滃線杩旓細`fetch` 榛樿璧?HTTP 缂撳瓨
 * 锛圙itHub Pages 鏄?max-age=600锛夛紝鍛戒腑鏃跺嚑涔庨浂鎴愭湰锛涙柇缃戞椂 fetch 浼氬揩閫熷け璐ワ紝
 * 钀藉埌涓嬮潰鐨?cache 鍒嗘敮锛岀绾胯兘鍔涚収鏍峰湪銆?
 * 娉ㄦ剰杩欓噷**涓嶈兘**鐢?`cache: 'reload'` 鈥斺€?閭ｄ細缁曡繃 HTTP 缂撳瓨锛?
 * 130 澶氫釜妯″潡姣忎釜閮介噸鏂颁笅杞斤紝棣栧睆浼氭槑鏄惧彉鎱€?
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
        // 榛樿 cache 妯″紡锛氳蛋 HTTP 缂撳瓨锛屼笉棰濆鍘嬬綉缁?
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
      // 鍚庡彴鏇存柊缂撳瓨锛屼笉闃诲杩斿洖 鈥斺€?涓嬩竴娆℃墦寮€灏辨槸鏂扮増
      // 鍚屾牱甯?cache:'reload'锛屽惁鍒欏悗鍙版嬁鍥炴潵鐨勮繕鏄?HTTP 缂撳瓨閲岀殑鏃ф枃浠?
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

