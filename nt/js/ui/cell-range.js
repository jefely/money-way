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
 *
 * 流水表另有 Excel 式单元格编辑器（cell-edit.js）：框选起手时先把它 release()，
 * 否则键盘 / 选中框会和框选高亮叠在一起。
 */

import { bindBar, showBar, hideBar, setPasteEnabled } from './range-bar.js';

const LONG_PRESS_MS = 480;
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
 *   editor:        cell-edit 实例（可编辑表才有）—— 框选起手时先收掉它的选中框
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
    editor: o.editor || null,
  });

  bindBar({
    onCopy: doCopy,
    onPaste: doPaste,
    onDelete: doDelete,
    onCancel: clearSelection,
  });

  if (tableEl.dataset.rangeBound === '1') return;
  tableEl.dataset.rangeBound = '1';
  tableEl.addEventListener('pointerdown', (ev) => onDown(tableEl, ev));
  // 手机上长按输入框会弹系统选字菜单，和框选抢手势；表格里有输入框就压掉
  tableEl.addEventListener('contextmenu', (ev) => {
    if (ev.target.closest && ev.target.closest('input, textarea')) ev.preventDefault();
  });
}

function capsOf(tableEl) {
  const c = (tableEl && tableMap.get(tableEl)) || {};
  return {
    paste: c.paste || 'block',
    onDeleteRows: c.onDeleteRows || null,
    notice: c.onNotice || (() => {}),
    editor: c.editor || null,
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

  // 上一次框选还亮着：手指落在表格里就当成「开始新的选择」，先收掉旧选区
  // （菜单的「取消」和点外面也会走 clearSelection，这里只是兜底）
  if (sel) clearSelection();

  const hit = cellOf(tableEl, ev.target);
  if (!hit) return;

  // 鼠标：按住一拖就是框选（Excel 桌面习惯）。手机上不行 —— 直接拖是滚动。
  // 头 6px 浏览器可能已经开始选字，startSelection 里的 release() 会把它清掉。
  if (ev.pointerType === 'mouse') {
    const startX = ev.clientX;
    const startY = ev.clientY;
    let started = false;
    const stop = () => {
      tableEl.removeEventListener('pointermove', onMove);
      tableEl.removeEventListener('pointerup', stop);
      tableEl.removeEventListener('pointercancel', stop);
    };
    function onMove(e) {
      if (started || !(e.buttons & 1)) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      started = true;
      stop();
      startSelection(tableEl, hit, ev);
    }
    tableEl.addEventListener('pointermove', onMove);
    tableEl.addEventListener('pointerup', stop);
    tableEl.addEventListener('pointercancel', stop);
    return;
  }

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

  // 单元格选中 / 编辑和框选互斥：先收掉选中框和键盘，免得两个高亮叠着
  const caps = capsOf(tableEl);
  if (caps.editor) caps.editor.release();

  document.body.classList.add('nt-range-mode');
  try { tableEl.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }

  // 长按之后手指一滑，浏览器会把它当成滚动（touch-action 在手指按下那一刻
  // 就已经定好了，这时候再改 body 的 touch-action 不一定生效）。
  // 直接吃掉 touchmove 的默认行为，滚动不会开始，pointermove 才能一直送来。
  const stopScroll = (e) => { if (e.cancelable) e.preventDefault(); };
  tableEl.addEventListener('touchmove', stopScroll, { passive: false });
  sel = { anchorR: hit.r, anchorC: hit.c, focusR: hit.r, focusC: hit.c, tableEl, stopScroll };

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
    tableEl.removeEventListener('touchmove', stopScroll);
    if (sel) sel.stopScroll = null;
    try { tableEl.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }

    document.body.classList.remove('nt-range-mode');
    showBar(selRect(), barState(tableEl));
  };

  tableEl.addEventListener('pointermove', onMove);
  tableEl.addEventListener('pointerup', finish);
  tableEl.addEventListener('pointercancel', finish);

  // 注意：这里**不能** showBar —— 菜单会盖在选区旁边，拖动时
  // elementFromPoint 命中的是菜单而不是格子，框选就再也扩不出去
  // （2026-11-09 实测：菜单在起点右下方，手指划到它就停住）。
  // 菜单只在松手后出现。
}

/** 选区的屏幕矩形：菜单就贴在它上方（放不下翻到下方） */
function selRect() {
  if (!sel) return null;
  const { r1, r2, c1, c2 } = bounds();
  const rows = bodyRows(sel.tableEl);
  const first = rows[r1] && rows[r1].children[c1];
  const last = rows[r2] && rows[r2].children[c2];
  if (!first || !last) return null;
  const a = first.getBoundingClientRect();
  const b = last.getBoundingClientRect();
  const head = sel.tableEl.querySelector('thead');
  return {
    top: Math.min(a.top, b.top),
    bottom: Math.max(a.bottom, b.bottom),
    left: Math.min(a.left, b.left),
    right: Math.max(a.right, b.right),
    // 表头底边：菜单别飘到工具条上去（第一行选区上方没空间时改放选区下面）
    tableTop: head ? head.getBoundingClientRect().bottom : sel.tableEl.getBoundingClientRect().top,
  };
}

/** 工具条的状态：能力来自这张表自己，不是全局 */
function barState(tableEl) {
  const caps = capsOf(tableEl);
  return {
    hasClip: !!clip,
    canPaste: caps.paste !== 'off',
    canDelete: !!caps.onDeleteRows,
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
    // 这个守卫必须一起撤：残留在表上会让整张表拖不动（touchmove 一直被吃掉）
    if (sel.stopScroll) sel.tableEl.removeEventListener('touchmove', sel.stopScroll);
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
  capsOf(sel.tableEl).notice(`已复制 ${clip.length} 行 × ${clip[0] ? clip[0].length : 0} 格`);
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
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { /* 重渲染后旧节点可能已脱离 */ }
  }

  clearSelection();
  caps.notice(blocked
    ? `粘贴 ${inputs.length} 格，另有 ${blocked} 格是只读列没写`
    : `粘贴 ${inputs.length} 格`);
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
