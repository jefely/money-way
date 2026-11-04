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

/**
 * 最多铺多少个月份列。
 *
 * 这是**整张表**的上限，不是一条分期的期数上限（单文件版的分期工具栏
 * 也是 120）。原来的 60 只够一条五年期分期，却不够「整个账本的历史 +
 * 刚加的新分期」：最早那格在 2021-11、新加的分期从 2026-11 开始时，
 * 从最早的月份数 60 格正好停在 2026-10，新记录的所有月份格落在窗口外，
 * 整条变成空白（2026-11 用户实测「添加后没有具体分期」）。
 */
export const MAX_MONTHS = 120;

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
 * 优先用起止月（range.from / range.to，'YYYY-MM'，nt 目前没有这个 UI）；
 * 没设就按现有分期的首月到最后一期自动算。
 * 超过 MAX_MONTHS 时保留**最新**的一段 —— 新加的分期必须在窗口里，
 * 否则它整条月份格都会是空的（见上面 MAX_MONTHS 的注释）。
 *
 * @param {Array} rows 分期列表
 * @param {{from?:string, to?:string}} [range]
 * @param {string} nowMonth 一条分期都没有时用它兜底
 * @param {string[]} [hidden] 用户点过「删除」的月份
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
  const spanMonths = (Number.isFinite(n) ? n : 0) + 1;
  const count = Math.min(MAX_MONTHS, spanMonths);

  // 超上限时**保留最新的一头**。
  // 从最早那格开始数会正好把刚加的分期甩出窗口：2021-11 起、加一条
  // 2026-11 起的分期，60 格停在 2026-10 —— 新记录整条月份全空。
  // 分期表最关心的是「现在和以后还要还多少」，所以截掉的是更早的历史；
  // 只要窗口里还有那条分期的任何一格，它就不会变成空行。
  const start = spanMonths > MAX_MONTHS ? addMonths(last, -(MAX_MONTHS - 1)) : first;

  const out = [];
  for (let k = 0; k < count; k += 1) {
    const m = addMonths(start, k);
    if (!skip.has(m)) out.push(m);
  }
  return out;
}
