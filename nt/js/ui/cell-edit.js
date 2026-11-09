// 界面：流水表的单元格选中 / 编辑（Excel 式）

import { placeCaret } from './cell-caret.js';
/**
 * 单元格编辑
 * 层：第五层 · UI
 *
 * 用户 2026-11-09 定的交互（照 Excel）：
 *   单击   → 选中这一格：整格描边、内容全选、**不显示光标**，但键盘照常弹出；
 *            直接打字就是替换，回车填入（回车下移由 row-editor 负责）。
 *   再单击 → 取消选中，键盘收起。
 *   双击   → 进入编辑：光标落在点下去的位置，可以精确增删。
 *   方向键 → 选中态下移动格子；编辑态下交给浏览器移光标。
 *   Tab    → 下一格（跳过只读行）；Shift+Tab 上一格。
 *   Esc    → 编辑态：还原本次改动、退回选中态；选中态：取消选中。
 *
 * 为什么不 preventDefault pointerdown（v1.493–v1.497 的教训）：
 * 上一版在 pointerdown 里 preventDefault 抢焦点，再在 click 里手动 focus。
 * 手机上 click 一旦被滚动 / 长按吃掉，格子就点不动；而 :hover 又把整行染色，
 * 看起来像「选中了一整行」。现在焦点全部交给浏览器原生行为，本文件只加类名、
 * 处理「再点一次 / 双击 / 键盘」，不跟原生抢任何一步。
 *
 * 职责边界：
 *   · 本文件：选中、光标、类名、方向键 / Tab / Esc。
 *   · row-editor.js：输入解析（简码 / 日期 / 金额）、提交、建单、回车下移。
 *   · cell-range.js：长按框选；起手时调本模块的 release()。
 */

const SEL = 'nt-cell-sel';
const EDIT = 'nt-cell-editing';
/** 双击兜底窗口：有的触屏浏览器不给 click.detail=2 */
const DBL_MS = 340;
/** 「再点一次取消选中」的延迟：留出双击第二下的时间 */
const DESELECT_MS = 340;

const ARROWS = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

/** 每个 tbody 一个编辑器（mountFlow 可能被重复调用） */
const editors = new WeakMap();

export function bindCellEdit(tbody, opts) {
  if (!tbody) return null;
  if (editors.has(tbody)) return editors.get(tbody);
  const o = opts || {};

  /** { td, input, mode:'selected'|'editing', original } */
  let active = null;
  /** pointerdown 那一刻的快照：这一格按下前是否已选中 */
  let down = null;
  let lastClick = { td: null, at: 0 };
  let timer = 0;

  const cellOf = (el) => (el && el.closest ? el.closest('td.nt-cell') : null);
  const inputOf = (td) => (td ? td.querySelector('input.nt-cell-input') : null);
  const usable = (input) => !!input && !input.disabled && !input.readOnly;

  /* ---------- 选中 / 编辑的落点 ---------- */

  function paint() {
    for (const td of tbody.querySelectorAll('.' + SEL)) td.classList.remove(SEL);
    for (const td of tbody.querySelectorAll('.' + EDIT)) td.classList.remove(EDIT);
    if (!active) return;
    active.td.classList.add(SEL);
    if (active.mode === 'editing') active.td.classList.add(EDIT);
  }

  function clear() {
    active = null;
    paint();
  }

  function selectCell(td, input) {
    if (!td || !input) return;
    clearTimeout(timer);
    // 不调 input.select()：那会画出文字选中框 / 系统选中手柄，看起来像进了编辑。
    // 「打字即替换」交给 beforeinput 处理（见下面的监听）。
    active = { td, input, mode: 'selected', original: input.value, replaced: false };
    paint();
    try { input.setSelectionRange(0, 0); } catch (e) { /* 只读格也能放光标 */ }
    if (o.onSelect) o.onSelect(td);
    ensureVisible(td);
  }

  function enterEditing(td, x, y) {
    const input = inputOf(td);
    if (!usable(input)) return;
    clearTimeout(timer);
    // 先拿焦点：输入框 pointer-events:none 之后，点 td 会把焦点从 input 上带走，
    // 这里的 focus 会触发 focusin → selectCell 把 active 重置成 selected。
    // 所以 focus 必须在「设 editing」之前，否则双击刚进的编辑态立刻被覆盖。
    if (document.activeElement !== input) {
      try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    }
    if (!active || active.td !== td) selectCell(td, input);
    active.original = input.value;
    active.mode = 'editing';
    paint();
    placeCaret(input, x, y);
  }

  /** 点中一格：选中它并把键盘拱起来（输入框 pointer-events:none，得手动 focus） */
  function focusCell(td) {
    const input = inputOf(td);
    if (!input) return;
    if (usable(input)) {
      if (document.activeElement !== input) {
        try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
      }
    } else if (active && document.activeElement === active.input) {
      // 只读格（未来分期 / 期初日期）不聚焦，但键盘要收掉
      try { active.input.blur(); } catch (e) { /* 忽略 */ }
    }
    if (!active || active.td !== td) selectCell(td, input);
  }

  /* ---------- 焦点：选中态的唯一真相 ---------- */

  tbody.addEventListener('focusin', (ev) => {
    const input = ev.target;
    if (!input || !input.matches || !input.matches('input.nt-cell-input')) return;
    selectCell(cellOf(input), input);
  });

  tbody.addEventListener('focusout', (ev) => {
    if (!active || !active.td.contains(ev.target)) return;
    // 等这一轮焦点落定：点另一格时 activeElement 已经换了，不该清掉新选中
    setTimeout(() => {
      const el = document.activeElement;
      if (el && tbody.contains(el) && el.matches && el.matches('input.nt-cell-input')) return;
      clear();
    }, 0);
  });

  /* ---------- 单击选中 / 再点取消 / 双击编辑 ---------- */

  tbody.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) { down = null; return; }
    if (ev.target.closest && ev.target.closest('button, .nt-fixed-box, .nt-col-handle')) {
      down = null;
      return;
    }
    const td = cellOf(ev.target);
    down = td ? { td, wasSelected: !!(active && active.td === td) } : null;
    clearTimeout(timer);
  });

  tbody.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('button, .nt-fixed-box, .nt-col-handle')) return;
    const td = cellOf(ev.target);
    if (!td || !inputOf(td)) return;

    const now = Date.now();
    const isDouble = ev.detail >= 2
      || (lastClick.td === td && now - lastClick.at <= DBL_MS);
    lastClick = { td, at: now };

    if (isDouble) {
      clearTimeout(timer);
      enterEditing(td, ev.clientX, ev.clientY);
      return;
    }

    // 点已经选中的格子（再点取消 / 双击的第一下）：mousedown 已经把输入框 blur 了，
    // 不要再把它 focus 回来，否则键盘会闪一下再收起。
    const sameSelected = !!(down && down.td === td && down.wasSelected);
    if (!sameSelected) focusCell(td);

    // 再点一次 = 取消选中。推迟一下，双击的第二下会把它取消。
    if (sameSelected && active && active.td === td && active.mode === 'selected') {
      timer = setTimeout(() => {
        if (active && active.td === td && active.mode === 'selected') release();
      }, DESELECT_MS);
    }
  });

  /* ---------- 选中态打字 = 整格替换（不进编辑、不显示光标） ---------- */

  // 不在选中态做 input.select()（会有文字选中框 / 系统手柄）。第一次输入前
  // 先把旧值清掉，浏览器插进来的字就是新内容；之后正常追加。
  tbody.addEventListener('beforeinput', (ev) => {
    if (!active || ev.target !== active.input || active.mode !== 'selected') return;
    const type = String(ev.inputType || '');
    if (!active.replaced && type.startsWith('insert')) {
      active.replaced = true;
      active.input.value = '';
    } else if (!active.replaced && type.startsWith('delete')) {
      ev.preventDefault();
      active.replaced = true;
      active.input.value = '';
      active.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  // 中文输入法：compositionstart 时清旧值，composition 的字就是替换后的内容
  tbody.addEventListener('compositionstart', (ev) => {
    if (!active || ev.target !== active.input || active.mode !== 'selected') return;
    if (active.replaced) return;
    active.replaced = true;
    active.input.value = '';
  });

  /* ---------- 键盘：Esc / Tab / F2 / 方向键 ---------- */

  tbody.addEventListener('keydown', (ev) => {
    if (!active || ev.target !== active.input) return;
    if (ev.isComposing || ev.keyCode === 229) return;

    if (ev.key === 'Escape') {
      ev.preventDefault();
      escape();
      return;
    }
    if (ev.key === 'Tab') {
      const next = adjacentInput(active.input, ev.shiftKey ? -1 : 1);
      // 走到头也不许 Tab 跳到「固定 / 删除」按钮上：停在最后一格
      ev.preventDefault();
      if (next) next.focus();
      return;
    }
    if (ev.key === 'F2') {
      ev.preventDefault();
      const rect = active.input.getBoundingClientRect();
      enterEditing(active.td, rect.right, rect.top + rect.height / 2);
      const input = active.input;
      const len = String(input.value || '').length;
      try { input.setSelectionRange(len, len); } catch (e) { /* 忽略 */ }
      return;
    }
    if (active.mode === 'selected' && ARROWS[ev.key]) {
      ev.preventDefault();
      moveCell(ARROWS[ev.key][0], ARROWS[ev.key][1]);
    }
  });

  function escape() {
    if (active.mode === 'editing') {
      const input = active.input;
      if (input.value !== active.original) {
        input.value = active.original;
        // 走一遍 input 事件：row-editor 会把还原值写回 state / 草稿。
        // 已有行的 from/to 是失焦才提交的（输入过程中 state 没被改过），
        // 不必派发 —— 派发只会把候选气泡弹出来。
        const field = input.dataset.field;
        const tr = input.closest('tr');
        const blank = tr && tr.dataset.new === '1';
        const account = field === 'from' || field === 'to';
        if (!account || blank) input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      try { input.setSelectionRange(0, 0); } catch (e) { /* 忽略 */ }
      active.mode = 'selected';
      active.replaced = false;
      paint();
      return;
    }
    release();
  }

  /* ---------- 取消选中（对外也用） ---------- */

  function release() {
    clearTimeout(timer);
    const input = active && active.input;
    if (input && document.activeElement === input) {
      try { input.blur(); } catch (e) { /* 忽略 */ }
    }
    clear();
    if (o.onRelease) o.onRelease();
  }

  /** 只收键盘，不收选区：长按菜单 / 拖手柄时用 */
  function blurInput() {
    if (!active) return;
    if (document.activeElement === active.input) {
      try { active.input.blur(); } catch (e) { /* 忽略 */ }
    }
  }

  /** 菜单「编辑」：选中这一格并进入编辑，光标放末尾 */
  function editAt(td) {
    const input = inputOf(td);
    if (!usable(input)) return false;
    if (!active || active.td !== td) {
      active = { td, input, mode: 'selected', original: input.value, replaced: false };
    }
    active.original = input.value;
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    active.mode = 'editing';
    paint();
    const len = String(input.value || '').length;
    try { input.setSelectionRange(len, len); } catch (e) { /* 忽略 */ }
    if (o.onSelect) o.onSelect(td);
    ensureVisible(td);
    return true;
  }

  /** 表格重画前清掉状态：旧 DOM 已经不在，类名和引用都不能留 */
  function reset() {
    clearTimeout(timer);
    active = null;
    down = null;
    lastClick = { td: null, at: 0 };
    paint();
  }

  /* ---------- 键盘移动 ---------- */

  function moveCell(dx, dy) {
    if (!active) return;
    const td = active.td;
    const tr = td.parentElement;
    if (!tr) return;

    if (dx) {
      const cells = [...tr.children].filter((c) => inputOf(c));
      const i = cells.indexOf(td);
      const next = cells[i + dx];
      if (next) { const inp = inputOf(next); if (inp) inp.focus(); }
      return;
    }

    const col = [...tr.children].indexOf(td);
    let row = dy < 0 ? tr.previousElementSibling : tr.nextElementSibling;
    while (row) {
      const cell = row.children[col];
      const inp = cell ? inputOf(cell) : null;
      if (inp) { inp.focus(); return; }
      row = dy < 0 ? row.previousElementSibling : row.nextElementSibling;
    }
  }

  /** Tab 顺序里跳过只读行（未来分期、期初的日期格） */
  function adjacentInput(from, dir) {
    const list = [...tbody.querySelectorAll('input.nt-cell-input')]
      .filter((el) => !el.disabled && !el.readOnly);
    const i = list.indexOf(from);
    if (i < 0) return null;
    return list[i + dir] || null;
  }

  /* ---------- 键盘弹出后把这一格留在可视区 ---------- */

  function ensureVisible(td) {
    const wrap = tbody.closest('.nt-tablewrap');
    if (!wrap) return;
    requestAnimationFrame(() => {
      if (!td.isConnected) return;
      const r = td.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      const table = tbody.closest('table');
      const head = table ? table.querySelector('thead') : null;
      const headH = head ? head.getBoundingClientRect().height : 0;
      const vv = window.visualViewport;
      const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const bottom = Math.min(wr.bottom, viewBottom) - 4;
      const top = wr.top + headH;
      if (r.bottom > bottom) wrap.scrollTop += r.bottom - bottom;
      else if (r.top < top) wrap.scrollTop -= top - r.top;
    });
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (active) ensureVisible(active.td);
    });
  }

  /* ---------- 点表格外面：取消选中（Safari 点按钮不移焦点，靠这条兜底） ---------- */

  document.addEventListener('pointerdown', (ev) => {
    if (!active) return;
    if (tbody.contains(ev.target)) return;
    if (ev.target.closest && ev.target.closest('.nt-range-bar, .nt-cell-menu, .nt-suggest')) return;
    release();
  });

  const api = {
    release,
    blurInput,
    editAt,
    reset,
    /** 当前选中格（诊断用；不暴露 DOM 引用给业务层） */
    active: () => (active ? { td: active.td, mode: active.mode } : null),
    isEditing: () => !!active && active.mode === 'editing',
  };
  editors.set(tbody, api);
  return api;
}
