// 界面：统计 tab → 分类（6 大分类表 + 两个独立的分类查询）
/**
 * 分类视图三栏（用户 2026-11 定稿）：
 *   左：6 大分类表（费用/收入/资产/负债/权益/成本，从上到下，有内容才列）
 *   中：分类查询 A
 *   右：分类查询 B（同一种表，独立输入、独立结果）
 *
 * 本文件只负责「三个区域怎么调度 + 分类查询怎么画」，
 * 分组小表的构建在 ui/stats-group-tables.js。
 */

import { categoryPanels } from '../core/ledger-stats.js';
import { queryByCategory, resolveCategory, suggestCategories } from '../core/category-query.js';
import { moneyAlways, shortDate } from '../core/format.js';
import { paintHandles, syncFrozen } from './table-layout.js';
import { showCatSuggest, hideCatSuggest, isCatSuggestFor } from './cat-suggest.js';
import { renderGroupTables } from './stats-group-tables.js';

/** 分类查询表的列（日期/转出/转入/金额/备注） */
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

/** 画一个分类查询面板（每个面板读自己的输入框） */
function paintQueryPanel(panel, state, range) {
  const table = panel.querySelector('.nt-table-catq');
  const tbody = table && table.querySelector('tbody');
  const input = panel.querySelector('[data-query-input]');
  if (!table || !tbody) return { matches: 0, query: '' };

  paintHead(table, QUERY_COLS);
  tbody.textContent = '';

  const q = input ? input.value : '';
  const rows = q.trim() ? queryByCategory(state.transactions, state.accounts, range, q) : [];

  if (!q.trim() || !rows.length) {
    const tr = document.createElement('tr');
    tr.className = 'nt-row';
    const td = makeCell(q.trim() ? '没有匹配的流水' : '输入分类或首字母后显示本期流水', 'nt-cell-empty');
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

/**
 * 绑定所有分类查询面板（现在有 A、B 两个）。
 * 回车 / 点候选：首字母换成分类名后再查；输入过程防抖 120ms。
 */
export function bindCategoryQueries(grid, onChange, getState) {
  const stateNow = () => (typeof getState === 'function' ? getState() : null);

  for (const panel of grid.querySelectorAll('[data-kind="query"]')) {
    if (panel.dataset.bound === '1') continue;
    panel.dataset.bound = '1';

    const input = panel.querySelector('[data-query-input]');
    const clear = panel.querySelector('[data-query-clear]');
    if (!input) continue;

    let timer = 0;
    let lastItems = [];

    const refreshSuggest = () => {
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
      let name = state ? resolveCategory(state.accounts, input.value) : '';
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
 * 画整个分类视图（v1.272：三栏 = 6 大分类 | 分类查询 A | 分类查询 B）
 * @returns {{categories:number, matches:number, query:string}}
 */
export function paintCategoryPanels(grid, state, range) {
  if (!grid) return { categories: 0, matches: 0, query: '' };

  const panels = categoryPanels(state.accounts, state.transactions, range);
  const categories = renderGroupTables(
    grid.querySelector('#nt-stats-groups'),
    [...panels.stock, ...panels.flow],
  );

  const qs = [...grid.querySelectorAll('[data-kind="query"]')].map((p) => paintQueryPanel(p, state, range));
  const matches = qs.reduce((n, q) => n + q.matches, 0);
  const query = qs.map((q) => q.query).filter(Boolean).join(' / ');

  return { categories, matches, query };
}
