// 界面：流水表格子的方向导航 / 留出可视区
/**
 * 表格导航小工具
 * 层：第五层 · UI
 *
 * 纯 DOM 几何，不碰 state、不碰业务；给 cell-edit 的键盘移动用。
 */

export function cellCoords(tbody, td) {
  const tr = td && td.parentElement;
  if (!tr || tr.parentElement !== tbody) return null;
  return { r: [...tbody.children].indexOf(tr), c: [...tr.children].indexOf(td) };
}

export function cellAt(tbody, r, c) {
  const tr = tbody.children[r];
  return tr ? tr.children[c] || null : null;
}

const inputIn = (td) => (td ? td.querySelector('input.nt-cell-input:not([data-grid="off"])') : null);

/** 方向键：返回目标 td（没有就 null） */
export function moveBy(tbody, td, dx, dy) {
  const p = cellCoords(tbody, td);
  if (!p) return null;

  if (dx) {
    const cells = [...td.parentElement.children].filter((c) => inputIn(c));
    return cells[cells.indexOf(td) + dx] || null;
  }

  let r = p.r + (dy < 0 ? -1 : 1);
  while (r >= 0 && r < tbody.children.length) {
    const next = cellAt(tbody, r, p.c);
    if (inputIn(next)) return next;
    r += dy < 0 ? -1 : 1;
  }
  return null;
}

/** Enter / 键盘「下一个」：同一行往右，走到备注后接下一行的转出节点 */
export function nextField(tbody, td) {
  const p = cellCoords(tbody, td);
  if (!p) return null;
  const tr = td.parentElement;

  for (let c = p.c + 1; c < tr.children.length; c += 1) {
    const inp = tr.children[c].querySelector('input.nt-cell-input');
    if (inp && !inp.readOnly && !inp.disabled) return tr.children[c];
  }

  // 到备注了：下一行的「转出节点」（不是下一行的日期）
  for (let r = p.r + 1; r < tbody.children.length; r += 1) {
    const from = tbody.children[r].querySelector('input[data-field="from"]');
    if (from && !from.readOnly && !from.disabled) return from.closest('td');
  }
  return null;
}

/** Tab：DOM 顺序里的下一 / 上一可编辑格（跳过只读、禁用） */
export function adjacentEditable(tbody, input, dir) {
  const list = [...tbody.querySelectorAll('input.nt-cell-input')]
    .filter((el) => !el.disabled && !el.readOnly && el.dataset.grid !== 'off' && !el.closest('td.nt-cell-seq'));
  const i = list.indexOf(input);
  if (i < 0) return null;
  return list[i + dir] || null;
}

/** 提交/重绘前记下目标格的行 id / 字段 / 月份 / 行号，重绘后据此找回 */
export function cellInfo(tbody, td) {
  const tr = td && td.parentElement;
  const inp = td && td.querySelector('input[data-field], input[data-month]');
  return {
    id: tr ? tr.dataset.id : '',
    field: inp ? inp.dataset.field || '' : '',
    month: inp ? inp.dataset.month || '' : '',
    part: inp ? inp.dataset.part || '' : '',
    index: tr ? [...tbody.children].indexOf(tr) : -1,
  };
}

export function cellInfoResolve(tbody, info) {
  if (!info || (!info.field && !info.month)) return null;
  const all = [...tbody.children];
  const row = info.id ? all.find((r) => r.dataset.id === info.id) : all[info.index];
  const sel = info.month
    ? 'input[data-month="' + info.month + '"][data-part="' + info.part + '"]'
    : 'input[data-field="' + info.field + '"]';
  const inp = row ? row.querySelector(sel) : null;
  return inp ? inp.closest('td') : null;
}

/** 键盘弹出后把这一格留在可视区（表头以下、可视底边以上） */
export function ensureVisible(tbody, td) {
  const wrap = tbody.closest('.nt-tablewrap');
  if (!wrap || !td) return;
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
