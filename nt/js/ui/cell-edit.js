// 界面：流水表的单元格编辑（Excel 式 · 一套状态机）
/**
 * 单元格编辑
 * 层：第五层 · UI
 *
 * 用户 2026-11-09 定的交互，照 Excel：
 *
 *   单击   → **选中**这一格：内容全选、键盘弹出、光标不闪（caret 透明）。
 *            直接打字就是替换，回车填入并下移一行。
 *   再单击 → 取消选中、收起键盘。
 *   双击   → 进入编辑：光标落在点下去的那个字符，可以精确删/插。
 *   点「序」列 → 整行选中（行选择器），不弹键盘。
 *
 * 状态只有三个，别再加：`idle`（没有 active）、`selected`（有 active、无 EDITING 类）、
 * `editing`（有 active、有 EDITING 类）。判断「是不是再点一次」只看 **pointerdown
 * 那一刻这格有没有选中**（快照），不看 active —— 回车下移会把高亮搬走，
 * 拿 active 比对就会把「点回来」误判成「取消」。
 *
 * 职责边界：
 *   · 本文件：选中、光标、类名、行选中。
 *   · row-editor.js：输入解析（简码 / 日期 / 金额）、提交、建单。
 *   · cell-range.js：长按框选与菜单，起手时调本模块的 release()。
 */

const SEL = 'nt-cell-sel';
const EDIT = 'nt-cell-editing';
const ROW = 'nt-row-sel';
const DOUBLE_MS = 300;

/** 单击位置 → 字符下标（按字体逐字测量；中文全角也准） */
let measure = null;
function caretIndex(input, clientX) {
  const rect = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  const pad = parseFloat(style.paddingLeft) || 0;
  const target = clientX - rect.left - pad + (input.scrollLeft || 0);
  const text = String(input.value || '');
  if (!measure) measure = document.createElement('canvas').getContext('2d');
  if (measure) {
    measure.font = style.font || (style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily);
    let acc = 0;
    for (let i = 0; i < text.length; i += 1) {
      const w = measure.measureText(text[i]).width;
      if (target < acc + w / 2) return i;
      acc += w;
    }
  }
  return text.length;
}

/**
 * @param {HTMLElement} tbody 表格体（行会被重建，事件必须挂在它上面）
 * @param {{onEnterRow?:Function}} [h]
 */
export function bindCellEdit(tbody) {
  let active = null;          // { td, input }
  let down = null;            // { td, wasSelected } —— pointerdown 那一刻的快照
  let lastClickAt = 0;

  const cell = (node) => (node && node.closest ? node.closest('td.nt-cell') : null);
  const inputOf = (td) => (td ? td.querySelector('input.nt-cell-input') : null);
  const usable = (input) => !!input && !input.readOnly && !input.disabled;

  function clearCells() {
    for (const td of tbody.querySelectorAll('.' + SEL)) td.classList.remove(SEL, EDIT);
    active = null;
  }

  function clearRows() {
    for (const tr of tbody.querySelectorAll('.' + ROW)) tr.classList.remove(ROW);
  }

  /** 选中一格；editing = true 时进编辑（光标显形） */
  function select(td, input, editing, clientX) {
    clearCells();
    clearRows();
    active = { td, input };
    td.classList.add(SEL);
    if (editing) td.classList.add(EDIT);
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    if (editing) {
      const i = caretIndex(input, clientX || 0);
      try { input.setSelectionRange(i, i); } catch (e) { /* 忽略 */ }
    } else {
      try { input.select(); } catch (e) { /* 忽略 */ }
    }
  }

  /* ---------- 单击 / 双击 ---------- */

  tbody.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest && ev.target.closest('button, .nt-fixed-box, .nt-col-handle')) {
      down = null;
      return;
    }
    const td = cell(ev.target);
    if (!td) { down = null; return; }
    down = { td, wasSelected: td.classList.contains(SEL) };
    // 焦点交给 click 决定：否则浏览器先 focus → focusin 先跑 → click 再判一次，
    // 就成了「点一下变取消」。这一句是整套交互能成立的前提。
    ev.preventDefault();
  }, true);

  tbody.addEventListener('click', (ev) => {
    const at = Date.now();
    const gap = at - lastClickAt;
    lastClickAt = at;
    if (gap < DOUBLE_MS) return;                 // 双击的第二下
    if (ev.target.closest && ev.target.closest('button, .nt-fixed-box, .nt-col-handle')) return;

    const td = cell(ev.target);
    if (!td) return;

    // 「序」列 = 行选择器
    if (td.classList.contains('nt-cell-seq')) {
      const tr = td.closest('tr');
      const was = !!(tr && tr.classList.contains(ROW));
      clearRows();
      clearCells();
      if (tr && !was) tr.classList.add(ROW);
      return;
    }

    const input = inputOf(td);
    if (!usable(input)) return;

    if (down && down.td === td && down.wasSelected) {   // 再点一次 = 取消
      clearCells();
      input.blur();
      return;
    }
    select(td, input, false);
  }, true);

  tbody.addEventListener('dblclick', (ev) => {
    lastClickAt = 0;                             // 双击之后的第一下单击不该被吞掉
    if (ev.target.closest && ev.target.closest('button, .nt-fixed-box')) return;
    const td = cell(ev.target);
    if (!td) return;
    const input = inputOf(td);
    if (!usable(input)) return;
    ev.preventDefault();
    select(td, input, true, ev.clientX);
  });

  /* ---------- 焦点跟随（回车下移 / Tab） ---------- */

  tbody.addEventListener('focusin', (ev) => {
    const input = ev.target;
    if (!input || !input.matches || !input.matches('input.nt-cell-input')) return;
    const td = cell(input);
    if (!td) return;
    for (const old of tbody.querySelectorAll('.' + SEL)) {
      if (old !== td) old.classList.remove(SEL, EDIT);
    }
    td.classList.add(SEL);
  });

  /* ---------- 键盘 ---------- */

  tbody.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !active) return;
    ev.preventDefault();
    const input = active.input;
    clearCells();
    input.blur();
  });

  /* ---------- 给外面用 ---------- */

  /** 框选 / 菜单起手时调用：把选中框收掉，键盘也收掉 */
  function release() {
    clearCells();
    clearRows();
    const el = document.activeElement;
    if (el && el.blur && tbody.contains(el)) el.blur();
  }

  /** 菜单「编辑」按钮：选中这一格并进编辑，光标放末尾 */
  function editAt(td) {
    const input = inputOf(td);
    if (!usable(input)) return false;
    clearCells();
    clearRows();
    active = { td, input };
    td.classList.add(SEL, EDIT);
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    const len = String(input.value || '').length;
    try { input.setSelectionRange(len, len); } catch (e) { /* 忽略 */ }
    return true;
  }

  return { release, editAt, active: () => active };
}
