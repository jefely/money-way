// 界面：统计 tab → 分类（存量 / 流量两块）
/**
 * 只画两块表，不碰 state / 不算钱：
 *   stock：分类 | 节点 | 期初 | 本期增加 | 本期减少 | 期末
 *   flow ：分类 | 节点 | 本期收入/支出 | 本期退回 | 净额
 *
 * 桌面左右并排；窄屏由 stats.css 做成一屏一块、横向吸附。
 */

import { categoryPanels } from '../core/ledger-stats.js';
import { moneyAlways } from '../core/format.js';

const HEAD = {
  stock: ['分类', '节点', '期初', '本期增加', '本期减少', '期末'],
  flow: ['分类', '节点', '本期收入/支出', '本期退回', '净额'],
};

/** 存量余额：负债已在 core 里取绝对值并按欠款显示；这里统一财务格式。 */
function stockAmount(value) {
  return moneyAlways(Number(value) || 0);
}

function makeCell(text, cls, span) {
  const td = document.createElement('td');
  td.className = 'nt-cell' + (cls ? ' ' + cls : '');
  if (span) td.colSpan = span;
  td.textContent = text == null ? '' : String(text);
  return td;
}

function makeRow(cells, total, spanFirst) {
  const tr = document.createElement('tr');
  tr.className = 'nt-row' + (total ? ' nt-row-total' : '');
  cells.forEach((c, i) => {
    if (i === 0 && spanFirst) {
      tr.appendChild(makeCell(c, '', spanFirst));
      return;
    }
    tr.appendChild(makeCell(c, i === 0 ? '' : 'nt-cell-num'));
  });
  return tr;
}

function paintHead(table, labels) {
  const thead = table.querySelector('thead');
  if (!thead) return;
  const tr = document.createElement('tr');
  for (const label of labels) {
    const th = document.createElement('th');
    th.className = 'nt-th';
    th.scope = 'col';
    th.textContent = label;
    tr.appendChild(th);
  }
  thead.textContent = '';
  thead.appendChild(tr);
}

function paintPanel(panel, groups, kind) {
  if (!panel) return 0;
  const table = panel.querySelector('table');
  const tbody = table && table.querySelector('tbody');
  if (!table || !tbody) return 0;
  paintHead(table, HEAD[kind]);
  tbody.textContent = '';

  const stock = kind === 'stock';
  let count = 0;
  for (const g of groups || []) {
    for (const c of g.categories) {
      count += 1;
      const cells = stock
        ? [
          c.category, c.count,
          stockAmount(c.opening), moneyAlways(c.increase), moneyAlways(c.decrease), stockAmount(c.end),
        ]
        : [c.category, c.count, moneyAlways(c.gross), moneyAlways(c.reverse), moneyAlways(c.net)];
      tbody.appendChild(makeRow(cells, false, 0));
    }
    const t = g.total || {};
    const totalCells = stock
      ? [
        `${g.type}合计`,
        stockAmount(t.opening), moneyAlways(t.increase), moneyAlways(t.decrease), stockAmount(t.end),
      ]
      : [`${g.type}合计`, moneyAlways(t.gross), moneyAlways(t.reverse), moneyAlways(t.net)];
    tbody.appendChild(makeRow(totalCells, true, 2));
  }

  if (!count) {
    const tr = document.createElement('tr');
    tr.className = 'nt-row';
    const td = makeCell('本期没有数据', '', HEAD[kind].length);
    td.className = 'nt-cell nt-cell-empty';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  return count;
}

/**
 * @param {HTMLElement} grid #nt-stats-grid
 * @param {object} state
 * @param {{start?:string,end?:string}} range
 * @returns {{categories:number, stock:number, flow:number}}
 */
export function paintCategoryPanels(grid, state, range) {
  if (!grid) return { categories: 0, stock: 0, flow: 0 };
  const panels = categoryPanels(state.accounts, state.transactions, range);
  const stock = paintPanel(grid.querySelector('[data-kind="stock"]'), panels.stock, 'stock');
  const flow = paintPanel(grid.querySelector('[data-kind="flow"]'), panels.flow, 'flow');
  return { categories: stock + flow, stock, flow };
}
