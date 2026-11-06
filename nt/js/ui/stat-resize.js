// 界面：统计小表专用的列宽拖动（只有第 1 列可拖）
/**
 * 为什么单独一份，不再复用 ui/table-layout.js 的 mountResize
 * ------------------------------------------------------------
 * 那套是为「每列一个 px」设计的：要处理分期表的两行表头、路径页的 div grid、
 * `.cols-custom` 整表切模式、以及「拖着拖着整表变宽」。统计小表的模型完全不同：
 *
 *   · 只有第 1 列（分类 / 节点）有宽度，后面 4 个金额列由 CSS 均分
 *   · 同类七张表共用一个参数，拖一张 = 拖全部
 *   · 永远 100% 宽，不需要 cols-custom
 *
 * 前几版一直在给通用那套打补丁（noGroup、data-col 判断、类名跳过），越补越难对，
 * 而且留下了真 bug：通用实现按坐标扫描整行表头、**不检查这一列有没有手柄**，
 * 于是点在金额列右边缘也会 startDrag，给「本来不写宽度」的金额列钉上 px，
 * 均分被破坏 —— 用户看到的就是「点表头就错乱」。
 *
 * 这里重写成一条直线：
 *   pointerdown 只认分类列右边缘 → 只改这一列 → 松手写一个参数。
 * 点表头其它位置、点金额列，一律不响应。
 */

import { clearInlineWidths } from './col-widths.js';

/** 命中区宽度（px）：分类列右边缘往左这么多以内算拖手柄 */
const EDGE = 14;
const MIN_W = 40;
const MAX_W = 240;

/**
 * 给一张统计小表挂上分类列拖动。
 * @param {HTMLElement} tableEl
 * @param {{onResize?:(w:number)=>void}} [opts]
 */
export function mountStatColResize(tableEl, opts) {
  if (!tableEl || tableEl.dataset.statResize === '1') return;
  const th = tableEl.querySelector('thead .nt-th[data-col="cat"]');
  if (!th) return;
  tableEl.dataset.statResize = '1';

  if (!th.querySelector('.nt-col-handle')) {
    const h = document.createElement('span');
    h.className = 'nt-col-handle';
    h.setAttribute('aria-hidden', 'true');
    th.appendChild(h);
  }

  const o = opts || {};

  th.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    const r = th.getBoundingClientRect();
    // 只认「列右边缘往左 EDGE 以内」。点在列中间（想选文字、想点表头）不触发。
    if (ev.clientX < r.right - EDGE || ev.clientX > r.right + 2) return;
    ev.preventDefault();
    ev.stopPropagation();
    runDrag(tableEl, th, ev, o);
  });
}

function runDrag(tableEl, th, downEv, o) {
  const startX = downEv.clientX;
  const startW = Math.round(th.getBoundingClientRect().width);
  const col = tableEl.querySelector('colgroup col');
  const wrap = tableEl.closest('.nt-tablewrap');
  const prevOverflow = wrap ? wrap.style.overflowX : '';

  th.classList.add('nt-col-dragging');
  document.body.classList.add('nt-col-resizing');
  if (wrap) wrap.style.overflowX = 'hidden';
  try { th.setPointerCapture(downEv.pointerId); } catch (e) { /* 忽略 */ }

  let width = startW;
  let raf = 0;

  // 拖动期间只改这一张表的第 1 列，别的不碰
  const flush = () => {
    raf = 0;
    const px = Math.round(width) + 'px';
    if (col) col.style.width = px;
    th.style.width = px;
  };

  const onMove = (e) => {
    width = Math.max(MIN_W, Math.min(MAX_W, startW + (e.clientX - startX)));
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

    // 写参数 → applySettings 改 CSS 变量 → 七张表一起变。
    // 之后把它们的内联 px 清掉，回到「变量驱动」，否则被拖那张会留着死宽度。
    if (typeof o.onResize === 'function') o.onResize(Math.round(width));
    for (const t of document.querySelectorAll('table.nt-table-stat')) clearInlineWidths(t);
  };

  th.addEventListener('pointermove', onMove);
  th.addEventListener('pointerup', finish);
  th.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);
}
