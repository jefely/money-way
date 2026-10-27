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
  if (!tableEl) return;

  // ① 手柄：每次都补（表头是动态重建的，旧手柄会跟着消失）
  paintHandles(tableEl);

  // ② 事件：只绑一次，绑在 table 上做委托
  if (tableEl.dataset.colResize === '1') return;
  tableEl.dataset.colResize = '1';

  // 变量统一写 :root —— applySettings 也写这里。
  // 写到 [data-view=…] 容器上的话，冻结列第 2 列的 left（读 :root）跟不上第 1 列宽度，
  // 拖第 1 列时第 2 列的冻结位置不动，看起来就是乱跳。
  const scope = document.documentElement;

  tableEl.addEventListener('pointerdown', (ev) => {
    const th = ev.target.closest('.nt-th');
    if (!th || !th.dataset.col) return;

    const rect = th.getBoundingClientRect();
    // 只有落在右边缘 7px 内才算拖列宽，否则正常点选
    if (ev.clientX < rect.right - 7) return;
    ev.preventDefault();
    ev.stopPropagation();

    const col = th.dataset.col;

    // 拖动前固化所有列宽：否则只有目标列有 width，
    // 其它列在表格总宽变化时会被重新分配 —— 就是「拖一列，别的列跟着动」。
    freezeWidths(tableEl, th.dataset.col);

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

/** 给每个带 data-col 的表头补一个拖动手柄（已在就不重复加） */
export function paintHandles(tableEl) {
  for (const th of tableEl.querySelectorAll('thead .nt-th[data-col]')) {
    if (th.querySelector('.nt-col-handle')) continue;
    const handle = document.createElement('span');
    handle.className = 'nt-col-handle';
    handle.setAttribute('aria-hidden', 'true');
    th.appendChild(handle);
  }
}


/**
 * 把所有列的当前渲染宽度固化到对应 <col> 上。
 * <col> 量不到宽度，所以借表头 <th> 的宽度；已经写过的就不动。
 */
/**
 * 渲染后同步表宽：col 缺宽度的用 --nt-col-<key> 补上，再设「表宽 = 各列之和」。
 *
 * 为什么必须设表宽：table-layout:fixed 下表格默认被容器宽度压着，
 * 列会按比例缩水（col 写 44px、实际渲染 22px），
 * 冻结列的 left 偏移就和前一列的实际宽度对不上 → 边界错位 / 拖动乱跳。
 */
export function syncTableWidth(tableEl) {
  const cols = [...tableEl.querySelectorAll('colgroup col')];
  if (!cols.length) return;

  let total = 0;
  for (const col of cols) {
    let w = parseFloat(col.style.width);

    if (!Number.isFinite(w) || w <= 0) {
      const key = (col.className || '').replace('nt-c-', '');
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue('--nt-col-' + key).trim();
      const f = parseFloat(v);
      if (Number.isFinite(f) && f > 0) {
        col.style.width = f + 'px';
        col.setAttribute('width', String(f));
        w = f;
      }
    }

    if (Number.isFinite(w) && w > 0) total += w;
  }

  if (total > 0) tableEl.style.width = total + 'px';

  // 列宽变了，冻结列的 left 必须跟着重算，否则边界立刻错位
  layoutFrozen(tableEl);
}

/**
 * 拖动前固化：把每列的当前**实际**宽度写进 <col>。
 * 只在 pointerdown 里调用 —— 那时表格宽度已经设好，实际宽度就是对的。
 */
export function freezeWidths(tableEl, skipCol) {
  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  const cols = [...tableEl.querySelectorAll('colgroup col')];
  if (!cols.length) return;

  ths.forEach((th, i) => {
    const col = cols[i];
    if (!col) return;
    if (skipCol && th.dataset.col === skipCol) return;

    const w = Math.round(th.getBoundingClientRect().width);
    if (w > 0) {
      col.style.width = w + 'px';
      col.setAttribute('width', String(w));
    }
  });
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
  // 列宽变了，冻结列的 left 必须跟着重算，否则边界立刻错位
  layoutFrozen(tableEl);

}

/** 给一张表补 colgroup（没有的话），列宽从 th 的 data-col 生成 */
export function ensureColgroup(tableEl) {
  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  if (!ths.length) return;

  const existing = tableEl.querySelector('colgroup');

  // 列数一致才复用；数量变了（表结构改过）就重建，否则按索引对不上
  if (existing && existing.children.length === ths.length) return;
  if (existing) existing.remove();

  const cg = document.createElement('colgroup');
  for (const th of ths) {
    const col = document.createElement('col');
    const key = th.dataset.col;
    if (key) {
      col.className = 'nt-c-' + key;
      // 默认宽度取自 --nt-col-<key>（applySettings 会把「默认列宽」写进去）。
      // 不读变量的话，重建出来的 col 是零宽度，fixed 布局会把表格塌掉。
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue('--nt-col-' + key).trim();
      const w = parseFloat(v);
      if (Number.isFinite(w) && w > 0) {
        col.style.width = w + 'px';
        col.setAttribute('width', String(w));
      }
    }
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
    syncTableWidth(table);      // 每次渲染后同步表宽（表头是动态重建的）
    layoutFrozen(table);        // 冻结列的 left 按实际宽度重算
    mountColResize(table, opts);
  }
}

/** 每张表冻结几列（按表类名）。和 shell.css 里的 sticky 声明必须一致。 */
const FROZEN_COUNT = {
  'nt-table-flow': 1,
  'nt-table-stats': 2,
  'nt-table-plan': 1,
  'nt-table-inst': 1,
  'nt-table-accounts': 1,
  'nt-table-query': 0,
};

/**
 * 冻结列定位：把前 N 列的 left 按实际宽度累加写出来。
 *
 * 为什么不用 CSS 变量固定 left：前面的列一旦被拖动、宽度变化，
 * 固定值立刻错位（sticky 元素不会自己跟着邻居挪）。单文件版也是这么做的。
 */
export function layoutFrozen(tableEl) {
  const cls = [...tableEl.classList].find((c) => c in FROZEN_COUNT);
  if (!cls) return;
  const n = FROZEN_COUNT[cls];
  if (!n) return;

  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  let left = 0;

  for (let i = 0; i < Math.min(n, ths.length); i += 1) {
    const th = ths[i];
    const w = Math.round(th.getBoundingClientRect().width);

    th.style.left = left + 'px';
    // 数据行对应的格子也要同一个 left，否则表头和数据行会错开
    for (const tr of tableEl.querySelectorAll('tbody tr')) {
      const td = tr.children[i];
      if (td) td.style.left = left + 'px';
    }

    left += w;
  }
}
