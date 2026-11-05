// 界面：统计 tab → 分类（存量 / 流量两块）
/**
 * 只画两块表，不碰 state / 不算钱：
 *   stock：分类 | 节点 | 期初 | 本期增加 | 本期减少 | 期末
 *   flow ：分类 | 节点 | 本期收入/支出 | 本期退回 | 净额
 *
 * 桌面左右并排；窄屏由 stats.css 做成一屏一块、横向吸附。
 */

import { categoryPanels } from '../core/ledger-stats.js';
import { queryByCategory, resolveCategory, suggestCategories } from '../core/category-query.js';
import { moneyAlways, shortDate } from '../core/format.js';
import { mountResize, paintHandles, syncFrozen } from './table-layout.js';
import { showCatSuggest, hideCatSuggest, isCatSuggestFor } from './cat-suggest.js';

/**
 * 三块表的列（标签 + 列 key）。
 * 列 key 必须和 core/table-cols.js 里 stock / sflow / catq 的 cols 一一对应：
 * 拖动时靠它认「哪一列」，列宽参数也是按这个顺序存的。
 */
const HEAD = {
  stock: [['分类', 'cat'], ['节点', 'count'], ['期初', 'opening'], ['本期增加', 'increase'], ['本期减少', 'decrease'], ['期末', 'end']],
  flow: [['分类', 'cat'], ['节点', 'count'], ['本期收入/支出', 'gross'], ['本期退回', 'reverse'], ['净额', 'net']],
  query: [['日期', 'date'], ['转出', 'from'], ['转入', 'to'], ['金额', 'amount'], ['备注', 'note']],
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
  // 表头是每次重画都重建的：手柄和冻结偏移都得补，
  // 列宽不用管 —— 它由参数写进 CSS 变量（见 core/table-cols.js 的 growByWidth）。
  paintHandles(table);
  syncFrozen(table);
}

/** 组名 → 合计行标题：'资产类' → '资产 合计'（用户 2026-11：去掉「类」，空格隔开） */
function groupTitle(type) {
  return String(type || '').replace(/类$/, '') + ' 合计';
}

/**
 * 每组合计一张独立小表：合计行 + 表头 + 该组分类行。
 *
 * 为什么不用一张大表：用户要的是「每个合计一张表，表与表之间空一行」，
 * 这样资产/负债/权益各自成块，一眼能分清；共用一张表只能靠合并行动画式地区分。
 *
 * 合计行为什么放在 thead 的**第一行**（而不是 tbody 里）：
 *   用户 2026-11 要求它压在表头上面。HTML 的 thead 永远渲染在 tbody 之前，
 *   所以把合计行放进 thead 的第一行才能「在表头上边」。
 *   它用 <td> 而不是 <th>：拖列宽 / 列宽参数认的是 `thead .nt-th`，
 *   用 th 会变成 12 个表头、列宽数组错位。
 *   第一行也正好是 table-layout:fixed 用来定列宽的那一行，6 个 td 对应 6 列。
 */
function buildGroupTable(g, kind) {
  const cols = HEAD[kind];
  const stock = kind === 'stock';
  const t = g.total || {};

  const table = document.createElement('table');
  table.className = 'nt-table ' + (stock ? 'nt-table-stock' : 'nt-table-sflow');

  const thead = document.createElement('thead');

  // ① 合计行（普通底色、加粗但字号小一号，突出下面的表头）
  const totalRow = document.createElement('tr');
  totalRow.className = 'nt-stats-total-row';
  const totalCells = stock
    ? [
      groupTitle(g.type),
      '', stockAmount(t.opening, g.type), moneyAlways(t.increase), moneyAlways(t.decrease), stockAmount(t.end, g.type),
    ]
    : [groupTitle(g.type), '', moneyAlways(t.gross), moneyAlways(t.reverse), moneyAlways(t.net)];
  totalCells.forEach((c, i) => {
    totalRow.appendChild(makeCell(c, i === 0 ? 'nt-cell-total-title' : 'nt-cell-num'));
  });
  thead.appendChild(totalRow);

  // ② 表头行
  const headRow = document.createElement('tr');
  for (const [label, col] of cols) {
    const th = document.createElement('th');
    th.className = 'nt-th';
    th.scope = 'col';
    th.dataset.col = col;
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const c of g.categories) {
    const cells = stock
      ? [
        c.category, c.count,
        stockAmount(c.opening, g.type), moneyAlways(c.increase), moneyAlways(c.decrease), stockAmount(c.end, g.type),
      ]
      : [c.category, c.count, moneyAlways(c.gross), moneyAlways(c.reverse), moneyAlways(c.net)];
    tbody.appendChild(makeRow(cells, false, 0));
  }

  table.appendChild(tbody);
  return table;
}

/**
 * 新表要不要「按 px 排」：看 :root 上有没有 --nt-col-<表>-cat。
 *
 * 参数里该列 > 0 时 apply-settings 会写这个变量；全 0（还没自定义）时
 * 它是被 removeProperty 掉的空值。小表是每次重画重建的，类不会自己跟过来，
 * 所以每次建表都按这个变量判一次（列宽参数仍是唯一真相）。
 */
function markCustom(table, kind) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--nt-col-' + kind + '-cat').trim();
  table.classList.toggle('cols-custom', !!v);
}

function paintPanel(panel, groups, kind) {
  if (!panel) return 0;
  const host = panel.querySelector('.nt-stats-tables');
  if (!host) return 0;
  host.textContent = '';

  let count = 0;
  for (const g of groups || []) {
    if (!g.categories || !g.categories.length) continue;
    count += g.categories.length;
    const table = buildGroupTable(g, kind);
    host.appendChild(table);
    markCustom(table, kind);
    // 表是动态建的，拖动绑定要补（列宽参数三张小表共用一套 stock/sflow）
    mountResize(table);
    paintHandles(table);
    syncFrozen(table);
  }

  if (!count) {
    const empty = document.createElement('div');
    empty.className = 'nt-stats-empty';
    empty.textContent = '本期没有数据';
    host.appendChild(empty);
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
    const td = makeCell('输入分类或首字母后显示本期流水', '', HEAD.query.length);
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
 * 回车时先把「首字母」换成分类名（唯一命中才换），再查一次。
 *
 * @param {HTMLElement} grid
 * @param {Function} onChange
 * @param {Function} [getState] 回车换名字要读分类列表
 */
export function bindCategoryQuery(grid, onChange, getState) {
  const panel = grid && grid.querySelector('[data-kind="query"]');
  if (!panel) return;
  const input = panel.querySelector('#nt-stats-cat-q');
  const clear = panel.querySelector('#nt-stats-cat-clear');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';

  let timer = 0;
  let lastItems = [];
  const stateNow = () => (typeof getState === 'function' ? getState() : null);

  /** 输入任何东西都先算一遍候选：「c」→ 储蓄（cx）/日常（rc） */
  function refreshSuggest() {
    const state = stateNow();
    lastItems = state ? suggestCategories(state.accounts, input.value, 8) : [];
    if (!lastItems.length) {
      hideCatSuggest();
      return;
    }
    showCatSuggest(input, lastItems, (name) => {
      // 点选：直接把分类名填进去再查（用户 2026-11：输入 c 弹出储蓄，点它就带入）
      input.value = name;
      lastItems = [];
      hideCatSuggest();
      onChange();
      try { input.focus(); } catch (e) { /* 忽略 */ }
    });
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      refreshSuggest();
      onChange();
    }, 120);
  });

  // 回车：先把「首字母」换成分类名（唯一命中才换），再查一次。
  // 名字换不上但只弹出一个候选时，也直接选它 —— 打 cx 回车就是「储蓄」。
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
    // 点候选时 pointerdown 已经 preventDefault，焦点不会真的丢；
    // 这里只处理 Tab / 点空白真正离开输入框的情况。
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
