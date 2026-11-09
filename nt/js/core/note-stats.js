// 核心：备注统计（关键字 → 金额，再按备注类型分组合计）
/**
 * 备注统计
 * 层：第一层 · core
 *
 * 用户 2026-11-08：备注统计支持两级 ——
 *   一级按**关键字**（味丰源）合计金额，二级再按备注的**统计分类**（类型）分别合计。
 *
 * 它**不参与平账**：不改任何流水、不查借贷是否平衡，只是把已经发生的金额累加起来。
 * 累加出来怎么用（预算、对账、看占比），由用户自己判断。
 *
 * 纯函数：不读写 state。
 */

import { isDebit } from './stats.js';

const norm = (v) => String(v == null ? '' : v).trim();

/**
 * 关键字 → 备注类型 的映射（来自备注表）。
 * @param {Array} notes
 */
export function typeOfKeyword(notes) {
  const map = new Map();
  for (const n of notes || []) {
    const kw = norm(n && n.keyword);
    if (!kw) continue;
    map.set(kw, norm(n && n.type));
  }
  return map;
}

/**
 * 两级合计：按「关键字 + 备注类型」分组。
 * @param {object} state
 * @returns {Array<{keyword:string, type:string, count:number, sum:number}>}
 */
export function noteTotals(state, range) {
  const start = String((range && range.start) || '');
  const end = String((range && range.end) || '9999-12-31');
  const typeOf = typeOfKeyword((state && state.notes) || []);
  const map = new Map();
  for (const t of (state && state.transactions) || []) {
    if (!t) continue;
    const d = String(t.date || '');
    if (start && d < start) continue;
    if (d > end) continue;
    const amt = Math.abs(Number(t.amount) || 0);
    if (!(amt > 0)) continue;
    const kw = norm(t.noteKeyword);
    if (!kw) continue;
    const type = typeOf.get(kw) || '';
    const key = kw + '\u0000' + type;
    const cur = map.get(key) || { keyword: kw, type, count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += amt;
    map.set(key, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, sum: Math.round(r.sum * 100) / 100 }))
    .sort((a, b) => b.sum - a.sum);
}

/** 二级合计：按备注分类（type）合并 */
export function rollupByType(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const label = r.type || '（未设分类）';
    const cur = map.get(label) || { label, count: 0, sum: 0 };
    cur.count += r.count;
    cur.sum += r.sum;
    map.set(label, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, sum: Math.round(r.sum * 100) / 100 }))
    .sort((a, b) => b.sum - a.sum);
}

/**
 * 一级合计：只看关键字（把类型合并掉）。
 * @param {Array} rows noteTotals() 的结果
 */
export function rollupByKeyword(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const cur = map.get(r.keyword) || { keyword: r.keyword, count: 0, sum: 0, types: [] };
    cur.count += r.count;
    cur.sum += r.sum;
    cur.types.push({ type: r.type, count: r.count, sum: r.sum });
    map.set(r.keyword, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, sum: Math.round(r.sum * 100) / 100 }))
    .sort((a, b) => b.sum - a.sum);
}

/** 某个关键字命中的流水（按日期倒序） */
export function rowsOfKeyword(state, keyword) {
  const kw = norm(keyword);
  if (!kw) return [];
  return ((state && state.transactions) || [])
    .filter((t) => t && norm(t.noteKeyword) === kw)
    .slice()
    .sort((a, b) => (String(b.date) < String(a.date) ? -1 : String(b.date) > String(a.date) ? 1 : 0));
}


/**
 * 备注的「期初/本期流入/本期流出/期末」——沿用节点统计表的四列口径。
 * 流入/流出按流水的**来源账户**分：来源是贷方(B 区)记为流入，来源是借方(A 区)记为流出。
 * 只算有金额的流水；本期没有任何流水的备注不列（期初只用于算期末）。
 */
export function noteBalances(state, range) {
  const start = String((range && range.start) || '');
  const end = String((range && range.end) || '9999-12-31');
  const accById = new Map(((state && state.accounts) || []).map((a) => [a.id, a]));
  const typeOf = typeOfKeyword((state && state.notes) || []);
  const map = new Map();
  for (const t of (state && state.transactions) || []) {
    if (!t) continue;
    const amt = Math.abs(Number(t.amount) || 0);
    if (!(amt > 0)) continue;
    const kw = norm(t.noteKeyword);
    if (!kw) continue;
    const d = String(t.date || '');
    if (d > end) continue;
    const from = accById.get(t.from_id);
    const inFlow = from ? !isDebit(from) : false;
    const cur = map.get(kw) || { keyword: kw, type: typeOf.get(kw) || '', opening: 0, increase: 0, decrease: 0 };
    if (d < start) cur.opening += inFlow ? amt : -amt;
    else {
      if (inFlow) cur.increase += amt; else cur.decrease += amt;
    }
    map.set(kw, cur);
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return [...map.values()]
    .filter((r) => r.increase > 0 || r.decrease > 0)
    .map((r) => ({ ...r, opening: r2(r.opening), increase: r2(r.increase), decrease: r2(r.decrease), end: r2(r.opening + r.increase - r.decrease) }))
    .sort((a, b) => b.end - a.end);
}

/** 备注分类小表：把关键字行按分类合并（四列分别相加） */
export function rollupBalancesByType(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const label = r.type || '（未设分类）';
    const cur = map.get(label) || { label, opening: 0, increase: 0, decrease: 0, end: 0 };
    cur.opening += r.opening;
    cur.increase += r.increase;
    cur.decrease += r.decrease;
    cur.end += r.end;
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.end - a.end);
}
