// 界面：统计页的六类小表（分类汇总与节点汇总共用同一套构建器）
/**
 * 六类小表（收入 / 负债 / 权益 / 资产 / 费用 / 成本）
 * 层：第五层 · UI
 *
 * 两个视图只差第一列和第几张列宽参数：
 *   分类汇总 → 第一列「分类」，每类一套列宽（分类-费用 … 分类-成本）
 *   节点汇总 → 第一列「节点」，六类共用一套（节点汇总）
 * 四列数值与列名完全一致，来自 core/stats-panels.js，这里只负责画。
 *
 * 每类一张独立小表：合计行 + 表头 + 该组数据行；表与表之间空 24px。
 */

import { TABLE_DEFAULT_WIDTHS } from '../core/table-cols.js';
import { moneyAlways } from '../core/format.js';
import { STAT_COLS, STAT_FIELDS, STAT_ORDER } from '../core/stats-panels.js';
import { mountResize, paintHandles, syncFrozen } from './table-layout.js';

/**
 * 5 列的列 key。**按位置命名，不按语义**：
 * 同一个 `opening` 在资产表里是「期初余额」，在费用表里是「历史累计」。
 * 这样六张表的列宽参数结构一致，加一类不用再发明一套键。
 */
const COL_KEYS = ['cat', 'opening', 'increase', 'decrease', 'end'];

/** 分类视图：类型 → 列宽参数表 key（每类一套） */
export const TABLE_OF = {
  费用类: 'fee',
  收入类: 'income',
  资产类: 'asset',
  负债类: 'liability',
  权益类: 'equity',
  成本类: 'cost',
};

/** 负债的负余额就是多还（借方余额），不把负数硬掰成正欠款 */
function amount(value, type, signed) {
  const n = Number(value) || 0;
  if (signed && type === '负债类' && n < -0.005) return `多还 ${moneyAlways(Math.abs(n))}`;
  return moneyAlways(n);
}

function makeCell(text, cls) {
  const td = document.createElement('td');
  td.className = 'nt-cell' + (cls ? ' ' + cls : '');
  td.textContent = text == null ? '' : String(text);
  return td;
}

/** 组名 → 合计行里的类型名：'资产类' → '资产' */
function groupName(type) {
  return String(type || '').replace(/类$/, '');
}

/** 一行的 4 个金额格（合计行与数据行共用） */
function amountCells(src, type) {
  return STAT_FIELDS.map((k, i) => {
    // 第 1 / 第 4 列是余额性质，负债类才需要「多还」；中间两列是发生额，恒正
    const signed = i === 0 || i === 3;
    return makeCell(amount(src[k], type, signed), 'nt-cell-num');
  });
}

function makeRow(label, cells, total) {
  const tr = document.createElement('tr');
  tr.className = 'nt-row' + (total ? ' nt-stats-total-row' : '');
  tr.appendChild(makeCell(label, total ? 'nt-cell-total-name' : ''));
  for (const c of cells) tr.appendChild(c);
  return tr;
}

/** 表头文字：第 1 列由调用方给，后 4 列来自 STAT_COLS */
function headLabels(type, firstCol) {
  return [firstCol].concat(STAT_COLS[type] || STAT_COLS.资产类);
}

/**
 * 建一张分组小表。
 * 列宽写在 col 上：table-layout:fixed 下 col 优先于表头行，
 * 不写 col 时浏览器会按第一行的格子数重算列宽（实测会均分）。
 */
function buildTable(g, table, firstCol) {
  const type = g.type;
  const defs = String(TABLE_DEFAULT_WIDTHS[table] || '').split(',').map((x) => Number(x) || 0);
  const labels = headLabels(type, firstCol);

  const el = document.createElement('table');
  el.className = 'nt-table nt-table-stat nt-table-' + table;

  // 只有第 1 列（分类 / 节点）是固定 px，由 `分类统计/列宽` 参数驱动、七张表共用。
  // 后面 4 个金额列**故意不写宽度**：table-layout:fixed 会把剩余空间平均分给它们，
  // 所以「金额列自动等宽」不用 JS 算，拖分类列右边缘时它们自己就重新均分了。
  const cg = document.createElement('colgroup');
  COL_KEYS.forEach((key, i) => {
    const col = document.createElement('col');
    if (i === 0) {
      const expr = 'var(--nt-col-' + table + '-cat, ' + (defs[0] || 62) + 'px)';
      col.style.width = expr;
      // 记住「参数表达式」：拖动后 col 会被写成 px，清内联时要恢复成它
      col.dataset.w = expr;
    }
    cg.appendChild(col);
  });
  el.appendChild(cg);

  const thead = document.createElement('thead');
  // 合计行在表头**上边**：类型名放在第 1 列，金额只留数字
  thead.appendChild(makeRow(groupName(type), amountCells(g.total || {}, type), true));

  const headRow = document.createElement('tr');
  labels.forEach((label, i) => {
    const th = document.createElement('th');
    th.className = 'nt-th';
    th.scope = 'col';
    th.dataset.col = COL_KEYS[i];
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  el.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const r of g.rows) {
    tbody.appendChild(makeRow(r.key, amountCells(r, type), false));
  }
  el.appendChild(tbody);
  return el;
}

/** 新表要不要「按 px 排」：参数写进 CSS 变量了就按 px（表宽 = 列宽之和） */
function markCustom(tableEl, table) {
  // 统计小表 2026-11 起**永远是 100% 宽**（表宽跟屏幕走，金额列由 CSS 均分），
  // 不再切 .cols-custom —— 那个类会把表改成 max-content，金额列就没法均分了。
  if (!table) return;
  tableEl.classList.remove('cols-custom');
}

/**
 * 把六类按固定顺序画进 host（有内容的才出表）。
 *
 * @param {HTMLElement} host 容器
 * @param {Array} groups core/stats-panels.js 的输出
 * @param {{firstCol:string, table?:string, tableOf?:object, empty?:string}} opts
 *        table  = 六类共用一个列宽参数（节点汇总）
 *        tableOf = 每类一套（分类汇总）
 * @returns {number} 数据行总数
 */
export function renderStatTables(host, groups, opts) {
  if (!host) return 0;
  const o = opts || {};
  const firstCol = o.firstCol || '分类';
  const tableOf = o.tableOf || TABLE_OF;
  host.textContent = '';

  const list = (groups || []).slice().sort(
    (a, b) => STAT_ORDER.indexOf(a.type) - STAT_ORDER.indexOf(b.type),
  );

  let count = 0;
  for (const g of list) {
    if (!g.rows || !g.rows.length) continue;
    count += g.rows.length;
    const table = o.table || tableOf[g.type] || 'node';
    const el = buildTable(g, table, firstCol);
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
    empty.textContent = o.empty || '本期没有数据';
    host.appendChild(empty);
  }
  return count;
}
