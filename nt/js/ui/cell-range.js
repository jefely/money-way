// 界面：单元格区域框选（长按起手 → 拖动框选 → 复制 / 粘贴 / 删除行）
/**
 * 单元格区域框选
 * 层：第五层 · UI
 *
 * 交互：
 *   长按单元格 480ms  →  进入框选，它成为锚点
 *   手指拖动          →  扩展成矩形，实时高亮
 *   松手              →  高亮保留，浮出工具条（见 range-bar.js）
 *
 * 手机上没有鼠标，所以用长按起手 —— 直接拖是横向滚动。
 * 框选期间 body 加 nt-range-mode，拖动不再触发滚动。
 */

import { bindBar, showBar, hideBar, setPasteEnabled } from './range-bar.js';

const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE = 8;      // 长按期间移动超过这个距离就算滚动，放弃长按

/** 内部剪贴板：二维字符串数组 */
let clip = null;

/** 当前选区 { anchorR, anchorC, focusR, focusC, tableEl } */
let sel = null;

/** 挂载时传入的回调 */
let handlers = {};

/* ============================================================
   一、挂载
   ============================================================ */

/**
 * @param {HTMLTableElement} tableEl
 * @param {{onDeleteRows?:(ids:string[])=>void}} opts
 */
export function mountCellRange(tableEl, opts) {
  const o = opts || {};
  if (!tableEl) return;

  handlers = o;

  bindBar({
    onCopy: doCopy,
    onPaste: doPaste,
    onDelete: doDelete,
    onCancel: clearSelection,
  });

  if (tableEl.dataset.rangeBound === '1') return;
  tableEl.dataset.rangeBound = '1';
  tableEl.addEventListener('pointerdown', (ev) => onDown(tableEl, ev));
}

/* ---------- 几何 ---------- */

function cellOf(tableEl, el) {
  const td = el && el.closest ? el.closest('td') : null;
  if (!td || !tableEl.contains(td)) return null;
  const tr = td.parentElement;
  if (!tr || !tr.parentElement || tr.parentElement.tagName !== 'TBODY') return null;
  return {
    td,
    r: [...tr.parentElement.children].indexOf(tr),
    c: [...tr.children].indexOf(td),
  };
}

function bounds() {
  return {
    r1: Math.min(sel.anchorR, sel.focusR),
    r2: Math.max(sel.anchorR, sel.focusR),
    c1: Math.min(sel.anchorC, sel.focusC),
    c2: Math.max(sel.anchorC, sel.focusC),
  };
}

/* ============================================================
   二、长按起手
   ============================================================ */

function onDown(tableEl, ev) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  // 点在列宽手柄上时不参与框选
  if (ev.target.closest && ev.target.closest('.nt-col-handle')) return;

  const hit = cellOf(tableEl, ev.target);
  if (!hit) return;

  const startX = ev.clientX;
  const startY = ev.clientY;
  let timer = 0;

  const cancel = () => {
    clearTimeout(timer);
    tableEl.removeEventListener('pointermove', onPreMove);
    tableEl.removeEventListener('pointerup', cancel);
    tableEl.removeEventListener('pointercancel', cancel);
  };

  function onPreMove(e) {
    if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE
        || Math.abs(e.clientY - startY) > MOVE_TOLERANCE) {
      cancel();     // 手指在动 = 想滚动，不是长按
    }
  }

  timer = setTimeout(() => {
    startSelection(tableEl, hit, ev);
    cancel();
  }, LONG_PRESS_MS);

  tableEl.addEventListener('pointermove', onPreMove);
  tableEl.addEventListener('pointerup', cancel);
  tableEl.addEventListener('pointercancel', cancel);
}

/* ============================================================
   三、框选过程
   ============================================================ */

function startSelection(tableEl, hit, ev) {
  sel = { anchorR: hit.r, anchorC: hit.c, focusR: hit.r, focusC: hit.c, tableEl };

  document.body.classList.add('nt-range-mode');
  try { tableEl.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }

  paint();

  const onMove = (e) => {
    const t = cellOf(tableEl, document.elementFromPoint(e.clientX, e.clientY));
    if (!t) return;
    sel.focusR = t.r;
    sel.focusC = t.c;
    paint();
  };

  const finish = () => {
    tableEl.removeEventListener('pointermove', onMove);
    tableEl.removeEventListener('pointerup', finish);
    tableEl.removeEventListener('pointercancel', finish);
    try { tableEl.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }

    document.body.classList.remove('nt-range-mode');
    showBar(tableEl, { hasClip: !!clip });
  };

  tableEl.addEventListener('pointermove', onMove);
  tableEl.addEventListener('pointerup', finish);
  tableEl.addEventListener('pointercancel', finish);

  showBar(tableEl, { hasClip: !!clip });
}

/** 重画高亮 */
function paint() {
  if (!sel) return;
  const { r1, r2, c1, c2 } = bounds();

  [...sel.tableEl.querySelectorAll('tbody tr')].forEach((tr, r) => {
    [...tr.children].forEach((td, c) => {
      const inside = r >= r1 && r <= r2 && c >= c1 && c <= c2;
      td.classList.toggle('nt-range-sel', inside);
      td.classList.toggle('nt-range-edge-top', inside && r === r1);
      td.classList.toggle('nt-range-edge-bottom', inside && r === r2);
      td.classList.toggle('nt-range-edge-left', inside && c === c1);
      td.classList.toggle('nt-range-edge-right', inside && c === c2);
    });
  });
}

/** 清掉高亮与选区 */
export function clearSelection() {
  if (sel) {
    for (const td of sel.tableEl.querySelectorAll('.nt-range-sel')) {
      td.classList.remove('nt-range-sel', 'nt-range-edge-top', 'nt-range-edge-bottom',
        'nt-range-edge-left', 'nt-range-edge-right');
    }
  }
  sel = null;
  hideBar();
}

/* ============================================================
   四、操作
   ============================================================ */

/** 读一个格子的值：有 input 读 value，否则读文本 */
function cellValue(td) {
  const input = td.querySelector('input, textarea');
  return input ? input.value : td.textContent.trim();
}

/** 写一个格子的值：只写 input，不动只读文本列 */
function setCellValue(td, v) {
  const input = td.querySelector('input, textarea');
  if (!input) return false;
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function doCopy() {
  if (!sel) return;
  const { r1, r2, c1, c2 } = bounds();
  const rows = [...sel.tableEl.querySelectorAll('tbody tr')].slice(r1, r2 + 1);

  clip = rows.map((tr) => {
    const tds = [...tr.children];
    const out = [];
    for (let c = c1; c <= c2; c += 1) out.push(tds[c] ? cellValue(tds[c]) : '');
    return out;
  });

  setPasteEnabled(true);
}

function doPaste() {
  if (!sel || !clip) return;
  const { r1, c1 } = bounds();
  const rows = [...sel.tableEl.querySelectorAll('tbody tr')];

  clip.forEach((line, dr) => {
    const tr = rows[r1 + dr];
    if (!tr) return;
    const tds = [...tr.children];
    line.forEach((v, dc) => {
      const td = tds[c1 + dc];
      if (td) setCellValue(td, v);
    });
  });

  clearSelection();
}

function doDelete() {
  if (!sel) return;
  const { r1, r2 } = bounds();
  const rows = [...sel.tableEl.querySelectorAll('tbody tr')].slice(r1, r2 + 1);
  const ids = rows.map((tr) => tr.dataset.id).filter(Boolean);

  clearSelection();
  if (ids.length && handlers.onDeleteRows) handlers.onDeleteRows(ids);
}
