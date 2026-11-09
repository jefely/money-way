// 界面：流水表的单元格光标（Excel 式）
/**
 * 单元格光标
 * 层：第五层 · UI
 *
 * 用户 2026-11-09 定的交互（照 Excel，不自己发明）：
 *   · **单击** = 选中这一格（内容全选，键盘已打开），**不进入编辑**；
 *     直接打字就是替换，回车填入并下移一行。
 *   · **再单击同一格** = 取消选中。
 *   · **双击** = 进入编辑，光标落在点下去的位置，可以精确删字/插字。
 *   · 框选（长按拖动）由 cell-range.js 负责，两边互斥：一启动就清掉光标。
 *
 * 为什么不是「选中后 readOnly、按键进缓冲」：中文输入法在只读输入框里不工作，
 * 账户名、备注全靠 IME。全选 + 直接打字同样是「选中替换」，而且 IME 正常。
 */

/** 测量文字宽度用（双击定位光标） */
let measure = null;

/** 点击位置 → 字符下标（等宽近似：逐字累加，过半即算落在它前面） */
function caretIndex(input, clientX) {
  const rect = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  const pad = parseFloat(style.paddingLeft) || 0;
  const target = clientX - rect.left - pad + (input.scrollLeft || 0);
  if (!measure) measure = document.createElement('canvas').getContext('2d');
  if (measure) {
    measure.font = style.font || (style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily);
    const text = String(input.value || '');
    let acc = 0;
    for (let i = 0; i < text.length; i += 1) {
      const w = measure.measureText(text[i]).width;
      if (target < acc + w / 2) return i;
      acc += w;
    }
  }
  return String(input.value || '').length;
}

/**
 * @param {HTMLElement} tbody 表格体（每次渲染重建行，事件必须挂在它上面）
 * @param {{onSelect?:(td:HTMLElement, input:HTMLInputElement)=>void}} [h]
 */
export function bindCellCursor(tbody, h) {
  const api = h || {};
  let cur = null;                     // { td, input }

  function clear() {
    for (const td of tbody.querySelectorAll('.nt-cell-sel')) {
      td.classList.remove('nt-cell-sel', 'nt-cell-editing');
    }
    cur = null;
  }

  function clearRowSel() {
    for (const tr of tbody.querySelectorAll('.nt-row-sel')) tr.classList.remove('nt-row-sel');
  }

  function select(td, input) {
    clear();
    cur = { td, input };
    td.classList.add('nt-cell-sel');
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    try { input.select(); } catch (e) { /* 忽略 */ }
    if (typeof api.onSelect === 'function') api.onSelect(td, input);
  }

  let lastClickAt = 0;
  let downTd = null;
  let downWasSel = false;      // 按下那一刻，这格是不是已经选中

  tbody.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest && ev.target.closest('button, .nt-fixed-box, .nt-col-handle')) return;
    downTd = ev.target.closest ? ev.target.closest('td.nt-cell') : null;
    downWasSel = !!(downTd && downTd.classList.contains('nt-cell-sel'));
    if (downTd) ev.preventDefault();   // 焦点交给 click，不让浏览器先抢一步
  }, true);

  /** 单击：选中 / 取消。捕获阶段跑，先于单元格自己的 click 逻辑 */
  tbody.addEventListener('click', (ev) => {
    const at = Date.now();
    const gap = at - lastClickAt;
    lastClickAt = at;
    if (gap < 300) return;                           // 两次点击挨太近 = 双击的第二下
    if (ev.target.closest('button, .nt-fixed-box, .nt-col-handle')) return;
    const td = ev.target.closest('td.nt-cell');
    if (!td) return;

    // 「序」列是行选择器：点它选中整行，不弹键盘
    if (td.classList.contains('nt-cell-seq')) {
      const tr = td.closest('tr');
      const was = !!(tr && tr.classList.contains('nt-row-sel'));
      clearRowSel();
      clear();
      if (tr && !was) tr.classList.add('nt-row-sel');
      return;
    }

    const input = td.querySelector('input.nt-cell-input');
    if (!input || input.readOnly || input.disabled) return;
    clearRowSel();                                  // 选单元格 = 取消整行选中

    // 「再点一次取消」看的是**按下那一刻**这格是不是已经选中：
    // 不能用 cur，因为焦点可能已经被回车搬到别的格了。
    if (downTd === td && downWasSel) {
      clear();
      input.blur();
      return;
    }
    select(td, input);
  }, true);

  /** 双击：进入编辑，光标按点下去的位置 */
  tbody.addEventListener('dblclick', (ev) => {
    lastClickAt = 0;              // 双击之后的第一下单击不该被当成「第二下」吞掉
    if (ev.target.closest('button, .nt-fixed-box')) return;
    const td = ev.target.closest('td.nt-cell');
    if (!td) return;
    const input = td.querySelector('input.nt-cell-input');
    if (!input || input.readOnly || input.disabled) return;
    ev.preventDefault();
    clear();                                       // 双击永远是「这一格被选中 + 进编辑」
    cur = { td, input };
    td.classList.add('nt-cell-sel', 'nt-cell-editing');
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    const i = caretIndex(input, ev.clientX);
    try { input.setSelectionRange(i, i); } catch (e) { /* 忽略 */ }
  });

  /** 焦点跑到别的格（回车下移 / Tab）：把高亮搬过去，但**不改 cur** ——
      否则「单击 → 焦点先到 → click 再判一次」会互相打架，变成点一下取消。 */
  tbody.addEventListener('focusin', (ev) => {
    const input = ev.target;
    if (!input || !input.matches || !input.matches('input.nt-cell-input')) return;
    const td = input.closest('td.nt-cell');
    if (!td) return;
    for (const old of tbody.querySelectorAll('.nt-cell-sel')) {
      if (old !== td) old.classList.remove('nt-cell-sel');
    }
    td.classList.add('nt-cell-sel');
  });

  /** Esc：取消选中（回车已经在 row-editor 里处理成「提交 + 下一行」） */
  tbody.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !cur) return;
    ev.preventDefault();
    const input = cur.input;
    clear();
    input.blur();
  });

  /** 框选一启动就互斥：让框选那边调它 */
  function release() {
    clear();
  }

  return { release, current: () => (cur ? cur.input : null) };
}
