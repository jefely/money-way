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
 *   历史结余  = 区间起点那一刻的余额（= 区间前的净额，方向按账户类型）
 * 没有区间时（全部）区间即「全部流水」，历史恒为 0。
 */

import { isDebitType, isPosted } from './schema.js';

/** 统计页的类型分组顺序（与界面一致：先资产，最后费用；成本类跟在资产后面） */
export const STAT_TYPE_ORDER = ['资产类', '成本类', '负债类', '收入类', '权益类', '费用类'];

const EMPTY = {
  opening: 0, balance: 0, periodOut: 0, periodIn: 0,
  historyOut: 0, historyIn: 0, historyBalance: 0,
};

/** 把一份汇总累加进另一份（就地修改 target）。 */
function addInto(target, s) {
  target.opening += s.opening;
  target.balance += s.balance;
  target.periodOut += s.periodOut;
  target.periodIn += s.periodIn;
  target.historyOut += s.historyOut;
  target.historyIn += s.historyIn;
  target.historyBalance += s.historyBalance;
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
  const out = {
    opening: 0, balance: 0, periodOut: 0, periodIn: 0,
    historyOut: 0, historyIn: 0, historyBalance: 0,
  };
  if (!id) return out;

  let totalOut = 0;
  let totalIn = 0;

  for (const t of transactions || []) {
    if (!isPosted(t)) continue;
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

  // 历史结余 = 区间起点那一刻的余额。期初流水（2000-01-01）落在区间之前，
  // 已经算进 historyIn，所以这里不用再单独加 opening。
  out.historyBalance = isDebitType(account.type)
    ? out.historyIn - out.historyOut
    : out.historyOut - out.historyIn;

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

const STOCK_TYPES = new Set(['资产类', '负债类', '权益类']);

/** 分类统计要的口径：存量看期初/本期增减/期末；流量只看本期发生与净额。 */
function periodView(row, type) {
  const debit = isDebitType(type);
  if (STOCK_TYPES.has(type)) {
    const openingSigned = Number(row.historyBalance) || 0;
    // 所有贷方类（负债 / 权益 / 收入）都按「转出增加、转入减少」，
    // 和应付同口径；负债的负余额就是多还（借方余额），由界面单独标「多还」。
    const inc = debit ? row.periodIn : row.periodOut;
    const dec = debit ? row.periodOut : row.periodIn;
    return { ...row, kind: 'stock', opening: openingSigned, increase: inc, decrease: dec, end: openingSigned + inc - dec };
  }
  // 收入：转出是收入、转入是退回；费用/成本：转入是支出、转出是退回。
  const gross = debit ? row.periodIn : row.periodOut;
  const reverse = debit ? row.periodOut : row.periodIn;
  return { ...row, kind: 'flow', gross, reverse, net: gross - reverse };
}

/** 合计从分类行直接加总，避免类型合计和分类行出现两套口径。 */
function sumRows(categories, kind) {
  const out = { count: 0, category: '' };
  const keys = kind === 'stock'
    ? ['opening', 'increase', 'decrease', 'end']
    : ['gross', 'reverse', 'net'];
  for (const k of keys) out[k] = 0;
  for (const c of categories) {
    out.count += c.count || 0;
    for (const k of keys) out[k] += c[k] || 0;
  }
  return out;
}

/**
 * 分类统计拆成左右两块：
 *   stock —— 资产 / 负债 / 权益（期初、本期增加、本期减少、期末；负债为正数欠款）
 *   flow  —— 收入 / 费用 / 成本（本期发生、本期退回、净额；没有余额概念）
 * 分类按「期末绝对值 / 净额绝对值」降序，重点在前。
 */
export function categoryPanels(accounts, transactions, range) {
  const groups = categoryGroups(accounts, transactions, range);
  const out = { stock: [], flow: [] };
  for (const g of groups) {
    const stock = STOCK_TYPES.has(g.type);
    const categories = g.categories
      .map((c) => periodView(c, g.type))
      .filter((c) => (stock
        ? (c.opening || c.increase || c.decrease || c.end)
        : (c.gross || c.reverse || c.net)))
      .sort((a, b) => (stock ? Math.abs(b.end) - Math.abs(a.end) : Math.abs(b.net) - Math.abs(a.net)));
    // 整类都是 0 的不占一行：分类统计只看“有金额”的分类，空壳留给汇总视图看。
    if (!categories.length) continue;
    out[stock ? 'stock' : 'flow'].push({
      ...g,
      total: sumRows(categories, stock ? 'stock' : 'flow'),
      categories,
    });
  }
  return out;
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
    // 期初方向随账户性质：资产是「期初→账户」，负债/权益/收入是「账户→期初」
    if (t.opening && (t.to_id === id || t.from_id === id)) sum += Number(t.amount) || 0;
  }
  return sum;
}

/**
 * 期初日期：账本里最早一笔流水的前一天 23:59:59 —— 保证期初永远排在第一笔之前
 * （用户 2026-10-30 指定的「最早流水之前 1 秒」）。没有流水时沿用 2000-01-01。
 */
export function openingDateFor(txs) {
  let first = '';
  for (const t of txs || []) {
    if (!t || t.opening || t.status === 'draft') continue;
    const d = String(t.date || '').slice(0, 10);
    if (!d) continue;
    if (!first || d < first) first = d;
  }
  if (!first) return '2000-01-01';

  const dt = new Date(first + 'T00:00:00');
  dt.setDate(dt.getDate() - 1);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T23:59:59`;
}

/** 把全部期初流水的日期对齐到 openingDateFor（没有变化就原样返回） */
export function syncOpeningDates(state) {
  const txs = (state && state.transactions) || [];
  const date = openingDateFor(txs);
  let changed = false;
  const next = txs.map((t) => {
    if (!t || !t.opening || t.date === date) return t;
    changed = true;
    return { ...t, date };
  });
  return changed ? { ...state, transactions: next } : state;
}

/**
 * 本月的起止日期（账户表的「当期」口径）。
 * @param {Date} [now] 便于测试注入
 */
export function currentMonthRange(now) {
  const d = now || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(last).padStart(2, '0')}` };
}
