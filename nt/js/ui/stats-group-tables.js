// 界面：统计页 6 大分类的分组小表
/**
 * 6 大分类小表（费用 / 收入 / 资产 / 负债 / 权益 / 成本）
 * 层：第五层 · UI
 *
 * 每类一张独立小表：合计行 + 表头 + 该组分类行；表与表之间空 24px。
 * 每张表**各自一套列宽**（--nt-col-<表>-*，默认值见 core/table-cols.js）。
 *
 * 为什么单独一个文件：views/stats.js 只负责装配，ui/stats-category.js 负责三个区域的
 * 调度；把表格构建塞进去会顶破公约的 300 行上限。
 */

import { TABLE_DEFAULT_WIDTHS } from '../core/table-cols.js';
import { moneyAlways } from '../core/format.js';
import { mountResize, paintHandles, syncFrozen } from './table-layout.js';

/** 从上到下的排列顺序（用户 2026-11 指定） */
export const GROUP_ORDER = ['费用类', '收入类', '资产类', '负债类', '权益类', '成本类'];

/** 类型 → 列宽参数表 key */
const TABLE_OF = {
  费用类: 'fee',
  收入类: 'income',
  资产类: 'asset',
  负债类: 'liability',
  权益类: 'equity',
  成本类: 'cost',
};

/** 类型是不是存量口径（资产/负债/权益：期初/增加/减少/期末） */
const STOCK_TYPES = new Set(['资产类', '负债类', '权益类']);

/** 5 列（存量）或 4 列（流量）的表头定义 —— 没有序号列，手机放不下 */
function colsOf(type) {
  if (!STOCK_TYPES.has(type)) {
    const income = type === '收入类';
    return [
      ['分类', 'cat'],
      [income ? '本期收入' : '本期支出', 'gross'],
      ['本期退回', 'reverse'],
      ['净额', 'net'],
    ];
  }
  return [
    ['分类', 'cat'],
    ['期初', 'opening'],
    ['本期增加', 'increase'],
    ['本期减少', 'decrease'],
    ['期末', 'end'],
  ];
}

/** 存量余额：负债正数=欠款，负余额=多还（和应付同口径，不把负数硬掰成正）。 */
function stockAmount(value, type) {
  const n = Number(value) || 0;
  if (type === '负债类' && n < -0.005) return `多还 ${moneyAlways(Math.abs(n))}`;
  return moneyAlways(n);
}

function makeCell(text, cls) {
  const td = document.createElement('td');
  td.className = 'nt-cell' + (cls ? ' ' + cls : '');
  td.textContent = text == null ? '' : String(text);
  return td;
}

/** 组名 → 合计行里的类型名：'资产类' → '资产'（去掉「类」） */
function groupName(type) {
  return String(type || '').replace(/类$/, '');
}

/**
 * 金额行（合计行与数据行共用）：分类 | 金额…
 * 合计行的分类格放**类型名**（资产/负债/…），金额只留数字，不要「合计：」后缀。
 */
function makeRow(category, nums, total) {
  const tr = document.createElement('tr');
  tr.className = 'nt-row' + (total ? ' nt-stats-total-row' : '');
  tr.appendChild(makeCell(category, total ? 'nt-cell-total-name' : ''));
  for (const v of nums) tr.appendChild(makeCell(v, 'nt-cell-num'));
  return tr;
}

/**
 * 建一张分组小表。
 * 列宽写在 col 上：table-layout:fixed 下 col 优先于表头行，
 * 不写 col 时浏览器会按第一行的格子数重算列宽（实测会均分）。
 * 每列的宽度引用该表自己的变量，兜底值取该表的默认宽度。
 */
function buildGroupTable(g, table) {
  const stock = STOCK_TYPES.has(g.type);
  const cols = colsOf(g.type);
  const defs = String(TABLE_DEFAULT_WIDTHS[table] || '').split(',').map((x) => Number(x) || 0);
  const t = g.total || {};

  const el = document.createElement('table');
  el.className = 'nt-table nt-table-stat nt-table-' + table;

  const cg = document.createElement('colgroup');
  cols.forEach(([, key], i) => {
    const col = document.createElement('col');
    const expr = 'var(--nt-col-' + table + '-' + key + ', ' + (defs[i] || 80) + 'px)';
    col.style.width = expr;
    // 记住「参数表达式」：拖动后 col 会被写成 px，清内联时要恢复成它
    col.dataset.w = expr;
    cg.appendChild(col);
  });
  el.appendChild(cg);

  const thead = document.createElement('thead');
  // 合计行在表头**上边**：「资产」在序号列靠左、「合计：」在分类列靠右
  const totalNums = stock
    ? [stockAmount(t.opening, g.type), moneyAlways(t.increase), moneyAlways(t.decrease), stockAmount(t.end, g.type)]
    : [moneyAlways(t.gross), moneyAlways(t.reverse), moneyAlways(t.net)];
  // 合计行：类型名放在分类列（表头上边那行的第一格），金额只留数字
  thead.appendChild(makeRow(groupName(g.type), totalNums, true));

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
  el.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const c of g.categories) {
    const nums = stock
      ? [stockAmount(c.opening, g.type), moneyAlways(c.increase), moneyAlways(c.decrease), stockAmount(c.end, g.type)]
      : [moneyAlways(c.gross), moneyAlways(c.reverse), moneyAlways(c.net)];
    tbody.appendChild(makeRow(c.category, nums, false));
  }
  el.appendChild(tbody);
  return el;
}

/** 新表要不要「按 px 排」：参数写进 CSS 变量了就按 px（表宽 = 列宽之和） */
function markCustom(tableEl, table) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--nt-col-' + table + '-cat').trim();
  tableEl.classList.toggle('cols-custom', !!v);
}

/**
 * 把 6 大分类按固定顺序画进 host（有内容的才出表）。
 * @returns {number} 分类行总数
 */
export function renderGroupTables(host, groups) {
  if (!host) return 0;
  host.textContent = '';

  const list = (groups || []).slice().sort(
    (a, b) => GROUP_ORDER.indexOf(a.type) - GROUP_ORDER.indexOf(b.type),
  );

  let count = 0;
  for (const g of list) {
    const table = TABLE_OF[g.type];
    if (!table || !g.categories || !g.categories.length) continue;
    count += g.categories.length;
    const el = buildGroupTable(g, table);
    // 每张表套一个圆角外框（用户 2026-11：看上去像一张卡片）。
    // 边框放在 div 上而不是 table 上：border-collapse:collapse 的表格加 border-radius
    // 不生效（单元格边框会把四个角盖成直角）。
    const card = document.createElement('div');
    card.className = 'nt-stat-card';
    card.appendChild(el);
    host.appendChild(card);
    markCustom(el, table);
    // 表是动态建的，拖动绑定要补
    mountResize(el);
    paintHandles(el);
    syncFrozen(el);
  }

  if (!count) {
    const empty = document.createElement('div');
    empty.className = 'nt-stats-empty';
    empty.textContent = '本期没有数据';
    host.appendChild(empty);
  }
  return count;
}
