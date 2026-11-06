// 界面：分期表后面的固定空行（纯占位）
/**
 * 分期表的空行
 * 层：第五层 · UI
 *
 * 用户 2026-11：自动生成的分期列表**后面**固定留 10 条空行，空行不显示任何内容。
 * 一条分期在表里占两行（本金行 / 利息行），所以 10 条 = 视觉 20 行。
 *
 * 曾经在这两行里放过输入框（填名称+金额自动建），后来用户取消了：
 * 「能建好再微调金额就行」—— 一条分期要名称/金额/期数/首月四样，
 * 半行里塞两个格子建出来的是残的，还不如走上方那排完整表单。
 * 所以现在只保留**引导**：点空行滚到添加栏并聚焦。
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

  // 点空行 = 去上方添加栏填（引导填，不是就地填）
  const goFill = () => {
    const bar = document.getElementById('nt-inst-add');
    if (!bar) return;
    bar.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const first = bar.querySelector('[data-add="name"]');
    if (first) setTimeout(() => { try { first.focus(); } catch (e) { /* 忽略 */ } }, 120);
  };
  trP.addEventListener('click', goFill);
  trI.addEventListener('click', goFill);

  tbody.appendChild(trP);
  tbody.appendChild(trI);
}
