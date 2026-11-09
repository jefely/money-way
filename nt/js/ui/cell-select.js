// 界面：流水表的选区（Excel 式：锚点 + 右下角手柄 + 长按菜单）
/**
 * 单元格选区
 * 层：第五层 · UI
 *
 * 用户 2026-11-09 定稿：
 *   · 单击选中后，选框**右下角有一个调整大小手柄**；拖它把选区扩成矩形。
 *   · 长按单元格 → 在**该单元格上方**弹出唯一一条菜单：
 *     剪切 / 复制 / 粘贴 / 清除 / 编辑。
 *     （不再同时弹旧的四按钮「复制 / 粘贴 / 删除行 / 取消」条。）
 *
 * 分工：
 *   · cell-edit.js  管输入框焦点、光标、双击编辑、键盘；
 *   · 本文件管选区矩形、手柄、长按菜单、剪切/复制/粘贴/清除；
 *   · cell-clip.js  管格子 ↔ 矩阵的搬运；cell-menu.js 管菜单的摆放。
 *
 * 手柄定位：绝对定位在 .nt-tablewrap 里（wrap 加 position: relative），
 * 坐标按内容坐标算（加 scrollLeft / scrollTop），所以横滚 / 纵滚时跟着格子走。
 */

import { copyCells, clearCells, pasteCells, getClip } from './cell-clip.js';
import { showCellMenu, hideCellMenu, isCellMenuTarget, isCellMenuOpen } from './cell-menu.js';

const ANCHOR = 'nt-cell-anchor';
const RANGE = 'nt-range-sel';
const EDGES = ['nt-range-edge-top', 'nt-range-edge-bottom', 'nt-range-edge-left', 'nt-range-edge-right'];
const PRESS_MS = 480;
const MOVE_TOL = 8;
const GRIP = 26;

export function mountCellSelect(tableEl, tbody, opts) {
  const o = opts || {};
  const notice = o.onNotice || (() => {});
  let editor = o.editor || null;

  /** { ar, ac, fr, fc }：ar/ac 是锚点（有描边的那格），fr/fc 是拖到的对角 */
  let sel = null;
  let press = null;
  let pressInside = false;   // 按在已有多格选区里：松手前先别塌成一格
  let swallowClick = false;
  let suppressClick = false;
  let blockEnd = false;
  let grip = null;

  const wrap = tableEl.closest('.nt-tablewrap');
  if (wrap) {
    wrap.classList.add('nt-has-grip');
    grip = makeGrip();
  }

  /* ---------- 坐标 ---------- */

  const rows = () => [...tbody.children];

  function coords(td) {
    const tr = td && td.parentElement;
    if (!tr || tr.parentElement !== tbody || [...tr.children].some((c) => c.colSpan > 1)) return null;
    const r = rows().indexOf(tr);
    const c = [...tr.children].indexOf(td);
    return r >= 0 && c >= 0 ? { r, c } : null;
  }

  const cellAt = (r, c) => (tbody.children[r] ? tbody.children[r].children[c] || null : null);
  const bounds = () => ({
    r1: Math.min(sel.ar, sel.fr), r2: Math.max(sel.ar, sel.fr),
    c1: Math.min(sel.ac, sel.fc), c2: Math.max(sel.ac, sel.fc),
  });
  const isMulti = () => { const b = bounds(); return b.r1 !== b.r2 || b.c1 !== b.c2; };

  /** 指针下的格子：跳过手柄 / 菜单等浮层（用 elementsFromPoint 逐层找 td） */
  function cellAtPoint(x, y) {
    const list = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
    for (const el of list) {
      const td = el && el.closest ? el.closest('td.nt-cell') : null;
      if (td && tbody.contains(td)) { const p = coords(td); if (p) return p; }
    }
    return null;
  }

  /* ---------- 画选区 ---------- */

  function paint() {
    for (const td of tbody.querySelectorAll('.' + ANCHOR)) td.classList.remove(ANCHOR);
    for (const td of tbody.querySelectorAll('.' + RANGE)) td.classList.remove(RANGE, ...EDGES);
    if (!sel) return;

    const anchor = cellAt(sel.ar, sel.ac);
    if (anchor) anchor.classList.add(ANCHOR);

    const { r1, r2, c1, c2 } = bounds();
    if (r1 === r2 && c1 === c2) return;      // 单格：只靠描边，不铺紫底

    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) {
        const td = cellAt(r, c);
        if (!td || td === anchor || td.colSpan > 1) continue;
        td.classList.add(RANGE);
        if (r === r1) td.classList.add('nt-range-edge-top');
        if (r === r2) td.classList.add('nt-range-edge-bottom');
        if (c === c1) td.classList.add('nt-range-edge-left');
        if (c === c2) td.classList.add('nt-range-edge-right');
      }
    }
  }

  /* ---------- 右下角手柄 ---------- */

  function makeGrip() {
    const g = document.createElement('div');
    g.className = 'nt-cell-grip';
    g.hidden = true;
    g.setAttribute('aria-label', '拖动调整选区范围');
    g.addEventListener('pointerdown', onGripDown);
    wrap.appendChild(g);
    return g;
  }

  function placeGrip() {
    if (!grip || !wrap) return;
    if (!sel) { grip.hidden = true; return; }
    const { r2, c2 } = bounds();
    const td = cellAt(r2, c2);
    if (!td) { grip.hidden = true; return; }

    const cr = td.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const x = cr.right - (wr.left + wrap.clientLeft) + wrap.scrollLeft;
    const y = cr.bottom - (wr.top + wrap.clientTop) + wrap.scrollTop;
    grip.style.left = Math.round(x - GRIP) + 'px';
    grip.style.top = Math.round(y - GRIP) + 'px';
    grip.hidden = false;
  }

  function onGripDown(ev) {
    if (!sel || !wrap || !grip) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    hideCellMenu();
    if (editor && editor.blurInput) editor.blurInput();

    const anchor = { ar: sel.ar, ac: sel.ac };
    const pid = ev.pointerId;
    try { grip.setPointerCapture(pid); } catch (e) { /* 忽略 */ }
    document.body.classList.add('nt-cell-gripping');

    // 拖手柄时页面不许滚（touch-action 改不动已经开始的贴手势，直接挡 touchmove）
    const stopScroll = (e) => { if (e.cancelable) e.preventDefault(); };
    wrap.addEventListener('touchmove', stopScroll, { passive: false });

    const onMove = (e) => {
      const hit = cellAtPoint(e.clientX, e.clientY);
      if (!hit) return;
      sel = { ar: anchor.ar, ac: anchor.ac, fr: hit.r, fc: hit.c };
      paint();
      placeGrip();
    };

    const finish = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', finish);
      grip.removeEventListener('pointercancel', finish);
      wrap.removeEventListener('touchmove', stopScroll);
      document.body.classList.remove('nt-cell-gripping');
      try { grip.releasePointerCapture(pid); } catch (e) { /* 忽略 */ }
      paint();
      placeGrip();
    };

    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
  }

  /* ---------- 选中 / 清除 ---------- */

  function single(td) {
    // 长按松手时浏览器会把输入框重新聚焦一次 → focusin 又走到这里。
    // 菜单还开着，说明这次 focus 是长按的余波，不能把多格选区收成 1×1。
    if (isCellMenuOpen()) return;
    // 鼠标按在多格选区里：先别塌；短按松手再塌，长按弹菜单则保留整片
    if (pressInside) return;
    singleNow(td);
  }

  function singleNow(td) {
    const p = coords(td);
    if (!p) return;
    sel = { ar: p.r, ac: p.c, fr: p.r, fc: p.c };
    paint(); placeGrip();
  }

  function clear() {
    sel = null; paint();
    if (grip) grip.hidden = true;
    hideCellMenu();
  }

  function reset() {
    cancelPress();
    pressInside = false;
    swallowClick = false;
    clear();
  }

  /* ---------- 长按 → 五个按钮 ---------- */

  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
    tableEl.removeEventListener('pointermove', onPreMove);
    tableEl.removeEventListener('pointerup', onPreUp);
    tableEl.removeEventListener('pointercancel', onPreUp);
  }

  function onPreMove(ev) {
    if (!press) return;
    if (Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > MOVE_TOL) cancelPress();
  }

  function onPreUp() {
    const hadInside = pressInside;
    const td = press && press.td;
    const menu = isCellMenuOpen();
    pressInside = false;
    cancelPress();
    if (!hadInside || menu) return;      // 长按弹了菜单：保留整片
    if (td) singleNow(td);               // 短按：塌到按下的那一格
    swallowClick = true;                 // 吞掉这次 click，别让 cell-edit 再排「取消选中」
  }

  tableEl.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (ev.target.closest && ev.target.closest('button, .nt-fixed-box, .nt-col-handle, .nt-cell-grip')) return;
    const td = ev.target.closest && ev.target.closest('td.nt-cell');
    const p = td ? coords(td) : null;
    if (!p) return;
    cancelPress();
    swallowClick = false;
    // 按在已有多格选区里：先别让 focusin 把选区收成一格
    pressInside = !!(sel && isMulti() && inside(p));
    press = { hit: p, td, x: ev.clientX, y: ev.clientY, timer: 0 };
    press.timer = setTimeout(openMenu, PRESS_MS);
    tableEl.addEventListener('pointermove', onPreMove);
    tableEl.addEventListener('pointerup', onPreUp);
    tableEl.addEventListener('pointercancel', onPreUp);
  });

  function openMenu() {
    const hit = press && press.hit;
    cancelPress();
    if (!hit) return;

    // 长按后松手：浏览器会把这次触摸补成 focus + click（键盘弹出来盖住菜单）。
    // 拦掉 touchend 的默认行为；click 再在捕获阶段吞一次。
    suppressClick = true;
    blockEnd = true;

    if (!sel || !inside(hit)) {
      sel = { ar: hit.r, ac: hit.c, fr: hit.r, fc: hit.c };
    }
    if (editor && editor.blurInput) editor.blurInput();
    paint();
    placeGrip();

    const td = cellAt(hit.r, hit.c);
    if (!td) return;
    const input = td.querySelector('input.nt-cell-input');
    const ro = !input || input.readOnly || input.disabled;
    showCellMenu(td.getBoundingClientRect(), {
      canPaste: !!getClip(),
      canEdit: !ro,
      canCut: !ro && editableCount() > 0,
      canClear: editableCount() > 0,
    }, handlers);
  }

  function inside(hit) {
    if (!sel) return false;
    const b = bounds();
    return hit.r >= b.r1 && hit.r <= b.r2 && hit.c >= b.c1 && hit.c <= b.c2;
  }

  function editableCount() {
    if (!sel) return 0;
    const b = bounds();
    let n = 0;
    for (let r = b.r1; r <= b.r2; r += 1) {
      for (let c = b.c1; c <= b.c2; c += 1) {
        const td = cellAt(r, c);
        const inp = td ? td.querySelector('input.nt-cell-input') : null;
        if (inp && !inp.readOnly && !inp.disabled) n += 1;
      }
    }
    return n;
  }

  tableEl.addEventListener('click', (ev) => {
    if (!suppressClick && !swallowClick) return;
    suppressClick = false;
    swallowClick = false;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);

  tableEl.addEventListener('pointerdown', () => {
    suppressClick = false;
    blockEnd = false;
  }, true);

  tableEl.addEventListener('touchend', (ev) => {
    if (!blockEnd) return;
    blockEnd = false;
    if (ev.cancelable) ev.preventDefault();
  }, { passive: false });

  /* ---------- 五个动作 ---------- */

  function copyNow() {
    const b = bounds();
    return copyCells(tableEl, b.r1, b.c1, b.r2, b.c2);
  }

  function clearNow() {
    const b = bounds();
    // 流水表的 from/to 要合成一次 focusout，账户 id 才会跟着清掉
    return clearCells(tableEl, b.r1, b.c1, b.r2, b.c2, { resolveAccounts: true });
  }

  const handlers = {
    cut() {
      if (!sel) return;
      copyNow(); const n = clearNow();
      paint(); placeGrip();
      notice(n ? `已剪切 ${n} 格` : '这一片没有可清空的格');
    },
    copy() {
      if (!sel) return;
      const m = copyNow();
      notice(`已复制 ${m.length} 行 × ${m[0] ? m[0].length : 0} 格`);
    },
    paste() {
      if (!sel) return;
      const m = getClip();
      if (!m) return;
      // 粘到锚点（当前活动格），与 Excel 一致；不是选区的左上角
      const r = pasteCells(tableEl, sel.ar, sel.ac, m, { resolveAccounts: true });
      paint(); placeGrip();
      notice(r.blocked
        ? `粘贴 ${r.written} 格，${r.blocked} 格只读没写`
        : `粘贴 ${r.written} 格`);
    },
    clear() {
      if (!sel) return;
      const n = clearNow();
      paint(); placeGrip();
      notice(n ? `已清除 ${n} 格` : '这一片没有可清空的格');
    },
    edit() { const td = sel ? cellAt(sel.ar, sel.ac) : null; if (td && editor && editor.editAt) editor.editAt(td); },
  };

  /* ---------- 点外面 / 滚动 ---------- */

  // 手机上长按输入框会弹系统选字菜单，和我们的长按菜单抢；表格里有输入框就压掉
  tableEl.addEventListener('contextmenu', (ev) => {
    if (ev.target.closest && ev.target.closest('td.nt-cell, input')) ev.preventDefault();
  });

  document.addEventListener('pointerdown', (ev) => {
    if (!sel) return;
    if (tableEl.contains(ev.target)) return;
    if (grip && grip.contains(ev.target)) return;
    if (isCellMenuTarget(ev.target)) return;
    clear();
  });

  if (wrap) wrap.addEventListener('scroll', hideCellMenu, { passive: true });
  window.addEventListener('resize', placeGrip);
  tableEl.addEventListener('nt-layout-refresh', placeGrip);

  return {
    single,
    clear,
    reset,
    setEditor(e) { editor = e; },
    selection: () => (sel ? { ...sel, ...bounds() } : null),
  };
}
