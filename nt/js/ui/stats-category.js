// 界面：统计 tab → 分类（存量 / 流量两块）
/**
 * 只画两块表，不碰 state / 不算钱：
 *   stock：分类 | 节点 | 期初 | 本期增加 | 本期减少 | 期末
 *   flow ：分类 | 节点 | 本期收入/支出 | 本期退回 | 净额
 *
 * 桌面左右并排；窄屏由 stats.css 做成一屏一块、横向吸附。
 */

import { categoryPanels } from '../core/ledger-stats.js';
import { queryByCategory } from '../core/category-query.js';
import { moneyAlways, shortDate } from '../core/format.js';

const HEAD = {
  stock: ['分类', '节点', '期初', '本期增加', '本期减少', '期末'],
  flow: ['分类', '节点', '本期收入/支出', '本期退回', '净额'],
  query: ['日期', '转出', '转入', '金额', '备注'],
};

/** 存量余额：负债正数=欠款，负余额=多还（和应付同口径，不把负数硬掰成正）。 */
function stockAmount(value, type) {
  const n = Number(value) || 0;
  if (type === '负债类' && n < -0.005) return `多还 ${moneyAlways(Math.abs(n))}`;
  return moneyAlways(n);
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
          stockAmount(c.opening, g.type), moneyAlways(c.increase), moneyAlways(c.decrease), stockAmount(c.end, g.type),
        ]
        : [c.category, c.count, moneyAlways(c.gross), moneyAlways(c.reverse), moneyAlways(c.net)];
      tbody.appendChild(makeRow(cells, false, 0));
    }
    const t = g.total || {};
    const totalCells = stock
      ? [
        `${g.type}合计`,
        stockAmount(t.opening, g.type), moneyAlways(t.increase), moneyAlways(t.decrease), stockAmount(t.end, g.type),
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

function paintQueryPanel(grid, state, range) {
  const panel = grid.querySelector('[data-kind="query"]');
  if (!panel) return 0;
  const table = panel.querySelector('table');
  const tbody = table && table.querySelector('tbody');
  const input = panel.querySelector('#nt-stats-cat-q');
  if (!table || !tbody) return 0;
  paintHead(table, HEAD.query);
  tbody.textContent = '';

  const q = input ? input.value : '';
  const rows = queryByCategory(state.transactions, state.accounts, range, q);
  if (!q.trim()) {
    const tr = document.createElement('tr');
    tr.className = 'nt-row';
    const td = makeCell('输入分类后显示本期流水', '', HEAD.query.length);
    td.className = 'nt-cell nt-cell-empty';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return 0;
  }
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.className = 'nt-row';
    const td = makeCell('没有匹配的流水', '', HEAD.query.length);
    td.className = 'nt-cell nt-cell-empty';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return 0;
  }

  for (const r of rows) {
    const tr = makeRow([
      shortDate(r.tx.date),
      r.from ? r.from.name : '',
      r.to ? r.to.name : '',
      moneyAlways(r.tx.amount),
      r.tx.note || '',
    ], false, 0);
    // 只有金额列右对齐，日期/节点/备注保持左对齐
    tr.querySelectorAll('.nt-cell').forEach((td, i) => {
      if (i !== 3) td.classList.remove('nt-cell-num');
    });
    tbody.appendChild(tr);
  }
  return rows.length;
}

/**
 * 绑定分类查询输入框；只绑一次。onChange 每次输入防抖后调用。
 */
export function bindCategoryQuery(grid, onChange) {
  const panel = grid && grid.querySelector('[data-kind="query"]');
  if (!panel) return;
  const input = panel.querySelector('#nt-stats-cat-q');
  const clear = panel.querySelector('#nt-stats-cat-clear');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 120);
  });
  if (clear) {
    clear.addEventListener('click', () => {
      input.value = '';
      onChange();
      input.focus();
    });
  }
}

/**
 * @param {HTMLElement} grid #nt-stats-grid
 * @param {object} state
 * @param {{start?:string,end?:string}} range
 * @returns {{categories:number, stock:number, flow:number, matches:number, query:string}}
 */
export function paintCategoryPanels(grid, state, range) {
  if (!grid) return { categories: 0, stock: 0, flow: 0, matches: 0, query: '' };
  const panels = categoryPanels(state.accounts, state.transactions, range);
  const stock = paintPanel(grid.querySelector('[data-kind="stock"]'), panels.stock, 'stock');
  const flow = paintPanel(grid.querySelector('[data-kind="flow"]'), panels.flow, 'flow');
  const matches = paintQueryPanel(grid, state, range);
  const input = grid.querySelector('#nt-stats-cat-q');
  return { categories: stock + flow, stock, flow, matches, query: input ? input.value.trim() : '' };
}
