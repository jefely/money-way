// 界面：流水表的单元格选中 / 编辑（Excel 式）

import { placeCaret } from './cell-caret.js';
import { createCellProxy } from './cell-proxy.js';
import { adjacentEditable, ensureVisible, moveBy, nextField, cellInfo, cellInfoResolve } from './cell-nav.js';
/**
 * 单元格编辑
 * 层：第五层 · UI
 *
 * 用户 2026-11-09 定的交互（照 Excel）：
 *   单击   → 选中这一格：整格描边、右下角手柄；**不显示光标**，键盘照常弹出；
 *            直接打字就是整格替换，回车填入。
 *   再单击 → 取消选中，键盘收起。
 *   双击   → 才进编辑：光标落在点下去的位置，可以精确增删。
 *   方向键 → 选中态下移动格子；编辑态下交给浏览器移光标。
 *   Tab    → 下一格（跳过只读行）；Shift+Tab 上一格。
 *   Esc    → 编辑态：还原本次改动、退回选中态；选中态：取消选中。
 *
 * 焦点模型（v1.502）：
 *   · 选中态：可见 input **从不 focus**，键盘由隐藏的 cell-proxy 持有。
 *     这样浏览器没有机会画光标，也不会弹系统「粘贴 / 全选 / 翻译」菜单；
 *     隐藏格的 input 事件镜像回可见格。
 *   · 编辑态（双击）：焦点交回可见 input，光标/系统选字都恢复正常。
 *
 * 职责边界：
 *   · 本文件：选中、光标、类名、方向键 / Tab / Enter / Esc、隐藏格镜像。
 *   · row-editor.js：输入解析（简码 / 日期 / 金额）、提交、建单。
 *   · cell-select.js：选区矩形 / 手柄 / 长按菜单。
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
  const table = tbody.closest('table');
  if (table) table.classList.add('nt-excel-grid');

  /** { td, input, mode:'selected'|'editing', original } */
  let active = null;
  /** pointerdown 那一刻的快照：这一格按下前是否已选中 */
  let down = null;
  let lastClick = { td: null, at: 0 };
  let timer = 0;

  const cellOf = (el) => (el && el.closest ? el.closest('td.nt-cell') : null);
  const inputOf = (td) => (td ? td.querySelector('input.nt-cell-input') : null);
  const usable = (input) => !!input && !input.disabled && !input.readOnly;

  // 选中态由隐藏格持焦点：可见 input 从不 focus → 没有光标、没有系统选字菜单
  const proxy = createCellProxy(onProxyInput, onProxyKey);

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
    active = { td, input, mode: 'selected', original: input.value };
    paint();
    if (o.onSelect) o.onSelect(td);
    ensureVisible(tbody, td);
  }

  function focusProxy() {
    if (usable(active.input)) proxy.focus(active.input);
    else proxy.blur();
  }

  /** 点中一格：选中它并把键盘拱起来（焦点在隐藏格上） */
  function focusCell(td) {
    const input = inputOf(td);
    if (!input) return;
    if (!active || active.td !== td) selectCell(td, input);
    focusProxy();
  }

  function enterEditing(td, x, y) {
    const input = inputOf(td);
    if (!usable(input)) return;
    clearTimeout(timer);
    proxy.blur();
    if (document.activeElement !== input) {
      try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    }
    // focusin 会把 active 重置成 selected，所以设 editing 要放在 focus 之后
    if (!active || active.td !== td) selectCell(td, input);
    active.original = active.mode === 'editing' ? active.original : input.value;
    active.mode = 'editing';
    paint();
    placeCaret(input, x, y);
  }

  /* ---------- 焦点：编辑态是可见 input，选中态是隐藏格 ---------- */

  tbody.addEventListener('focusin', (ev) => {
    const input = ev.target;
    if (!input || !input.matches || !input.matches('input.nt-cell-input')) return;
    // 序（新行可编辑）和标了 data-grid="off" 的格子保持原生
    if (input.dataset.grid === 'off' || input.closest('td.nt-cell-seq')) return;
    selectCell(cellOf(input), input);
  });

  tbody.addEventListener('focusout', (ev) => {
    if (ev.__ntSynthetic) return;
    if (!active || !active.td.contains(ev.target)) return;
    // 等这一轮焦点落定：选中态的键盘焦点在 proxy 上，不该把选区清掉
    setTimeout(() => {
      if (proxy.isFocused()) return;
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
    down = td ? { td, wasSelected: !!(active && active.td === td), wasFocused: !!(active && active.td === td && (document.activeElement === proxy.el || document.activeElement === active.input)) } : null;
    clearTimeout(timer);
  });

  tbody.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('button, .nt-fixed-box, .nt-col-handle')) return;
    let td = cellOf(ev.target);
    // 点行号（序）：整行选中并直接弹菜单；新行的序是输入框，保持原生
    if (td && td.classList.contains('nt-cell-seq')) {
      if (td.querySelector('input')) return;
      clearTimeout(timer);
      const id = td.parentElement.dataset.id;
      release();
      const live = id ? [...tbody.children].find((r) => r.dataset.id === id) : td.parentElement;
      if (live && o.onRowSelect) o.onRowSelect(live);
      return;
    }
    if (!td || !inputOf(td) || inputOf(td).dataset.grid === 'off') return;

    const now = Date.now();
    const isDouble = ev.detail >= 2 || (lastClick.td === td && now - lastClick.at <= DBL_MS);
    lastClick = { td, at: now };

    if (isDouble) {
      clearTimeout(timer);
      enterEditing(td, ev.clientX, ev.clientY);
      return;
    }

    // 只有「这一格已选中、而且键盘焦点就在它上面」时，再点一次才是取消选中。
    // 菜单 / 拖手柄之后选区还在但键盘已收起，这时点它是「继续输入」，不能取消。
    const sameSelected = !!(down && down.td === td && down.wasSelected && down.wasFocused);
    if (!sameSelected) {
      // 换格之前先把上一格收尾；页面若因此重绘，按行 id + 字段找回被点的那一格
      if (active && active.td !== td) {
        const target = td;
        const info = cellInfo(tbody, target);
        leaveRow(td);
        leaveCell();
        td = cellInfoResolve(tbody, info) || target;
      }
      focusCell(td);
    }

    // 再点一次 = 取消选中。推迟一下，双击的第二下会把它取消。
    if (sameSelected && active && active.td === td && active.mode === 'selected') {
      timer = setTimeout(() => {
        if (active && active.td === td && active.mode === 'selected') release();
      }, DESELECT_MS);
    }
  });

  /* ---------- 隐藏格 → 可见格（打字 / 点候选账户） ---------- */

  function onProxyInput(value) {
    if (!active || active.mode !== 'selected') return;
    const input = active.input;
    if (input.value === value) return;
    input.value = value;
    // 走一遍 input：row-editor 提交 / 草稿捕获 / 候选气泡
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // row-editor 可能把值改掉（日期里单独一个「:」→ 今天），同步回隐藏格
    if (input.value !== value) proxy.setValue(input.value);
  }

  tbody.addEventListener('nt-cell-value', (ev) => {
    if (!active || active.mode !== 'selected' || ev.target !== active.input) return;
    proxy.setValue(active.input.value);
  });

  /* ---------- 键盘：Enter / Tab / Esc / 方向键 ---------- */

  function leaveRow(nextTd) {
    if (!o.onLeaveRow || !active) return;
    const tr = active.td.parentElement;
    if (!nextTd || nextTd.parentElement !== tr) o.onLeaveRow(tr);
  }

  function leaveCell() {
    const a = active;
    if (!a) return;
    if (a.mode === 'editing') {
      // 真失焦：row-editor 会解析账户 / 格式化金额 / 空行建单
      try { a.input.blur(); } catch (e) { /* 忽略 */ }
      return;
    }
    // 设置页 / 固定页：值靠 change 落库，不补合成 focusout
    if (o.nativeCommit) {
      a.input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    // 选中态 input 本来就没焦点，补一个合成 focusout 走同一套收尾
    const ev = new FocusEvent('focusout', { bubbles: true });
    ev.__ntSynthetic = true;
    try { a.input.dispatchEvent(ev); } catch (e) { /* 忽略 */ }
  }

  function moveEnter() {
    if (!active) return;
    if (o.enterTab) return moveTab(1);
    // 键盘的「下一个」/ 回车：同一行往右，备注之后接下一行的转出节点
    const td = nextField(tbody, active.td);
    const info = td && cellInfo(tbody, td);
    leaveRow(td);
    leaveCell();
    const live = info && cellInfoResolve(tbody, info);
    if (live) focusCell(live); else proxy.blur();
  }

  function moveTab(dir) {
    if (!active) return;
    const next = adjacentEditable(tbody, active.input, dir);
    const target = next ? next.closest('td') : null;
    const info = target && cellInfo(tbody, target);
    leaveRow(target);
    leaveCell();
    const live = info && cellInfoResolve(tbody, info);
    if (live) focusCell(live); else proxy.blur();
  }

  function moveArrow(dx, dy) {
    const td = moveBy(tbody, active.td, dx, dy);
    const info = td && cellInfo(tbody, td);
    leaveRow(td);
    leaveCell();
    const live = info && cellInfoResolve(tbody, info);
    if (live) focusCell(live);
  }

  function onProxyKey(ev) {
    if (!active || active.mode !== 'selected') return;
    if (ev.isComposing || ev.keyCode === 229) return;
    // 隐藏格不复制旧值：空白隐藏格里的退格/删除 = 清掉整格（整格替换语义）
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && !proxy.el.value) {
      const input = active.input;
      if (input.value) {
        ev.preventDefault();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    if (ev.key === 'Enter') { ev.preventDefault(); moveEnter(); return; }
    if (ev.key === 'Tab') { ev.preventDefault(); moveTab(ev.shiftKey ? -1 : 1); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); release(); return; }
    const dir = ARROWS[ev.key];
    if (dir) { ev.preventDefault(); moveArrow(dir[0], dir[1]); }
  }

  tbody.addEventListener('keydown', (ev) => {
    if (!active || ev.target !== active.input) return;
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === 'Escape') { ev.preventDefault(); escapeEditing(); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); moveEnter(); return; }
    if (ev.key === 'Tab') { ev.preventDefault(); moveTab(ev.shiftKey ? -1 : 1); return; }
    if (ev.key === 'F2') {
      ev.preventDefault();
      const rect = active.input.getBoundingClientRect();
      enterEditing(active.td, rect.right, rect.top + rect.height / 2);
      const input = active.input;
      const len = String(input.value || '').length;
      try { input.setSelectionRange(len, len); } catch (e) { /* 忽略 */ }
    }
  });

  /* ---------- Esc / 取消选中 ---------- */

  function escapeEditing() {
    if (!active) return;
    if (active.mode !== 'editing') { release(); return; }
    const input = active.input;
    if (input.value !== active.original) {
      input.value = active.original;
      // 走一遍 input 事件：row-editor 会把还原值写回 state / 草稿。
      // 已有行的 from/to 是失焦才提交的（输入过程中 state 没被改过），
      // 不必派发 —— 派发只会把候选气泡弹出来。
      const account = input.dataset.field === 'from' || input.dataset.field === 'to';
      if (!account || (input.closest('tr') && input.closest('tr').dataset.new === '1')) input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const td = active.td;
    try { input.blur(); } catch (e) { /* 忽略 */ }
    selectCell(td, input);
    focusProxy();
  }

  function release() {
    clearTimeout(timer);
    if (active && o.onLeaveRow) o.onLeaveRow(active.td.parentElement);
    // 取消选中前也要收尾：简码 → 节点名、金额格式化、空行建单
    leaveCell();
    proxy.blur();
    if (active && document.activeElement === active.input) {
      try { active.input.blur(); } catch (e) { /* 忽略 */ }
    }
    clear();
    if (o.onRelease) o.onRelease();
  }

  /** 只收键盘，不收选区：长按菜单 / 拖手柄时用 */
  function blurInput() {
    proxy.blur();
    if (active && document.activeElement === active.input) {
      try { active.input.blur(); } catch (e) { /* 忽略 */ }
    }
  }

  /** 菜单「编辑」：选中这一格并进入编辑，光标放末尾 */
  function editAt(td) {
    const input = inputOf(td);
    if (!usable(input)) return false;
    proxy.blur();
    if (!active || active.td !== td) selectCell(td, input);
    active.original = input.value;
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    active.mode = 'editing';
    paint();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* 忽略 */ }
    if (o.onSelect) o.onSelect(td);
    ensureVisible(tbody, td);
    return true;
  }

  /** 表格重画前清掉状态：旧 DOM 已经不在，类名和引用都不能留 */
  function reset() {
    clearTimeout(timer);
    proxy.blur();
    active = null;
    down = null;
    lastClick = { td: null, at: 0 };
    paint();
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (active) ensureVisible(tbody, active.td);
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
