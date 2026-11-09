// 数据：分期的「每期手填」矩阵（纯函数，Node 可跑）
/**
 * 分期矩阵
 * 层：第一层 · 数据基座
 *
 * 单文件版的分期是「一条占两行、每格自己填」：cells = { '2026-08': { p, i } }。
 * 这里只做四件事：读出来（没有手填就按均摊铺一份）、写一格、求和、算月份范围。
 *
 * 为什么单独一个文件：UI 那边只负责把格子画出来，所有「这一期是多少、
 * 一共几期、从哪个月到哪个月」都在这里算，Node 里能直接测。
 */

import { addMonths, monthsBetween } from './installment-engine.js';
import { normalizeMonth } from './schema.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** 最多铺多少个月份列（比任何分期都长，防止手滑填出个 9999-12） */
export const MAX_MONTHS = 60;

/**
 * 这条分期的有效矩阵。
 * 有手填（inst.cells）就用它；没有就按 principal ÷ periods 均摊生成一份**不落库**的。
 *
 * @returns {Record<string, {p:number, i:number}>}
 */
export function cellsOf(row) {
  const inst = (row && row.inst) || {};
  if (inst.cells && typeof inst.cells === 'object' && Object.keys(inst.cells).length) {
    return inst.cells;
  }

  const n = Math.max(0, Math.floor(Number(inst.periods) || 0));
  const first = normalizeMonth(inst.firstMonth);
  if (!n || !first) return {};

  const p = round2((Number(inst.principal) || 0) / n);
  const i = round2((Number(inst.interest) || 0) / n);
  const out = {};
  for (let k = 0; k < n; k += 1) out[addMonths(first, k)] = { p, i };
  return out;
}

/** 写一格（返回**新的** cells，不改入参） */
export function setCell(cells, month, part, value) {
  const m = normalizeMonth(month);
  if (!m) return cells;
  const base = { ...(cells || {}) };
  const cur = base[m] ? { ...base[m] } : { p: 0, i: 0 };
  const v = part === 'i' ? 'i' : 'p';
  const n = Math.abs(Number(String(value == null ? '' : value).replace(/[¥,\s]/g, '')) || 0);
  cur[v] = round2(n);
  if (!cur.p && !cur.i) delete base[m]; else base[m] = cur;
  return base;
}

/** 一段月份里的合计（part = 'p' 本金 / 'i' 利息） */
export function sumOf(cells, part, span) {
  const v = part === 'i' ? 'i' : 'p';
  let total = 0;
  for (const m of span || []) total += Number((cells[m] || {})[v]) || 0;
  return round2(total);
}

/** 整条分期的本金 / 利息总额（不看范围，全部格子） */
export function totalsOf(cells) {
  let p = 0;
  let i = 0;
  for (const m of Object.keys(cells || {})) {
    p += Number(cells[m].p) || 0;
    i += Number(cells[m].i) || 0;
  }
  return { p: round2(p), i: round2(i) };
}

/**
 * 月份列的范围。
 *
 * 优先用用户设的起止月（range.from / range.to，'YYYY-MM'），
 * 没设就按现有分期的首月到最后一期自动算，并且至少含当月。
 *
 * @param {Array} rows 分期列表
 * @param {{from?:string, to?:string}} [range]
 * @param {string} nowMonth
 * @returns {string[]} 形如 ['2026-08', '2026-09', …]
 */
export function spanOf(rows, range, nowMonth, hidden) {
  const skip = new Set();
  for (const m of hidden || []) {
    const n = normalizeMonth(m);
    if (n) skip.add(n);
  }
  const from = normalizeMonth(range && range.from);
  const to = normalizeMonth(range && range.to);
  const now = normalizeMonth(nowMonth) || '';

  let first = from || '';
  let last = to || '';

  if (!from || !to) {
    for (const row of rows || []) {
      const cells = cellsOf(row);
      for (const m of Object.keys(cells)) {
        const c = cells[m];
        if (!c || (!Number(c.p) && !Number(c.i))) continue;
        if (!first || m < first) first = m;
        if (!last || m > last) last = m;
      }
    }
  }
  if (!first) first = now;
  if (!last) last = now;
  if (!first || !last) return [];
  if (first > last) { const t = first; first = last; last = t; }

  const n = monthsBetween(first, last);
  const count = Math.min(MAX_MONTHS, (Number.isFinite(n) ? n : 0) + 1);
  const out = [];
  for (let k = 0; k < count; k += 1) {
    const m = addMonths(first, k);
    if (!skip.has(m)) out.push(m);
  }
  return out;
}
