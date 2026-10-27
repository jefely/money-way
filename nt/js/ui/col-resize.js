// 界面：表格列宽拖动手柄
/**
 * 列宽拖动（UI 层）
 *
 * 约定：每个 `<th>` 带 `data-col="xxx"`，拖它就改那一列。
 * 宽度写在两层：
 *   ① scope 上的 CSS 变量 `--nt-col-<key>`（colgroup 规则读它）
 *   ② `<col>` 的 width（table-layout:fixed 真正认的是它）
 * 表格自身宽度 = 所有列宽之和，否则 fixed 布局会把列按比例拉回去。
 *
 * 与旧实现的区别：
 *   · 用 data-col 而不是按索引猜 COL_KEYS（旧版拖「转出账户」改的却是 type 列）
 *   · 手柄宽 7px、中线常显，手指也好按
 *   · 所有表通用，只要 th 上写了 data-col
 */

const MIN_W = 28;
const MAX_W = 600;

/**
 * @param {HTMLTableElement} tableEl
 * @param {{onResize?:(col:string, width:number)=>void}} [opts]
 */
export function mountColResize(tableEl, opts) {
  const o = opts || {};
  if (!tableEl || tableEl.dataset.colResize === '1') return;

  const ths = [...tableEl.querySelectorAll('thead .nt-th')].filter((th) => th.dataset.col);
  if (!ths.length) return;          // 没有 data-col 的表不动它

  tableEl.dataset.colResize = '1';
  const scope = tableEl.closest('[data-view]') || document.documentElement;

  for (const th of ths) {
    const col = th.dataset.col;

    // 视觉手柄：本身不接事件，真正的判断在 th 的 pointerdown 里
    const handle = document.createElement('span');
    handle.className = 'nt-col-handle';
    handle.setAttribute('aria-hidden', 'true');
    th.appendChild(handle);

    th.addEventListener('pointerdown', (ev) => {
      const rect = th.getBoundingClientRect();
      // 只有落在右边缘 7px 内才算拖列宽，否则正常点选
      if (ev.clientX < rect.right - 7) return;
      ev.preventDefault();
      ev.stopPropagation();

      const startX = ev.clientX;
      const startW = Math.round(rect.width);
      let width = startW;
      document.body.classList.add('nt-col-resizing');

      const onMove = (e) => {
        width = Math.max(MIN_W, Math.min(MAX_W, Math.round(startW + (e.clientX - startX))));
        applyWidth(tableEl, scope, col, width);
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.classList.remove('nt-col-resizing');
        if (o.onResize) o.onResize(col, width);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }
}

/** 把某一列的宽度同时写到 CSS 变量、<col> 和表格总宽上 */
export function applyWidth(tableEl, scope, col, width) {
  const px = width + 'px';
  scope.style.setProperty('--nt-col-' + col, px);

  const colEl = tableEl.querySelector('col.nt-c-' + col);
  if (colEl) {
    colEl.style.width = px;
    colEl.setAttribute('width', String(width));
  } else {
    // 没有 colgroup 的表：直接给这一列所有格子写宽度
    const idx = [...tableEl.querySelectorAll('thead .nt-th')].findIndex((x) => x.dataset.col === col);
    if (idx >= 0) {
      for (const tr of tableEl.querySelectorAll('tr')) {
        const cell = tr.children[idx];
        if (cell) cell.style.width = px;
      }
    }
  }

  // 表格总宽 = 各列之和
  let total = 0;
  for (const c of tableEl.querySelectorAll('colgroup col')) {
    total += parseFloat(c.style.width) || parseFloat(getComputedStyle(c).width) || 0;
  }
  if (total > 0) tableEl.style.width = total + 'px';
}

/** 给一张表补 colgroup（没有的话），列宽从 th 的 data-col 生成 */
export function ensureColgroup(tableEl) {
  if (tableEl.querySelector('colgroup')) return;
  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  if (!ths.length) return;
  const cg = document.createElement('colgroup');
  for (const th of ths) {
    const col = document.createElement('col');
    if (th.dataset.col) col.className = 'nt-c-' + th.dataset.col;
    cg.appendChild(col);
  }
  tableEl.insertBefore(cg, tableEl.firstChild);
}

/**
 * 给页面上所有数据区挂列宽手柄（渲染后调用一次即可）。
 * 表头是动态重建的（统计页每次 render 都换），mountColResize 自带 dataset 标记，
 * 重复调用不会重复绑事件。
 */
export function bindAllColResize(opts) {
  for (const table of document.querySelectorAll('table.nt-table')) {
    ensureColgroup(table);
    mountColResize(table, opts);
  }
}
