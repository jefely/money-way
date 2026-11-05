// 界面：统计页 → 汇总视图的分类型小表
/**
 * 汇总视图（2026-11 重做）
 * 层：第五层 · UI
 *
 * 每个节点类型一张独立小表（资产 / 负债 / 收入 / 权益 / 费用 / 成本）：
 *   合计行（表头上边）：类型名 + 各字段合计
 *   表头：节点名称 | 序号 | 分类 | 转出 | 转入 | 本期余额 | 历史转出 | 历史转入 | 历史结余 | 期初余额
 *   数据：该类型的账户（序号在组内从 1 开始）
 *
 * 和 6 大分类表同一套骨架：合计行在表头上面、透明底、不画竖线；
 * 类型不再是「一列」，而是每组表头上的标签。
 */

import { TABLE_DEFAULT_WIDTHS } from '../core/table-cols.js';
import { money } from '../core/format.js';
import { mountResize, paintHandles, syncFrozen } from './table-layout.js';

/** 列顺序必须与 core/table-cols.js 的 TABLE_COLS.sum.cols 一一对应 */
const COLS = [
  ['节点名称', 'name'],
  ['序号', 'seq'],
  ['分类', 'cat'],
  ['转出金额', 'out'],
  ['转入金额', 'iin'],
  ['本期余额', 'balance'],
  ['历史转出', 'histOut'],
  ['历史转入', 'histIn'],
  ['历史结余', 'histBalance'],
  ['期初余额', 'opening'],
];

/** 类型分组顺序 */
const TYPE_ORDER = ['资产类', '负债类', '收入类', '权益类', '费用类', '成本类'];

/** 数值列 → row.s 里的字段 */
const NUM_FIELDS = ['periodOut', 'periodIn', 'balance', 'historyOut', 'historyIn', 'historyBalance', 'opening'];

function makeCell(text, cls) {
  const td = document.createElement('td');
  td.className = 'nt-cell' + (cls ? ' ' + cls : '');
  td.textContent = text == null ? '' : String(text);
  return td;
}

/** 一组账户的合计（金额各列相加） */
function sumRows(list) {
  const acc = {};
  for (const k of NUM_FIELDS) acc[k] = 0;
  for (const r of list) {
    const s = r.s || {};
    for (const k of NUM_FIELDS) acc[k] += Number(s[k]) || 0;
  }
  return acc;
}

function buildTable(type, list) {
  const defs = String(TABLE_DEFAULT_WIDTHS.sum || '').split(',').map((x) => Number(x) || 0);
  const el = document.createElement('table');
  el.className = 'nt-table nt-table-stat nt-table-sum';

  // 列宽写在 col 上（var 引用该表参数），理由同 6 大分类表
  const cg = document.createElement('colgroup');
  COLS.forEach(([, key], i) => {
    const col = document.createElement('col');
    col.style.width = 'var(--nt-col-sum-' + key + ', ' + (defs[i] || 80) + 'px)';
    cg.appendChild(col);
  });
  el.appendChild(cg);

  const thead = document.createElement('thead');

  // ① 合计行：类型名 + 各字段合计（表头上边）
  const t = sumRows(list);
  const totals = NUM_FIELDS.map((k) => money(t[k]));
  const totalRow = document.createElement('tr');
  totalRow.className = 'nt-row nt-stats-total-row';
  totalRow.appendChild(makeCell(String(type || '').replace(/类$/, ''), 'nt-cell-total-name'));
  totalRow.appendChild(makeCell('', ''));
  totalRow.appendChild(makeCell('', ''));
  for (const v of totals) totalRow.appendChild(makeCell(v, 'nt-cell-num'));
  thead.appendChild(totalRow);

  // ② 表头行
  const headRow = document.createElement('tr');
  for (const [label, col] of COLS) {
    const th = document.createElement('th');
    th.className = 'nt-th';
    th.scope = 'col';
    th.dataset.col = col;
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  el.appendChild(thead);

  const tbody = document.createElement('tbody');
  list.forEach((r, i) => {
    const s = r.s || {};
    const tr = document.createElement('tr');
    tr.className = 'nt-row';
    tr.appendChild(makeCell(r.acc.name));
    tr.appendChild(makeCell(i + 1));
    tr.appendChild(makeCell(r.acc.category || '—'));
    for (const k of NUM_FIELDS) tr.appendChild(makeCell(money(s[k]), 'nt-cell-num'));
    tbody.appendChild(tr);
  });
  el.appendChild(tbody);
  return el;
}

/** 参数里 sum 的列宽已写过变量 → 按 px 排 */
function markCustom(tableEl) {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--nt-col-sum-name').trim();
  tableEl.classList.toggle('cols-custom', !!v);
}

/**
 * 画汇总视图。
 * @param {HTMLElement} host 容器
 * @param {Array<{acc:object, s:object}>} rows accountRows() 的结果
 * @returns {number} 账户行数
 */
export function renderSummaryTables(host, rows) {
  if (!host) return 0;
  host.textContent = '';

  const groups = new Map();
  for (const r of rows || []) {
    const type = (r.acc && r.acc.type) || '其它';
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(r);
  }

  let count = 0;
  for (const type of TYPE_ORDER) {
    const list = groups.get(type);
    if (!list || !list.length) continue;
    const el = buildTable(type, list);
    host.appendChild(el);
    markCustom(el);
    mountResize(el);
    paintHandles(el);
    syncFrozen(el);
    count += list.length;
  }
  // 不在六类里的（历史脏数据）也别吞掉
  for (const [type, list] of groups) {
    if (TYPE_ORDER.includes(type) || !list.length) continue;
    const el = buildTable(type, list);
    host.appendChild(el);
    mountResize(el);
    paintHandles(el);
    syncFrozen(el);
    count += list.length;
  }

  if (!count) {
    const empty = document.createElement('div');
    empty.className = 'nt-stats-empty';
    empty.textContent = '还没有节点';
    host.appendChild(empty);
  }
  return count;
}
