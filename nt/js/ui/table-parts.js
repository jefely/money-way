// 界面：表格里重复出现的零件
/**
 * 区域内的列标题行（用户 2026-10-29：每个区域都重复一次，A 区沿用冻结表头）
 * 放在这里是为了让 account-table.js 保持在 300 行以内。
 */

export const ACCOUNT_COLS = ['简码', '序', '类型', '分类', '名称', '期初', '账单日', '还款日', '上移', '删除'];

export function zoneCols() {
  const tr = document.createElement('tr');
  tr.className = 'nt-zone-cols';
  for (const label of ACCOUNT_COLS) {
    const td = document.createElement('td');
    td.className = 'nt-cell';
    td.textContent = label;
    tr.appendChild(td);
  }
  return tr;
}
