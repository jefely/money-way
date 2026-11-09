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
 *
 * 多表共存：每张表各自登记一份能力（能否粘贴、能否删行、粘贴是整片还是一格），
 * 记在 tableMap 里；选区与剪贴板仍是全局单份 —— 同一时刻只有一个选区。
 * 早期版本把回调放在模块级变量里，第二张表一挂就把第一张表的删除回调顶掉了。
 */

import { bindBar, showBar, hideBar, setPasteEnabled } from './range-bar.js';
import { bindCellCursor } from './cell-cursor.js';

const LONG_PRESS_MS = 320;
const MOVE_TOLERANCE = 8;      // 长按期间移动超过这个距离就算滚动，放弃长按

/** 内部剪贴板：二维字符串数组（跨表共享：流水表复制 → 别的表也能粘） */
let clip = null;

/** 当前选区 { anchorR, anchorC, focusR, focusC, tableEl } */
let sel = null;

/**
 * 每张表的能力与回调
 *   paste:         'block'（整片）| 'single'（一次一格）| 'off'（只读，不给粘贴按钮）
 *   onDeleteRows:  (ids:string[]) => void   —— 没有就不显示「删除行」
 *   onNotice:      (text:string) => void    —— 粘贴结果如实回报（写到页脚）
 */
const tableMap = new WeakMap();

/* ============================================================
   一、挂载
   ============================================================ */

/**
 * @param {HTMLTableElement} tableEl
 * @param {{paste?:'block'|'single'|'off', onDeleteRows?:(ids:string[])=>void,
 *          onNotice?:(text:string)=>void}} [opts]
 */
export function mountCellRange(tableEl, opts) {
  if (!tableEl) return;
  const o = opts || {};

  tableMap.set(tableEl, {
    paste: o.paste || 'block',
    onDeleteRows: o.onDeleteRows || null,
    onNotice: o.onNotice || null,
  });

  bindBar({
    onCut: doCut,
    onCopy: doCopy,
    onPaste: doPaste,
    onClear: doClear,
    onEdit: doEdit,
    onCancel: clearSelection,
  });

  // Excel 式单元格光标：只给需要编辑的表（流水表）挂，只读表（统计）不挂
  if (o.cursor && !tableEl.dataset.cursorBound) {
    tableEl.dataset.cursorBound = '1';
    const tbody = tableEl.querySelector('tbody');
    if (tbody) bindCellCursor(tbody);
  }

  if (tableEl.dataset.rangeBound === '1') return;
  tableEl.dataset.rangeBound = '1';
  tableEl.addEventListener('pointerdown', (ev) => onDown(tableEl, ev));
}

function capsOf(tableEl) {
  const c = (tableEl && tableMap.get(tableEl)) || {};
  return {
    paste: c.paste || 'block',
    onDeleteRows: c.onDeleteRows || null,
    notice: c.onNotice || (() => {}),
  };
}

/* ---------- 几何 ---------- */

/** 跨列单元格（空状态、合计行）不参与框选：它的列号算不出来，会把整个矩形带歪 */
function isSpan(td) {
  return !!td && td.colSpan > 1;
}

function cellOf(tableEl, el) {
  const td = el && el.closest ? el.closest('td') : null;
  if (!td || !tableEl.contains(td) || isSpan(td)) return null;
  const tr = td.parentElement;
  if (!tr || !tr.parentElement || tr.parentElement.tagName !== 'TBODY') return null;
  return {
    td,
    r: [...tr.parentElement.children].indexOf(tr),
    c: [...tr.children].indexOf(td),
  };
}

function bodyRows(tableEl) {
  return [...tableEl.querySelectorAll('tbody tr')];
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
  // 在别的表上起新选区时，先把上一张表的高亮清掉 —— 否则会同时亮着两处
  clearSelection();

  // 单元格光标与框选互斥：框选期间不需要键盘，也避免两个高亮叠着
  for (const td of tableEl.querySelectorAll('.nt-cell-sel')) td.classList.remove('nt-cell-sel');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
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
    showBar(selRect(), barState(tableEl));
  };

  tableEl.addEventListener('pointermove', onMove);
  tableEl.addEventListener('pointerup', finish);
  tableEl.addEventListener('pointercancel', finish);

  showBar(selRect(), barState(tableEl));
}

/** 工具条的状态：能力来自这张表自己，不是全局 */
function barState(tableEl) {
  const caps = capsOf(tableEl);
  const hasInput = !!tableEl.querySelector('tbody input, tbody textarea');
  return {
    hasClip: !!clip,
    canPaste: caps.paste !== 'off' && hasInput,
    canEdit: hasInput,
    canDelete: !!caps.onDeleteRows,
  };
}

/** 选区的屏幕矩形：菜单就贴在它上方 */
function selRect() {
  if (!sel) return null;
  const { r1, r2, c1, c2 } = bounds();
  const rows = bodyRows(sel.tableEl);
  const first = rows[r1] && rows[r1].children[c1];
  const last = rows[r2] && rows[r2].children[c2];
  if (!first || !last) return null;
  const a = first.getBoundingClientRect();
  const b = last.getBoundingClientRect();
  return {
    top: Math.min(a.top, b.top),
    bottom: Math.max(a.bottom, b.bottom),
    left: Math.min(a.left, b.left),
    right: Math.max(a.right, b.right),
  };
}

/** 重画高亮 */
function paint() {
  if (!sel) return;
  const { r1, r2, c1, c2 } = bounds();

  bodyRows(sel.tableEl).forEach((tr, r) => {
    [...tr.children].forEach((td, c) => {
      const inside = !isSpan(td) && r >= r1 && r <= r2 && c >= c1 && c <= c2;
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

  // 这个类必须在这里一并清掉：它带 touch-action: none，
  // 只要残留在 body 上，整页上下左右都划不动，而且不会报任何错。
  // 早先只在 finish（正常松手）里清 —— 框选中途切页 / 被系统打断时会漏，
  // 表现就是「这个页面突然滑不动了」。
  if (typeof document !== 'undefined') {
    document.body.classList.remove('nt-range-mode');
  }

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

/** 写一个格子的值（只设 value，不派发事件；派发统一放在循环之后） */
function writeCell(td, v) {
  const input = td.querySelector('input, textarea');
  if (!input) return null;
  input.value = v;
  return input;
}

/** 一行的每个 td 都是整格（没有跨列）才取，跨列行整行跳过 */
function rowCells(tr) {
  const tds = [...tr.children];
  return tds.some(isSpan) ? null : tds;
}

function doCopy() {
  if (!sel) return;
  const { r1, r2, c1, c2 } = bounds();

  clip = [];
  for (const tr of bodyRows(sel.tableEl).slice(r1, r2 + 1)) {
    const tds = rowCells(tr);
    if (!tds) continue;                       // 合计行 / 空状态行不参与复制
    const out = [];
    for (let c = c1; c <= c2; c += 1) out.push(tds[c] ? cellValue(tds[c]) : '');
    clip.push(out);
  }

  // 同时写系统剪贴板：统计表这类只读表复制出来就是为了贴到别处
  const tsv = clip.map((line) => line.join('\t')).join('\n');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).catch(() => { /* 无权限就算了 */ });
    }
  } catch (e) { /* 忽略 */ }

  setPasteEnabled(true);
}

function doPaste() {
  if (!sel || !clip) return;
  const caps = capsOf(sel.tableEl);
  if (caps.paste === 'off') return;

  const total = clip.reduce((n, line) => n + line.length, 0);
  const { r1, c1 } = bounds();

  // 固定收支 / 分期这类「改一格就落库并重渲染」的表：整片粘贴会只生效第一格，
  // 与其静默丢数据，不如说清楚 —— 一次只粘一格。
  if (caps.paste === 'single' && total > 1) {
    caps.notice(`这张表一次只能粘一格（剪贴板里有 ${total} 格）`);
    return;
  }

  const rows = bodyRows(sel.tableEl);
  const inputs = [];
  let blocked = 0;

  clip.forEach((line, dr) => {
    const tr = rows[r1 + dr];
    const tds = tr ? rowCells(tr) : null;
    line.forEach((v, dc) => {
      const td = tds ? tds[c1 + dc] : null;
      const input = td ? writeCell(td, v) : null;
      if (input) inputs.push(input);
      else blocked += 1;
    });
  });

  // 值先全部落地，再统一派发 —— 否则第一格的 change 触发重渲染，后面的格子就写在旧节点上了
  for (const input of inputs) {
    try { input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { /* 已脱离 */ }
  }

  clearSelection();
  caps.notice(blocked
    ? `粘贴 ${inputs.length} 格，另有 ${blocked} 格是只读列没写`
    : `粘贴 ${inputs.length} 格`);
}

/** 剪切 = 复制 + 清空 */
function doCut() {
  if (!sel) return;
  const tableEl = sel.tableEl;
  doCopy(); const k = clearCells();
  clearSelection();
  capsOf(tableEl).notice(`已剪切 ${k} 格`);
}

/** 清空选区里的输入框，返回格数 */
function clearCells() {
  if (!sel) return 0;
  const { r1, r2, c1, c2 } = bounds();
  const inputs = [];
  for (const tr of bodyRows(sel.tableEl).slice(r1, r2 + 1)) {
    const tds = rowCells(tr);
    if (!tds) continue;
    for (let c = c1; c <= c2; c += 1) {
      const input = tds[c] && writeCell(tds[c], '');
      if (input) inputs.push(input);
    }
  }
  for (const input of inputs) {
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { /* 重渲染后旧节点可能已脱离 */ }
  }
  return inputs.length;
}

function doClear() {
  if (!sel) return;
  const tableEl = sel.tableEl;
  const k = clearCells();
  clearSelection();
  capsOf(tableEl).notice(k ? `已清除 ${k} 格` : '这一片没有可清空的格');
}

/** 编辑：等同双击 —— 选中这一格、进去、光标放末尾 */
function doEdit() {
  if (!sel) return;
  const { r1, c1 } = bounds();
  const tableEl = sel.tableEl;
  const tr = bodyRows(tableEl)[r1];
  const td = tr && tr.children[c1];
  const input = td && td.querySelector('input, textarea');
  clearSelection();
  if (!input) return;
  td.classList.add('nt-cell-sel', 'nt-cell-editing');
  try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
  const len = String(input.value || '').length;
  try { input.setSelectionRange(len, len); } catch (e) { /* 忽略 */ }
  tableEl.dispatchEvent(new CustomEvent('nt:edit-cell', { bubbles: true, detail: { td, input } }));
}

function doDelete() {
  if (!sel) return;
  const caps = capsOf(sel.tableEl);
  if (!caps.onDeleteRows) return;

  const { r1, r2 } = bounds();
  // 分期表一条记录占上下两行（同 data-id），去重后才不会删两次
  const ids = [];
  for (const tr of bodyRows(sel.tableEl).slice(r1, r2 + 1)) {
    const id = tr.dataset.id;
    if (id && !ids.includes(id)) ids.push(id);
  }

  clearSelection();
  if (ids.length) caps.onDeleteRows(ids);
}
