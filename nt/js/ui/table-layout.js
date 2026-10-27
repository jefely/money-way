// 界面：表格冻结列 + 列宽拖动
/**
 * 表格布局
 * 层：第五层 · UI
 *
 * ============================================================
 * 照单文件版（personal/index.html）的两套模式
 * ============================================================
 *
 *   模式 A · 自适应（默认）
 *     CSS 给表格 width:100% + min-width，各列宽度由 CSS 定
 *     JS 只负责算冻结列的 left
 *
 *   模式 B · 自定义（拖过一次之后）
 *     整表切到 .cols-custom（width:auto + min-width:0），
 *     每列宽度固化到 th 的 style 上，之后只改目标列
 *     —— 两种模式泾渭分明，不会「一边百分比一边固定 px」打架
 *
 * 上一版把「算列宽、算表宽、管 colgroup」全搬进 JS，
 * 每加一个功能（拖动、参数、动态表头）就多一个出错点，最后必然乱。
 * ============================================================
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
      // 跨列单元格（比如「还没有流水」那行的 colspan=7）不能加 sticky left，
      // 否则整行会被当成一个冻结块横向移动 —— 看着就是莫名其妙地跳
      if (td && td.colSpan === 1) td.style.left = left + 'px';
    }

    left += w;
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
function enterCustomMode(tableEl) {
  if (tableEl.classList.contains('cols-custom')) return;

  // ① 先把所有列的宽度量完（边量边设会让后面的测量被前面的改动污染）
  const widths = [];
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    widths.push(Math.round(th.getBoundingClientRect().width));
  }

  // ② 再切模式、统一写入
  tableEl.classList.add('cols-custom');
  let i = 0;
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    const w = widths[i];
    i += 1;
    // 内联清掉 min/max：CSS 里给冻结列写死的 max-width 会钳住拖出来的宽度
    th.style.minWidth = '0';
    th.style.maxWidth = 'none';
    if (w > 0) th.style.width = w + 'px';
  }

  applyCustomWidth(tableEl);
}

/**
 * B 模式专用：表格宽度 = 各列 th 的固定宽度之和。
 *
 * 不设的话 table-layout:fixed + width:auto 会让表格跟随容器，
 * 每列设的 px 被按比例均分掉（整表压成容器宽）。
 * A 模式不需要这个 —— 那边宽度完全由 CSS 的 width:100% + min-width 决定。
 */
function applyCustomWidth(tableEl) {
  let total = 0;
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    const w = parseFloat(th.style.width);
    if (Number.isFinite(w) && w > 0) total += w;
  }
  if (total > 0) tableEl.style.width = total + 'px';
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

  // 只做一件事：从被按下的手柄找到目标列，然后把后续事件交给手柄自己
  tableEl.addEventListener('pointerdown', (ev) => {
    const grip = ev.target.closest && ev.target.closest('.nt-col-handle');
    if (!grip) return;
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;

    ev.preventDefault();
    ev.stopPropagation();

    startDrag(tableEl, grip, ev, o);
  });
}

/** 一次拖动的全过程 */
function startDrag(tableEl, grip, downEv, o) {
  const th = grip.closest('.nt-th');
  if (!th) return;

  // 进 B 模式：把当前各列的实际宽度固化，之后只改目标列
  enterCustomMode(tableEl);

  const startX = downEv.clientX;
  const startW = Math.round(th.getBoundingClientRect().width);
  const idx = [...tableEl.querySelectorAll('thead .nt-th')].indexOf(th);
  const wrap = tableEl.closest('.nt-tablewrap');
  const prevOverflow = wrap ? wrap.style.overflowX : '';

  grip.classList.add('dragging');
  th.classList.add('nt-col-dragging');
  document.body.classList.add('nt-col-resizing');
  if (wrap) wrap.style.overflowX = 'hidden';

  // ① 指针捕获：手指移出手柄也继续收事件
  try { grip.setPointerCapture(downEv.pointerId); } catch (e) { /* 忽略 */ }

  let width = startW;
  let raf = 0;

  const flush = () => {
    raf = 0;
    th.style.width = width + 'px';
    applyCustomWidth(tableEl);
    syncFrozen(tableEl);
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

    grip.removeEventListener('pointermove', onMove);
    grip.removeEventListener('pointerup', finish);
    grip.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', finish);

    try { grip.releasePointerCapture(downEv.pointerId); } catch (e) { /* 忽略 */ }

    grip.classList.remove('dragging');
    th.classList.remove('nt-col-dragging');
    document.body.classList.remove('nt-col-resizing');
    if (wrap) wrap.style.overflowX = prevOverflow;

    if (o.onResize) o.onResize(idx, Math.round(width));
  };

  // ② 绑在手柄自己身上
  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', finish);
  grip.addEventListener('pointercancel', finish);
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

/** 恢复默认列宽：回到 A 模式 */
export function resetColWidths(tableEl) {
  tableEl.classList.remove('cols-custom');
  tableEl.style.width = '';
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    th.style.width = '';
    th.style.minWidth = '';
    th.style.maxWidth = '';
    th.style.left = '';
  }
  syncFrozen(tableEl);
}
