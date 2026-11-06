// 界面：表格里重复出现的零件
/**
 * 区域内的列标题行（用户 2026-10-29：每个区域都重复一次，A 区沿用冻结表头）
 * 放在这里是为了让 account-table.js 保持在 300 行以内。
 */

// 2026-11：删掉「账单日 / 还款日」—— 手机宽度有限，而且分期表那边已经填了。
// 这张表和 index.html 里账户表的真实表头**必须一致**，否则区域标题行会多出两列。
// 按钮列统一叫「移」「删」（一个字），和主表头、备注区保持一致。
export const ACCOUNT_COLS = ['简码', '序', '类型', '分类', '名称', '期初', '移', '删'];

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
  // 跨列数 = 总列数 - 1（第一列放区域字母 A/B/U）
  td.colSpan = ACCOUNT_COLS.length - 1;

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

// 注意：原来这里还有一个 zoneCols()（给每个 A/B/U 区重复插一行列标题），
// 2026-11 取消重复表头后没人用了，一并删掉。备注区的列标题是另一套
// 列结构（简码/序/类型/关键字/内容/移/删），在 note-table.js 里，不受影响。
