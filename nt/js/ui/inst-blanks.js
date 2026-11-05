// 界面：分期表前面的固定空行（留白 + 占位，不参与录入）
/**
 * 分期表的空行
 * 层：第五层 · UI
 *
 * 用户 2026-11：自动生成的分期列表**前面**固定留 10 条空行，空行不显示任何内容。
 * 一条分期在表里占两行（本金行 / 利息行），所以 10 条 = 视觉 20 行，和上面的
 * 「顺序 = 先空行、后自动分期」一起保证自动列表不会被空行插花。
 *
 * 单独一个文件：inst-table.js 已经贴着 300 行公约上限。
 */

/** 空行条数（一条 = 两行） */
export const BLANK_INST_ROWS = 10;

/**
 * 画一条空分期（两行）。格子数 = 固定列 + 月份列。
 * @param {HTMLElement} tbody
 * @param {string[]} span 月份列标签
 * @param {number} fixedCols 固定列数
 */
export function paintBlankRow(tbody, span, fixedCols) {
  const trP = document.createElement('tr');
  trP.className = 'nt-row nt-inst-main nt-inst-blank';
  const trI = document.createElement('tr');
  trI.className = 'nt-row nt-inst-sub nt-inst-blank';

  const blank = () => {
    const td = document.createElement('td');
    td.className = 'nt-cell';
    return td;
  };

  for (let i = 0; i < fixedCols; i += 1) {
    trP.appendChild(blank());
    trI.appendChild(blank());
  }
  for (let i = 0; i < span.length; i += 1) {
    trP.appendChild(blank());
    trI.appendChild(blank());
  }

  tbody.appendChild(trP);
  tbody.appendChild(trI);
}
