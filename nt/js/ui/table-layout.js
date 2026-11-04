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
    const head = headRows[0];
    const c0 = head && head.children[0];
    if (cls === 'nt-table-stats' && tableEl.classList.contains('is-cat') && c0) {
      const w = Math.round(c0.getBoundingClientRect().width);
      if (w > 0) tableEl.style.setProperty('--nt-freeze-2', w + 'px');
    }
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
  //    量第一行就够：同一列在各行的宽度本来就一样。
  const widths = (headRows[0] ? [...headRows[0].children] : []).map(
    (th) => Math.round(th.getBoundingClientRect().width),
  );

  // ② 再切模式、统一写入
  tableEl.classList.add('cols-custom');
  for (let i = 0; i < widths.length; i += 1) {
    const w = widths[i];
    if (!(w > 0)) continue;
    const col = cols[i];

    // 每一行的这一列都要写（两行表头都要跟）
    for (const tr of headRows) {
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
    if (col && !isUnifiedMonth(tableEl, headRows[0] && headRows[0].children[i])) {
      col.style.width = w + 'px';
    }
  }

  // 不再写 table.style.width：`.nt-table.cols-custom { width: max-content }`
  // 让表宽始终等于各列之和（见 shell.css）。
}

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
  const o = opts || {};
  if (!tableEl) return;

  paintHandles(tableEl);

  if (tableEl.dataset.resizeBound === '1') return;
  tableEl.dataset.resizeBound = '1';

  // 右边缘 7px 算拖动手柄（宽度可由参数 --nt-handle-w 调）。
  // 不再在 th 里放一块 7/14px 宽的命中层：透明层会盖住列标文字，
  // 列越窄盖掉的比例越大 —— 这正是「右边多出一块遮盖」的根因。
  tableEl.addEventListener('pointerdown', (ev) => {
    const th = ev.target.closest && ev.target.closest('.nt-th');
    if (!th) return;
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    const rect = th.getBoundingClientRect();
    const edge = handleHitWidth(th);
    if (ev.clientX < rect.right - edge) return;

    ev.preventDefault();
    ev.stopPropagation();

    startDrag(tableEl, th, ev, o);
  });
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
    for (const tr of tableEl.querySelectorAll('thead tr')) {
      const cell = tr.children[idx];
      if (cell) cell.style.width = px;
    }
    if (targetCol) targetCol.style.width = px;
    if (idx === 0 && tableEl.classList.contains('is-cat')) {
      tableEl.style.setProperty('--nt-freeze-2', px);
    }
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
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    if (th.querySelector('.nt-col-handle')) continue;
    const handle = document.createElement('span');
    handle.className = 'nt-col-handle';
    handle.setAttribute('aria-hidden', 'true');
    th.appendChild(handle);
  }
}

/** 给所有数据区挂手柄 + 同步冻结列 */
export function bindAllTables(opts) {
  for (const table of document.querySelectorAll('table.nt-table')) {
    mountResize(table, opts);
    paintHandles(table);
    syncFrozen(table);
  }
}

/* ============================================================
   三、列宽的「渲染缓存」
   ------------------------------------------------------------
   列宽的真身在账本参数里（加密、要等解锁），但表头每次重绘都会重建，
   内联 width 随之丢失 —— 表现就是「调好列宽，一折叠一展开就回到默认」。
   所以拖动时额外往 localStorage 写一份字符串镜像，buildHead 重建表头后
   直接应用它。参数面板改动时也会同步镜像（见 app.js）。
   ============================================================ */

const MIRROR_PREFIX = 'nt-colw:';

/** 表 → 镜像键（用表类名，够稳定） */
function mirrorKey(tableEl) {
  const cls = [...tableEl.classList].find((c) => c.startsWith('nt-table-'));
  if (!cls) return '';
  // 分类和汇总共用一张表，列数不同。镜像必须分开，否则切回来会把
  // 汇总的宽列套到「序」上，中间空出一截白、金额列被挤短。
  if (cls === 'nt-table-stats') {
    const mode = tableEl.classList.contains('is-sum') ? 'sum' : 'cat';
    return MIRROR_PREFIX + cls + ':' + mode;
  }
  return MIRROR_PREFIX + cls;
}

/** 写镜像：widths 是「每列一个数字」的数组 */
export function saveColMirror(tableEl, widths) {
  try {
    const k = mirrorKey(tableEl);
    if (!k) return;
    localStorage.setItem(k, (widths || []).join(','));
  } catch (e) { /* 忽略 */ }
}

/** 从镜像里把宽度应用到表头上（没有镜像就什么都不做） */
export function applyColMirror(tableEl) {
  try {
    const k = mirrorKey(tableEl);
    const raw = k ? localStorage.getItem(k) : '';
    if (!raw) return;
    const widths = raw.split(',').map((x) => Number(x) || 0);
    if (!widths.some((w) => w > 0)) return;

    const ths = [...tableEl.querySelectorAll('thead .nt-th')];
    if (!ths.length || widths.length !== ths.length) return;
    tableEl.classList.add('cols-custom');
    ths.forEach((th, i) => {
      const w = widths[i] || 0;
      th.style.minWidth = '0';
      th.style.maxWidth = 'none';
      th.style.width = w > 0 ? w + 'px' : '';
    });
    syncFrozen(tableEl);
  } catch (e) { /* 忽略 */ }
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
