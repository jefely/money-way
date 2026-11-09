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

const inputIn = (td) => (td ? td.querySelector('input.nt-cell-input') : null);

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

/** Enter：下一行同一列，跳过只读行（未来分期 / 期初日期） */
export function nextRowSameField(tbody, td) {
  const p = cellCoords(tbody, td);
  if (!p) return null;
  for (let r = p.r + 1; r < tbody.children.length; r += 1) {
    const cell = cellAt(tbody, r, p.c);
    const inp = inputIn(cell);
    if (inp && !inp.readOnly && !inp.disabled) return cell;
  }
  return null;
}

/** Tab：DOM 顺序里的下一 / 上一可编辑格（跳过只读、禁用） */
export function adjacentEditable(tbody, input, dir) {
  const list = [...tbody.querySelectorAll('input.nt-cell-input')]
    .filter((el) => !el.disabled && !el.readOnly);
  const i = list.indexOf(input);
  if (i < 0) return null;
  return list[i + dir] || null;
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
