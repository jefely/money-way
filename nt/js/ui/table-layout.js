// 界面：表格布局（列宽 / 冻结列 / 拖动）
/**
 * 表格布局
 * 层：第五层 · UI
 *
 * ============================================================
 * 三条铁律（之前混着三处代码互相打架，全部推倒重来）
 * ============================================================
 *   ① 列宽的**唯一**来源是 `<col>` 的 style.width
 *      —— th / td 上不许写 width，CSS 里也不许有 .nt-c-* 的宽度规则
 *   ② 表宽 = 各列之和，每次同步都要重算
 *      —— 不设的话 table-layout:fixed 会把列按比例压回容器宽
 *   ③ 冻结列的 left 由 JS 按**实际宽度累加**算出
 *      —— 不能用 CSS 变量写死，前列一变宽就错位
 *
 * 本文件是这三件事的**唯一**执行者。
 * applySettings 只负责把参数写成 CSS 变量，不碰列宽、不碰表宽。
 */

/** 每张表冻结几列（键 = 表类名）。必须和 CSS 里的 sticky 声明一致。 */
const FROZEN_COUNT = {
  'nt-table-flow': 1,       // 序
  'nt-table-stats': 2,      // 序 + 第二列
  'nt-table-plan': 1,       // 序
  'nt-table-inst': 1,       // 账户名称
  'nt-table-accounts': 1,   // 简码
  'nt-table-query': 0,      // 不冻结
};

const DEFAULT_COL_W = 88;   // 拿不到任何宽度时的兜底
const MIN_W = 28;
const MAX_W = 600;

/* ============================================================
   一、列定义（colgroup）
   ============================================================ */

/**
 * 确保 colgroup 与表头列数一致，且每个 col 带 nt-c-<key> 类。
 * 列数变了（表结构改过）就重建 —— 数量不符会让多出来的列宽度归零。
 */
export function ensureCols(tableEl) {
  if (!tableEl) return false;
  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  if (!ths.length) return false;

  const existing = tableEl.querySelector('colgroup');
  if (existing && existing.children.length === ths.length) return false;
  if (existing) existing.remove();

  const cg = document.createElement('colgroup');
  for (const th of ths) {
    const col = document.createElement('col');
    const key = th.dataset.col;
    if (key) col.className = 'nt-c-' + key;
    cg.appendChild(col);
  }
  tableEl.insertBefore(cg, tableEl.firstChild);
  return true;
}

/* ============================================================
   二、同步：列宽 → 表宽 → 冻结 left
   ============================================================ */

/**
 * 把一张表同步到正确的布局状态。幂等，随时可调。
 *
 * 宽度优先级：col 上已有的 width > --nt-col-<key> 变量 > 表头当前实际宽度
 */
export function syncTable(tableEl) {
  if (!tableEl) return;
  ensureCols(tableEl);

  const root = document.documentElement;
  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  const cols = [...tableEl.querySelectorAll('colgroup col')];
  if (!cols.length) return;

  let total = 0;

  cols.forEach((col, i) => {
    let w = parseFloat(col.style.width);

    if (!Number.isFinite(w) || w <= 0) {
      // 第二优先：读参数变量（applySettings 写的）
      const key = (col.className || '').replace('nt-c-', '');
      const v = getComputedStyle(root).getPropertyValue('--nt-col-' + key).trim();
      const f = parseFloat(v);
      if (Number.isFinite(f) && f > 0) w = f;
    }

    if (!Number.isFinite(w) || w <= 0) {
      // 第三优先：表头当前实际宽度（首次渲染时用）
      const th = ths[i];
      if (th) {
        const rw = Math.round(th.getBoundingClientRect().width);
        if (rw > 0) w = rw;
      }
    }

    // 最后兜底：表还没布局（隐藏的视图）时上面三条都拿不到值。
    // 不给个默认宽度的话 col 永远是空，表宽会少算几列。
    if (!Number.isFinite(w) || w <= 0) w = DEFAULT_COL_W;

    if (Number.isFinite(w) && w > 0) {
      col.style.width = w + 'px';
      col.setAttribute('width', String(w));
      total += w;
    }
  });

  // ② 表宽 = 各列之和
  if (total > 0) tableEl.style.width = total + 'px';

  // ③ 冻结列的 left 按实际宽度累加
  syncFrozen(tableEl);
}

/** 给页面上所有数据区同步一遍 */
export function syncAllTables() {
  for (const table of document.querySelectorAll('table.nt-table')) syncTable(table);
}

/**
 * 冻结列定位：前 N 列的 left 按实际宽度累加写出来。
 * 表头和数据行必须写同一个 left，否则两者会错开。
 */
export function syncFrozen(tableEl) {
  const cls = [...tableEl.classList].find((c) => c in FROZEN_COUNT);
  if (!cls) return;
  const n = FROZEN_COUNT[cls];
  if (!n) return;

  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  const rows = [...tableEl.querySelectorAll('tbody tr')];

  let left = 0;
  for (let i = 0; i < Math.min(n, ths.length); i += 1) {
    const th = ths[i];
    const w = Math.round(th.getBoundingClientRect().width);

    th.style.left = left + 'px';
    for (const tr of rows) {
      const td = tr.children[i];
      if (td) td.style.left = left + 'px';
    }

    left += w;
  }
}

/** 把某一列的宽度写进 col，并重算表宽和冻结列 */
export function setColWidth(tableEl, key, width) {
  const col = tableEl.querySelector('col.nt-c-' + key);
  if (!col) return;
  const w = Math.max(MIN_W, Math.min(MAX_W, Math.round(width)));
  col.style.width = w + 'px';
  col.setAttribute('width', String(w));

  let total = 0;
  for (const c of tableEl.querySelectorAll('colgroup col')) {
    const v = parseFloat(c.style.width);
    if (Number.isFinite(v) && v > 0) total += v;
  }
  if (total > 0) tableEl.style.width = total + 'px';

  syncFrozen(tableEl);
  return w;
}

/* ============================================================
   三、拖动
   ============================================================ */

/**
 * 给一张表挂列宽拖动手柄。
 * 事件委托在 table 上只绑一次；手柄每次都补（表头是动态重建的）。
 */
export function mountResize(tableEl, opts) {
  const o = opts || {};
  if (!tableEl) return;

  paintHandles(tableEl);

  if (tableEl.dataset.resizeBound === '1') return;
  tableEl.dataset.resizeBound = '1';

  tableEl.addEventListener('pointerdown', (ev) => {
    const th = ev.target.closest('.nt-th');
    if (!th || !th.dataset.col) return;

    const rect = th.getBoundingClientRect();
    if (ev.clientX < rect.right - 7) return;   // 只在右边缘 7px 内才开始拖

    ev.preventDefault();
    ev.stopPropagation();

    const key = th.dataset.col;
    const startX = ev.clientX;
    const startW = Math.round(rect.width);
    let width = startW;

    // 拖动前把每一列的当前宽度固化到 col 上：
    // 否则只有目标列有宽度，其它列在总宽变化时会被重新分配（拖一列动一排）
    freezeFromActual(tableEl);

    document.body.classList.add('nt-col-resizing');

    const onMove = (e) => {
      width = startW + (e.clientX - startX);
      setColWidth(tableEl, key, width);
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.classList.remove('nt-col-resizing');
      if (o.onResize) o.onResize(key, Math.round(width));
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

/** 给每个带 data-col 的表头补一个拖动手柄 */
export function paintHandles(tableEl) {
  for (const th of tableEl.querySelectorAll('thead .nt-th[data-col]')) {
    if (th.querySelector('.nt-col-handle')) continue;
    const handle = document.createElement('span');
    handle.className = 'nt-col-handle';
    handle.setAttribute('aria-hidden', 'true');
    th.appendChild(handle);
  }
}

/** 把每列当前的实际渲染宽度写进 col（拖动前调用） */
function freezeFromActual(tableEl) {
  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  const cols = [...tableEl.querySelectorAll('colgroup col')];
  ths.forEach((th, i) => {
    const col = cols[i];
    if (!col) return;
    const w = Math.round(th.getBoundingClientRect().width);
    if (w > 0) {
      col.style.width = w + 'px';
      col.setAttribute('width', String(w));
    }
  });
}

/* 表头被 buildHead 重建后，自动同步一次布局（表宽 / 冻结 left / 手柄） */
if (typeof document !== 'undefined') {
  document.addEventListener('nt-layout-refresh', (ev) => {
    const table = ev.target && ev.target.closest ? ev.target.closest('table') : null;
    if (table) {
      paintHandles(table);
      syncTable(table);
    }
  });
}

/** 给所有数据区挂手柄并同步布局 */
export function bindAllResize(opts) {
  for (const table of document.querySelectorAll('table.nt-table')) {
    mountResize(table, opts);
    syncTable(table);
  }
}
