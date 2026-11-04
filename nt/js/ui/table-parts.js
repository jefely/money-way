// 界面：表格里重复出现的零件
/**
 * 区域内的列标题行（用户 2026-10-29：每个区域都重复一次，A 区沿用冻结表头）
 * 放在这里是为了让 account-table.js 保持在 300 行以内。
 */

export const ACCOUNT_COLS = ['简码', '序', '类型', '分类', '名称', '期初', '账单日', '还款日', '上移', '删除'];

/** 区域标题：冻结列只放 A/B/U，长标题放后面的跨列格。 */
export function zoneHead(zone) {
  const head = document.createElement('tr');
  const key = zone.key;
  head.className = 'nt-zone-head ' + (key === 'A' ? 'nt-zone-a' : key === 'B' ? 'nt-zone-b' : 'nt-zone-u');

  const tag = document.createElement('td');
  tag.className = 'nt-cell nt-zone-cell nt-zone-tag';
  tag.textContent = key;

  const td = document.createElement('td');
  td.className = 'nt-cell nt-zone-cell';
  td.colSpan = 9;

  const inner = document.createElement('div');
  inner.className = 'nt-zone-label';
  const name = document.createElement('b');
  name.textContent = String(zone.label || '').replace(new RegExp('^' + key + '\\s*'), '');
  const hint = document.createElement('span');
  hint.className = 'nt-zone-hint';
  hint.textContent = zone.hint || '';
  inner.appendChild(name);
  inner.appendChild(hint);
  td.appendChild(inner);
  head.appendChild(tag);
  head.appendChild(td);
  return head;
}

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
