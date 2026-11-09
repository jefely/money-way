// 界面：流水表的格子几何（给 cell-select 用）
/**
 * 选区几何
 * 层：第五层 · UI
 *
 * 纯 DOM，不碰 state。cell-select 只保留交互，坐标/边界/可编辑计数放这里，
 * 免得那个文件越过 300 行公约。
 */

export const rowsOf = (tbody) => [...tbody.children];

export function coordsOf(tbody, td) {
  const tr = td && td.parentElement;
  if (!tr || tr.parentElement !== tbody || [...tr.children].some((c) => c.colSpan > 1)) return null;
  const r = rowsOf(tbody).indexOf(tr);
  const c = [...tr.children].indexOf(td);
  return r >= 0 && c >= 0 ? { r, c } : null;
}

export function cellAtIn(tbody, r, c) {
  const tr = tbody.children[r];
  return tr ? tr.children[c] || null : null;
}

export function boundsOf(sel) {
  return {
    r1: Math.min(sel.ar, sel.fr), r2: Math.max(sel.ar, sel.fr),
    c1: Math.min(sel.ac, sel.fc), c2: Math.max(sel.ac, sel.fc),
  };
}

/** 选区里可编辑的格子数（只读行不算） */
export function editableCountIn(tbody, sel) {
  if (!sel) return 0;
  const b = boundsOf(sel);
  let n = 0;
  for (let r = b.r1; r <= b.r2; r += 1) for (let c = b.c1; c <= b.c2; c += 1) {
    const td = cellAtIn(tbody, r, c);
    const inp = td ? td.querySelector('input.nt-cell-input') : null;
    if (inp && !inp.readOnly && !inp.disabled) n += 1;
  }
  return n;
}
