// 界面：统计 tab → 左栏六类表 + 右侧「详情」
/**
 * 统计页的两个视图共用同一套骨架（2026-11 用户定）：
 *   左：6 类小表（分类视图按分类聚合 / 节点视图按节点聚合）
 *   右：「详情」—— 点左栏的名字（或手打）就列出构成它的流水
 *
 * 本文件只负责「两个区域怎么调度 + 详情怎么画」，
 * 六类小表的构建在 ui/stats-group-tables.js，口径在 core/stats-panels.js。
 */

import { categoryStats } from '../core/stats-panels.js';
import {
  queryByCategory, queryByNode, resolveCategory, suggestCategories,
} from '../core/category-query.js';
import { moneyAlways, shortDate } from '../core/format.js';
import { paintHandles, syncFrozen } from './table-layout.js';
import { showCatSuggest, hideCatSuggest, isCatSuggestFor } from './cat-suggest.js';
import { renderStatTables, TABLE_OF } from './stats-group-tables.js';

/** 详情表的列（日期/转出/转入/金额/备注） */
const QUERY_COLS = [['日期', 'date'], ['转出', 'from'], ['转入', 'to'], ['金额', 'amount'], ['备注', 'note']];

function makeCell(text, cls) {
  const td = document.createElement('td');
  td.className = 'nt-cell' + (cls ? ' ' + cls : '');
  td.textContent = text == null ? '' : String(text);
  return td;
}

function paintHead(table, cols) {
  const thead = table.querySelector('thead');
  if (!thead) return;
  const tr = document.createElement('tr');
  for (const [label, col] of cols) {
    const th = document.createElement('th');
    th.className = 'nt-th';
    th.scope = 'col';
    th.dataset.col = col;
    th.textContent = label;
    tr.appendChild(th);
  }
  thead.textContent = '';
  thead.appendChild(tr);
  paintHandles(table);
  syncFrozen(table);
}

/** 这块详情比的是分类还是节点（`data-query` 决定） */
function isNodePanel(panel) {
  return panel.getAttribute('data-query') === 'node';
}

/** 画一个「详情」面板 */
function paintQueryPanel(panel, state, range) {
  const table = panel.querySelector('.nt-table-catq');
  const tbody = table && table.querySelector('tbody');
  const input = panel.querySelector('[data-query-input]');
  if (!table || !tbody) return { matches: 0, query: '' };

  paintHead(table, QUERY_COLS);
  tbody.textContent = '';

  const q = input ? input.value : '';
  const node = isNodePanel(panel);
  const rows = q.trim()
    ? (node ? queryByNode : queryByCategory)(state.transactions, state.accounts, range, q)
    : [];

  if (!q.trim() || !rows.length) {
    const hint = node ? '点左侧节点，或输入名字 / 首字母' : '点左侧分类，或输入名字 / 首字母';
    const tr = document.createElement('tr');
    tr.className = 'nt-row';
    const td = makeCell(q.trim() ? '没有匹配的流水' : hint, 'nt-cell-empty');
    td.colSpan = QUERY_COLS.length;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return { matches: 0, query: q.trim() };
  }

  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.className = 'nt-row';
    tr.appendChild(makeCell(shortDate(r.tx.date)));
    tr.appendChild(makeCell(r.from ? r.from.name : ''));
    tr.appendChild(makeCell(r.to ? r.to.name : ''));
    tr.appendChild(makeCell(moneyAlways(r.tx.amount), 'nt-cell-num'));
    tr.appendChild(makeCell(r.tx.note || ''));
    tbody.appendChild(tr);
  }
  return { matches: rows.length, query: q.trim() };
}

/** 把「当前正在看的名字」标到左栏对应的行上 */
function markPicked(grid) {
  const input = grid.querySelector('[data-kind="query"] [data-query-input]');
  const q = input ? input.value.trim() : '';
  for (const cell of grid.querySelectorAll('[data-pick]')) {
    cell.setAttribute('aria-selected', cell.dataset.pick === q ? 'true' : 'false');
  }
}

/**
 * 画右侧「详情」面板（分类视图与节点视图共用）。
 * @returns {{matches:number, query:string}}
 */
export function paintDetailPanel(grid, state, range) {
  let matches = 0;
  const parts = [];
  for (const panel of grid.querySelectorAll('[data-kind="query"]')) {
    const r = paintQueryPanel(panel, state, range);
    matches += r.matches;
    if (r.query) parts.push(r.query);
  }
  markPicked(grid);
  return { matches, query: parts.join(' / ') };
}

/**
 * 绑定一块统计栅格：左栏点名字 → 填进详情；详情输入框照常可手打。
 *
 * 分类和节点用的是同一个函数 —— 两边的差别只在 `data-query`，
 * 那已经写在 HTML 里了，没必要写两份绑定。
 */
export function bindStatsDetail(grid, onChange, getState) {
  const stateNow = () => (typeof getState === 'function' ? getState() : null);

  // 点左栏的分类 / 节点名 → 直接把名字灌进详情并查
  if (!grid.dataset.pickBound) {
    grid.dataset.pickBound = '1';
    const onPick = (ev) => {
      const cell = ev.target.closest('[data-pick]');
      if (!cell || !grid.contains(cell)) return;
      const panel = grid.querySelector('[data-kind="query"]');
      const input = panel && panel.querySelector('[data-query-input]');
      if (!input) return;
      input.value = cell.dataset.pick;
      hideCatSuggest();
      onChange();
    };
    grid.addEventListener('click', onPick);
    // 键盘可达：Enter / 空格等同点击
    grid.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const cell = ev.target.closest('[data-pick]');
      if (!cell) return;
      ev.preventDefault();
      onPick(ev);
    });
  }

  for (const panel of grid.querySelectorAll('[data-kind="query"]')) {
    if (panel.dataset.bound === '1') continue;
    panel.dataset.bound = '1';

    const input = panel.querySelector('[data-query-input]');
    const clear = panel.querySelector('[data-query-clear]');
    if (!input) continue;
    const node = isNodePanel(panel);

    let timer = 0;
    let lastItems = [];

    const refreshSuggest = () => {
      // 候选只对分类有用（节点名太多，弹出来反而吵）
      if (node) return;
      const state = stateNow();
      lastItems = state ? suggestCategories(state.accounts, input.value, 8) : [];
      if (!lastItems.length) { hideCatSuggest(); return; }
      showCatSuggest(input, lastItems, (name) => {
        input.value = name;
        lastItems = [];
        hideCatSuggest();
        onChange();
        try { input.focus(); } catch (e) { /* 忽略 */ }
      });
    };

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { refreshSuggest(); onChange(); }, 120);
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      clearTimeout(timer);
      const state = stateNow();
      let name = state && !node ? resolveCategory(state.accounts, input.value) : '';
      if (!name && lastItems.length === 1) name = lastItems[0].name;
      if (name && name !== input.value) {
        input.value = name;
        try { input.setSelectionRange(name.length, name.length); } catch (e) { /* 忽略 */ }
      }
      lastItems = [];
      hideCatSuggest();
      onChange();
    });

    input.addEventListener('blur', () => {
      // 点候选时 pointerdown 已 preventDefault，焦点不会真丢；这里只处理 Tab/点空白
      if (isCatSuggestFor(input)) hideCatSuggest();
    });

    if (clear) {
      clear.addEventListener('click', () => {
        input.value = '';
        lastItems = [];
        hideCatSuggest();
        onChange();
        input.focus();
      });
    }
  }
}

/**
 * 画分类视图的左栏（6 大分类表）。
 * @returns {{categories:number}}
 */
export function paintCategoryPanels(grid, state, range) {
  if (!grid) return { categories: 0 };
  const groups = categoryStats(state.accounts, state.transactions, range);
  const categories = renderStatTables(
    grid.querySelector('#nt-stats-groups'),
    groups,
    { firstCol: '分类', tableOf: TABLE_OF },
  );
  return { categories };
}
