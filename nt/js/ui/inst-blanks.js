// 界面：分期表后面的固定空行（可以直接填）
/**
 * 分期表的空行
 * 层：第五层 · UI
 *
 * 用户 2026-11：自动生成的分期列表**后面**固定留 10 条空行，空行不显示任何内容。
 * 一条分期在表里占两行（本金行 / 利息行），所以 10 条 = 视觉 20 行。
 *
 * 后来又要求「两种添加方式都要」：
 *   · 直接填 —— 在空行的「分期银行」「分期金额」两格里填，填齐就自动建；
 *   · 引导填 —— 点空行任意位置，跳到上方的添加栏并聚焦第一格。
 * 一条分期要「名称 + 金额 + 期数」才建得出来，期数在空行里没有对应列，
 * 所以直接填时按 12 期算，建完可以在表格里逐格改。
 *
 * 单独一个文件：inst-table.js 已经贴着 300 行公约上限。
 */

/** 空行条数（一条 = 两行） */
export const BLANK_INST_ROWS = 10;

/** 直接填时用的默认期数（没有「期数」这一列，先按一年算） */
const DEFAULT_PERIODS = '12';

/**
 * 画一条空分期（两行）。格子数 = 固定列 + 月份列。
 * @param {HTMLElement} tbody
 * @param {string[]} span 月份列标签
 * @param {number} fixedCols 固定列数
 * @param {(vals:{name:string,principal:string})=>void} [onFill] 填齐后的回调
 */
export function paintBlankRow(tbody, span, fixedCols, onFill) {
  const trP = document.createElement('tr');
  trP.className = 'nt-row nt-inst-main nt-inst-blank';
  const trI = document.createElement('tr');
  trI.className = 'nt-row nt-inst-sub nt-inst-blank';

  const blank = () => {
    const td = document.createElement('td');
    td.className = 'nt-cell';
    return td;
  };
  const inputCell = (placeholder, label) => {
    const td = document.createElement('td');
    td.className = 'nt-cell';
    const inp = document.createElement('input');
    inp.className = 'nt-cell-input';
    inp.type = 'text';
    inp.placeholder = placeholder;
    inp.setAttribute('aria-label', label);
    td.appendChild(inp);
    return { td, inp };
  };

  // 第 1 格：本金行填「分期银行」、利息行填「分期金额」，其余列留空
  const name = inputCell('分期银行', '分期银行');
  const amount = inputCell('分期金额', '分期金额');
  trP.appendChild(name.td);
  trI.appendChild(amount.td);
  for (let i = 1; i < fixedCols; i += 1) {
    trP.appendChild(blank());
    trI.appendChild(blank());
  }
  for (let i = 0; i < span.length; i += 1) {
    trP.appendChild(blank());
    trI.appendChild(blank());
  }

  /** 两格都填了才建（只填一格不动，免得建出半条分期） */
  const tryFill = () => {
    const n = String(name.inp.value || '').trim();
    const a = String(amount.inp.value || '').trim();
    if (!n || !a) return;
    if (typeof onFill !== 'function') return;
    onFill({ name: n, principal: a, periods: DEFAULT_PERIODS });
  };
  name.inp.addEventListener('change', tryFill);
  amount.inp.addEventListener('change', tryFill);

  // 点空行的**空白处** = 去上方添加栏填（引导填）。
  // 点在输入框上时不抢，否则打字会被跳走。
  const goFill = (ev) => {
    if (ev && ev.target === name.inp) return;
    if (ev && ev.target === amount.inp) return;
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
