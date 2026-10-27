// 界面：（无界面）账本统计
/**
 * 账本统计（纯 Σ流水）
 * 层：第一层 · 数据基座
 *
 * 给「统计」页提供三样东西，全部是纯数据（不碰 DOM）：
 *   1. accountSummary        单账户汇总：余额 / 区间转出转入 / 区间前历史
 *   2. categoryGroups        分类视图：类型 → 统计分类 的聚合，带每类与每类型合计
 *   3. accountRows           汇总视图：每个账户一行，按 类型 → 分类 → 名称 排序
 *
 * 方向规则与 balance-calculator.js 完全一致：
 *   资产类 / 费用类 = 转入增加、转出减少；其余类型相反。
 *
 * 口径（页面上的三列）：
 *   当前结余  = 到「现在」为止的余额，**不随区间变**
 *   转出/转入 = 落在区间 [start, end] 内的金额
 *   转出历史/转入历史 = 落在区间**之前**（date < start）的金额
 * 没有区间时（全部）区间即「全部流水」，历史恒为 0。
 */

import { isDebitType } from './schema.js';

/** 统计页的类型分组顺序（与界面一致：先资产，最后费用） */
export const STAT_TYPE_ORDER = ['资产类', '负债类', '收入类', '权益类', '费用类'];

const EMPTY = { opening: 0, balance: 0, periodOut: 0, periodIn: 0, historyOut: 0, historyIn: 0 };

/** 把一份汇总累加进另一份（就地修改 target）。 */
function addInto(target, s) {
  target.opening += s.opening;
  target.balance += s.balance;
  target.periodOut += s.periodOut;
  target.periodIn += s.periodIn;
  target.historyOut += s.historyOut;
  target.historyIn += s.historyIn;
  return target;
}

/**
 * 单账户汇总。
 * @param {{id:string,type:string}} account
 * @param {Array<{from_id:string,to_id:string,amount:number,date:string,opening?:boolean}>} transactions
 * @param {{start?:string,end?:string}} [range]
 * @returns {{opening:number,balance:number,periodOut:number,periodIn:number,historyOut:number,historyIn:number}}
 */
export function accountSummary(account, transactions, range) {
  const id = account && account.id;
  const start = (range && range.start) || '';
  const end = (range && range.end) || '9999-12-31';
  const out = { opening: 0, balance: 0, periodOut: 0, periodIn: 0, historyOut: 0, historyIn: 0 };
  if (!id) return out;

  let totalOut = 0;
  let totalIn = 0;

  for (const t of transactions || []) {
    const amt = Number((t && t.amount) || 0);
    if (!amt) continue;
    const d = String((t && t.date) || '');
    const isOut = t.from_id === id;
    const isIn = t.to_id === id;
    if (!isOut && !isIn) continue;

    if (isOut) totalOut += amt;
    if (isIn) totalIn += amt;
    if (t.opening && (isIn || isOut)) out.opening += amt;

    if (d >= start && d <= end) {
      if (isOut) out.periodOut += amt;
      if (isIn) out.periodIn += amt;
    } else if (d < start) {
      if (isOut) out.historyOut += amt;
      if (isIn) out.historyIn += amt;
    }
  }

  out.balance = isDebitType(account.type) ? totalIn - totalOut : totalOut - totalIn;
  return out;
}

/** 全部可见账户的汇总（隐藏账户不参与统计）。 */
export function summariesForAccounts(accounts, transactions, range) {
  return (accounts || [])
    .filter((a) => a && !a.isHidden)
    .map((acc) => ({ acc, s: accountSummary(acc, transactions, range) }));
}

function typeIndex(type) {
  const i = STAT_TYPE_ORDER.indexOf(type);
  return i < 0 ? 99 : i;
}

function byZh(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'zh');
}

/**
 * 分类视图：按 类型 → 统计分类 聚合。
 * @returns {Array<{type:string, total:object, categories:Array<{category:string,count:number} & object>}>}
 */
export function categoryGroups(accounts, transactions, range) {
  const summaries = summariesForAccounts(accounts, transactions, range);
  const byType = new Map();

  for (const { acc, s } of summaries) {
    const type = acc.type;
    if (!byType.has(type)) {
      byType.set(type, { type, total: { ...EMPTY }, categories: new Map() });
    }
    const group = byType.get(type);
    addInto(group.total, s);

    const cat = String(acc.category || '').trim() || '未分类';
    if (!group.categories.has(cat)) {
      group.categories.set(cat, { category: cat, count: 0, ...EMPTY });
    }
    const row = group.categories.get(cat);
    row.count += 1;
    addInto(row, s);
  }

  const groups = [];
  for (const type of STAT_TYPE_ORDER) {
    const g = byType.get(type);
    if (!g) continue;
    groups.push({
      type,
      total: g.total,
      categories: [...g.categories.values()].sort((a, b) => byZh(a.category, b.category)),
    });
    byType.delete(type);
  }
  // 兜底：STAT_TYPE_ORDER 之外的类型（未来扩展）
  for (const g of byType.values()) {
    groups.push({
      type: g.type,
      total: g.total,
      categories: [...g.categories.values()].sort((a, b) => byZh(a.category, b.category)),
    });
  }
  return groups;
}

/** 汇总视图：每个账户一行，按 类型 → 分类 → 名称 排序。 */
export function accountRows(accounts, transactions, range) {
  const summaries = summariesForAccounts(accounts, transactions, range);
  return summaries.slice().sort((a, b) => {
    const d = typeIndex(a.acc.type) - typeIndex(b.acc.type);
    if (d) return d;
    const c = byZh(a.acc.category, b.acc.category);
    if (c) return c;
    return byZh(a.acc.name, b.acc.name);
  });
}

/**
 * 某个账户的期初 = 该账户所有 opening 流水的金额之和。
 * 纯计算，放在 core 里让统计页和设置页共用。
 */
export function openingOf(state, id) {
  let sum = 0;
  for (const t of (state && state.transactions) || []) {
    if (t.opening && t.to_id === id) sum += Number(t.amount) || 0;
  }
  return sum;
}
