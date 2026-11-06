// 界面：表格冻结列 + 列宽拖动
/**
 * 表格布局
 * 层：第五层 · UI
 * ============================================================
 * 照单文件版（personal/index.html）的两套模式
 * ============================================================
 *
 *   模式 A · CSS 定宽（默认）
 *     表宽 width:max-content = 各列 `<th>` 上的 --nt-col-* 之和
 *     冻结列：CSS 的 sticky（首列 left:0 / 表头 top:0）负责
 *
 *   模式 B · 自定义（拖过一次之后）
 *     整表切到 .cols-custom（width:max-content + min-width:0），
 *     每列宽度固化到 th 的 style 上，之后只改目标列；
 *     表宽由 max-content 自动跟随，**JS 不再写 table.style.width**
 *     —— 两种模式泾渭分明，不会「一边百分比一边固定 px」打架
 *
 * 上一版把「算列宽、算表宽、管 colgroup」全搬进 JS，
 * 每加一个功能（拖动、参数、动态表头）就多一个出错点，最后必然乱。
 * ============================================================
 */

import { saveFixedWidths } from './inst-layout.js';

/** 每张表冻结几列（键 = 表类名）。必须和 CSS 里的 sticky 声明一致。 */
const FROZEN_COUNT = {
  'nt-table-flow': 1,       // 序
  'nt-table-stats': 2,      // 序 + 第二列
  'nt-table-plan': 1,       // 序
  'nt-table-inst': 1,       // 账户名称（用户 2026-11-01：只冻第一列）
  'nt-table-accounts': 1,   // 简码（只此一列）
  'nt-table-query': 0,      // 不冻结
};

/**
 * 冻结偏移由 CSS 写死的表。
 *
 * 只冻结前几列时 left 是常量，累加没有意义，反而会多一个出错点
 * （量到的宽度和 CSS 的 width 不一致 → 冻结列错位）。
 * 手机首次渲染时经常量到 0 宽，算出来的 left 就是 0，
 * 于是第 2 列直接叠在第 1 列上 —— 用户看到的就是「第二列没冻住」。
 *
 * 所以这两张表由 shell.css 的 nth-child left 负责；
 * syncFrozen 只做一件事：清掉历史遗留的内联 left。
 *
 * 判据来自 TABLE-INTERACTION.md：CSS 产生值，JS 只消费。
 */
const CSS_FROZEN = new Set(['nt-table-accounts', 'nt-table-inst', 'nt-table-flow', 'nt-table-stats']);

const MIN_W = 30;
const MAX_W = 600;
/** 可视线在列右边缘左侧的偏移（px）。压在列线上很难稳定命中，单文件版用 2。 */
const EDGE_OFFSET = 2;

/* ============================================================
   一、冻结列：left 按实际渲染宽度累加
   ============================================================ */

/**
 * 为什么必须量实际宽度而不是读 CSS 值：
 *   · 浏览器会把列压窄（表格要挤进容器）
 *   · 表格有 min-width，容器更窄时列是缩放的
 *   · 用户拖过列宽
 *
 * 表头和数据行必须写同一个 left，否则两者会错开。
 */
export function syncFrozen(tableEl) {
  if (!tableEl) return;
  const cls = [...tableEl.classList].find((c) => c in FROZEN_COUNT);
  if (!cls) return;
  let n = FROZEN_COUNT[cls];
  if (tableEl.classList.contains('is-sum')) n = 1;
  if (!n) return;

  const headRows = [...tableEl.querySelectorAll('thead tr')];
  const ths = [...tableEl.querySelectorAll('thead .nt-th')];

  // 流水 / 统计的 left 在 CSS（--nt-freeze-2）。不要逐行写 style.left。
  if (CSS_FROZEN.has(cls)) {
    for (const th of ths) {
      if (th.style.left) th.style.left = '';
    }
    return;
  }

  const rows = [...tableEl.querySelectorAll('tbody tr')];
  let left = 0;
  for (let i = 0; i < n; i += 1) {
    const first = headRows[0] && headRows[0].children[i];
    if (!first) break;
    const w = Math.round(first.getBoundingClientRect().width);

    for (const tr of headRows) {
      const th = tr.children[i];
      if (th) th.style.left = left + 'px';
    }
    for (const tr of rows) {
      const td = tr.children[i];
      // 跨列单元格（比如「还没有流水」那行的 colspan=7）不能加 sticky left，
      // 否则整行会被当成一个冻结块横向移动 —— 看着就是莫名其妙地跳
      if (td && td.colSpan === 1) td.style.left = left + 'px';
    }

    left += w;
  }

  const clearFrom = n;
  for (const tr of headRows) {
    for (let i = clearFrom; i < tr.children.length; i += 1) {
      if (tr.children[i] && tr.children[i].style.left) tr.children[i].style.left = '';
    }
  }
  for (const tr of rows) {
    for (let i = clearFrom; i < tr.children.length; i += 1) {
      const td = tr.children[i];
      if (td && td.style.left) td.style.left = '';
    }
  }
}

/** 所有表都同步一遍 */
export function syncAllFrozen() {
  for (const t of document.querySelectorAll('table.nt-table')) syncFrozen(t);
}

/* ============================================================
   二、拖动：切 .cols-custom 之后只改目标列
   ============================================================ */

/**
 * 进入自定义列宽模式：把每列当前的**实际**宽度固化到 th 上。
 *
 * 必须在拖动开始时做一次 —— 否则 A 模式下是百分比/100% 分配，
 * 改一列宽度会让其它列按比例重新分配（「拖一列动一排」）。
 */
/**
 * 分期表的月份列：拖**任意一个**月份列，所有月份列一起变宽变窄。
 * 这种列不吃内联宽度，宽度只写一个 CSS 变量（--nt-inst-mw），
 * 由 `.nt-table-inst .nt-th.nt-c-month { width: var(--nt-inst-mw) }` 统一读。
 */
function isUnifiedMonth(tableEl, th) {
  return tableEl.classList.contains('nt-table-inst')
    && th.classList.contains('nt-c-month');
}

/**
 * 进「自定义列宽」模式：把当前各列的实际宽度固化成内联样式。
 *
 * 注意：表头可能是**两行**（分期表就是），所以列序号必须按「同一行里的位置」算，
 * 不能拿 `thead .nt-th` 的全局下标去索引 colgroup ——
 * 那样第二行从第 1 列开始就全部错位，col 找不到，拖了等于没拖。
 */
function enterCustomMode(tableEl) {
  if (tableEl.classList.contains('cols-custom')) return;

  const cols = [...tableEl.querySelectorAll('colgroup col')];
  const headRows = [...tableEl.querySelectorAll('thead tr')];

  // ① 先把每列宽度量完（边量边设会让后面的测量被前面的改动污染）。
  //    要用**列数最多**的那一行：统计页小表的第一行是跨两列的合计行
  //    （「资产  合计」占序+分类），按它量会少一列，后面全部错位。
  const base = headRows.reduce(
    (best, tr) => (tr.children.length > (best ? best.children.length : 0) ? tr : best),
    null,
  );
  const widths = (base ? [...base.children] : []).map(
    (th) => Math.round(th.getBoundingClientRect().width),
  );

  // ② 再切模式、统一写入
  tableEl.classList.add('cols-custom');
  for (let i = 0; i < widths.length; i += 1) {
    const w = widths[i];
    if (!(w > 0)) continue;
    const col = cols[i];

    // 每一行的这一列都要写（两行表头都要跟）。
    // 带 colspan 的行整行跳过：它的 children 下标和视觉列对不上，
    // 写进去会把宽度安到跨列格上（合计行就是这种）。
    for (const tr of headRows) {
      if ([...tr.children].some((c) => c.colSpan > 1)) continue;
      const th = tr.children[i];
      if (!th) continue;
      if (isUnifiedMonth(tableEl, th)) continue;
      // 内联清掉 min/max：CSS 里给冻结列写死的 max-width 会钳住拖出来的宽度
      th.style.minWidth = '0';
      th.style.maxWidth = 'none';
      th.style.width = w + 'px';
    }

    // **col 也要写**：table-layout: fixed 下 col 的宽度优先于 th，
    // 只改 th 的话拖动一点效果都没有（用户 2026-11-01「一二列调不窄」）。
    if (col && !isUnifiedMonth(tableEl, base && base.children[i])) {
      col.style.width = w + 'px';
    }
  }

  // 不再写 table.style.width：`.nt-table.cols-custom { width: max-content }`
  // 让表宽始终等于各列之和（见 shell.css）。
}

/**
 * 启动时注册的拖动回调。动态建的表格（统计页每个合计一张小表）拿不到 ctx，
 * 由 mountResize 在没显式传 opts 时复用这里。
 */
let defaultOpts = null;

/**
 * 给一张表挂拖动手柄。
 *
 * 做法照单文件版的 initColResize，三道关键：
 *   ① setPointerCapture —— 指针捕获后事件全发给手柄，手指移出也不断，
 *      而且其它列收不到 pointerover，不会跟着 hover 亮起来
 *   ② 事件绑在 grip 自己身上（move / up / cancel），不绑 document
 *   ③ 宽度写入用 rAF 合并到每帧一次，长表才不卡
 */
export function mountResize(tableEl, opts) {
  const o = opts || defaultOpts || {};
  if (!tableEl) return;

  // 统计小表走 ui/stat-resize.js 的专用实现：只有第 1 列可拖、七张表共用一个参数。
  // 通用这套会按坐标命中金额列，给它们钉 px、把「自动均分」破坏掉
  // —— 用户看到的就是「点表头就错乱」。
  if (tableEl.classList.contains('nt-table-stat')) return;

  paintHandles(tableEl);

  if (tableEl.dataset.resizeBound === '1') return;
  tableEl.dataset.resizeBound = '1';

  // 命中区从**列右边缘左移 2px 处**往左算 --nt-handle-w（默认 14px）：
  // 不要压在列线上 —— 手指稍微偏右就落到下一列，触摸会时灵时不灵。
  // 这里按坐标扫描整行表头，不管 event.target 落在左列还是右列，都选同一条边界。
  tableEl.addEventListener('pointerdown', (ev) => {
    const hit = ev.target.closest && ev.target.closest('.nt-th');
    if (!hit) return;
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;

    const th = edgeTarget(hit.parentNode, ev.clientX, handleHitWidth(hit));
    if (!th) return;

    ev.preventDefault();
    ev.stopPropagation();

    startDrag(tableEl, th, ev, o);
  });
}

/** 找 clientX 左侧最近、且在 edge 内的列边界（边界 = 列右边缘 - 2px）。 */
function edgeTarget(row, x, edge) {
  if (!row) return null;
  let best = null;
  for (const cell of row.children) {
    if (!cell || !cell.classList || !cell.classList.contains('nt-th')) continue;
    // **没有手柄的列不可拖**：只按坐标判断的话，点在「有手柄列」右边那些
    // 不可拖的列边缘上也会命中，于是给不该有宽度的列钉上 px。
    if (!cell.querySelector('.nt-col-handle')) continue;
    const r = cell.getBoundingClientRect();
    const lineX = r.right - EDGE_OFFSET;
    // 线右侧到列边界这 2px 也算：手指落在线上/边界上时允许一点误差，
    // 但不能越过列边界（越过去就是右列的左边缘，会拖错列）。
    if (x > r.right) continue;
    const d = Math.max(0, lineX - x);
    if (d <= edge && (!best || d < best.d)) best = { cell, d };
  }
  return best ? best.cell : null;
}

/** 右边缘命中宽度（px）；参数 --nt-handle-w 是唯一来源，限制在 4~20。 */
function handleHitWidth(th) {
  const raw = parseFloat(getComputedStyle(th).getPropertyValue('--nt-handle-w'));
  if (!Number.isFinite(raw)) return 14;
  return Math.min(20, Math.max(4, raw));
}

/** 一次拖动的全过程 */
function startDrag(tableEl, th, downEv, o) {
  if (!th) return;

  // 进 B 模式：把当前各列的实际宽度固化，之后只改目标列
  enterCustomMode(tableEl);

  const startX = downEv.clientX;
  const startW = Math.round(th.getBoundingClientRect().width);
  // 列序号按**这一行里的位置**算：表头可能是两行，用全局下标会错位
  const row = th.parentNode;
  const idx = row ? [...row.children].indexOf(th) : -1;
  // table-layout: fixed 认的是 col，所以目标列的 col 也要跟着改
  const targetCol = idx >= 0 ? ([...tableEl.querySelectorAll('colgroup col')][idx] || null) : null;
  const wrap = tableEl.closest('.nt-tablewrap');
  const prevOverflow = wrap ? wrap.style.overflowX : '';

  th.classList.add('nt-col-dragging');
  document.body.classList.add('nt-col-resizing');
  if (wrap) wrap.style.overflowX = 'hidden';

  // ① 指针捕获：手指移出列边缘也继续收事件
  try { th.setPointerCapture(downEv.pointerId); } catch (e) { /* 忽略 */ }

  let width = startW;
  let raf = 0;
  const unified = isUnifiedMonth(tableEl, th);

  const flush = () => {
    raf = 0;
    if (unified) {
      // 分期表月份列：只改变量，所有月份列一起跟着变
      tableEl.style.setProperty('--nt-inst-mw', Math.round(width) + 'px');
      syncFrozen(tableEl);
      return;
    }
    // 其余表：只改这一列的宽度，表宽由 `.cols-custom { width: max-content }` 跟着走。
    // col 和 th 都写 —— col 决定实际列宽（fixed 布局），th 留着给不支持 col 的场合兜底。
    // **同一列在每一行表头里都要写**：分期表是两行表头，只写被拖的那一行，
    // 另一行会保持旧宽度 —— fixed 布局下两行分叉，看起来就是「怎么拖都不窄」
    // （2026-11 用户实测；enterCustomMode 里本来就这么写，拖动时漏了）。
    const px = Math.round(width) + 'px';
    // 每行表头都要写；带 colspan 的行整行跳过（统计页合计行跨了序+分类，
    // 它的 children 下标和视觉列对不上）
    for (const tr of tableEl.querySelectorAll('thead tr')) {
      if ([...tr.children].some((c) => c.colSpan > 1)) continue;
      const cell = tr.children[idx];
      if (cell) cell.style.width = px;
    }
    if (targetCol) targetCol.style.width = px;
  };

  const onMove = (e) => {
    width = Math.max(MIN_W, Math.min(MAX_W, startW + (e.clientX - startX)));
    // ③ 每帧只写一次，别每个 move 都写
    if (!raf) raf = requestAnimationFrame(flush);
  };

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;

    if (raf) { cancelAnimationFrame(raf); flush(); }

    th.removeEventListener('pointermove', onMove);
    th.removeEventListener('pointerup', finish);
    th.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', finish);

    try { th.releasePointerCapture(downEv.pointerId); } catch (e) { /* 忽略 */ }

    th.classList.remove('nt-col-dragging');
    document.body.classList.remove('nt-col-resizing');
    if (wrap) wrap.style.overflowX = prevOverflow;

    // 分期表的月份列宽只有一份（CSS 变量），存这里就够了；
    // 其余表按列存，走下面的 onResize → 账本参数 + 镜像。
    if (unified) {
      try { localStorage.setItem('nt_inst_mw', Math.round(width) + 'px'); } catch (e) { /* 忽略 */ }
    } else if (tableEl.classList.contains('nt-table-inst')) {
      // 分期表没登记进 TABLE_COLS（3 个固定列 + N 个动态月份列），
      // 前 3 列宽度和月份一样存 localStorage；重画后由 inst-layout 应用。
      saveFixedWidths(tableEl);
    }

    // 回调带上「哪张表 + 哪一列」：每张表的列宽是各自一份参数，
    // 只给下标的话调用方还得自己反查（之前就是这里传的是数字，
    // 而 onColResize 当成列名去 indexOf，永远 -1 —— 拖了从来不保存）。
    if (o.onResize) o.onResize(tableEl, (th.dataset && th.dataset.col) || '', Math.round(width));
  };

  // ② 绑在表头上（指针已捕获，移出列也收得到）
  th.addEventListener('pointermove', onMove);
  th.addEventListener('pointerup', finish);
  th.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);
}

/** 给每个表头补一个拖动手柄 */
export function paintHandles(tableEl) {
  // 统计小表（.nt-table-stat）只有第 1 列（分类 / 节点）能拖：金额列由 CSS
  // 均分剩余宽度，给它们放手柄会让人以为能单独调，其实拖任何一列都只是
  // 在改金额区的总宽（用户 2026-11）。
  const stat = tableEl.classList.contains('nt-table-stat');
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    if (stat && th.dataset.col !== 'cat') continue;
    // 按钮列（上移 / 删除）**不可调宽**：它只需要「够点」，宽度固定（用户 2026-11）。
    if (th.dataset.col === 'up' || th.dataset.col === 'action') continue;
    if (th.querySelector('.nt-col-handle')) continue;
    const handle = document.createElement('span');
    handle.className = 'nt-col-handle';
    handle.setAttribute('aria-hidden', 'true');
    th.appendChild(handle);
  }
}

/** 给所有数据区挂手柄 + 同步冻结列 */
export function bindAllTables(opts) {
  defaultOpts = opts || {};
  for (const table of document.querySelectorAll('table.nt-table')) {
    mountResize(table, defaultOpts);
    paintHandles(table);
    syncFrozen(table);
  }
}

/* ============================================================
   三、表元素 → TABLE_COLS 的表名
   ------------------------------------------------------------
   列宽的真相只有一处：账本参数里的 `<表>/列宽`（加密、可备份）。
   表头重建后由 CSS 变量自动回到那个值（见 shell.css 的 --nt-col-*），
   所以**不再需要 localStorage 镜像** —— 镜像会和参数打架：
   面板「恢复默认」后表头一重建，旧镜像又把宽度套回去。
   ============================================================ */

/** 表元素 → TABLE_COLS 的 key；认不出来返回 '' */
export function tableIdOf(tableEl) {
  if (!tableEl) return '';
  const c = tableEl.classList;
  if (c.contains('nt-table-flow')) return 'flow';
  // 统计页 6 大分类：费用 / 收入 / 资产 / 负债 / 权益 / 成本（各自一套列宽）
  if (c.contains('nt-table-fee')) return 'fee';
  if (c.contains('nt-table-income')) return 'income';
  if (c.contains('nt-table-asset')) return 'asset';
  if (c.contains('nt-table-liability')) return 'liability';
  if (c.contains('nt-table-equity')) return 'equity';
  if (c.contains('nt-table-cost')) return 'cost';
  if (c.contains('nt-table-catq')) return 'catq';
  // 汇总视图：按类型分组的多张小表（2026-11），共用「汇总表/列宽」一套参数
  if (c.contains('nt-table-sum')) return 'sum';
  // 旧的单张汇总表（.nt-table-stats）已不再渲染，判断保留以防历史引用
  if (c.contains('nt-table-stats')) return 'sum';
  if (c.contains('nt-table-query')) return 'query';
  if (c.contains('nt-table-plan')) return 'plan';
  if (c.contains('nt-table-accounts')) return 'accounts';
  return '';
}

/** 恢复默认列宽：回到 A 模式 */
export function resetColWidths(tableEl) {
  tableEl.classList.remove('cols-custom');
  // 只清历史内联值，不写新值 —— 表宽回到 CSS 的 max-content
  tableEl.style.width = '';
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    th.style.width = '';
    th.style.minWidth = '';
    th.style.maxWidth = '';
    th.style.left = '';
  }
  syncFrozen(tableEl);
}

/**
 * 禁掉表格内的原生拖放。
 *
 * Chrome 允许 <input> 参与 HTML5 drag，选中数字拖到别的格子会把值带过去。
 * 表格里没有任何地方需要这个行为，全局拦掉最省事。
 */
if (typeof document !== 'undefined') {
  document.addEventListener('dragstart', (ev) => {
    const t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest('.nt-table') || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
      ev.preventDefault();
    }
  }, true);
}
