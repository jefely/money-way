// 核心：LifeVein 页（上下滑动的统计展示页）
/**
 * LifeVein 模型：流水 → 中域（资产 / 负债）的气泡行
 * 层：第一层 · core
 *
 * 口径见 nt/LIFEVEIN-PAGE.md：
 *   · 只画中域 —— 一笔流水至少有一端是资产 / 负债，才出一个泡；
 *   · 泡的大小 = 这一笔的金额；**余额是泡外那个数**，不由泡大小表示；
 *   · 余额 = 该节点在这笔之后的余额，借贷方向沿用 isDebitType（借增贷减）；
 *   · 草稿（status:'draft'）、缺端、零额都不出泡；期初照出，但标 isOpening；
 *   · 收入 / 支出按「收入类 / 费用类」的净额算（退回会把合计减回去）。
 *
 * 纯函数：不碰 DOM、不碰浏览器 API，Node 可直接测。
 */

import { ACCOUNT_TYPE, isDebitType, isPosted } from './schema.js';

/** 中域：钱在这里蓄水或过桥。左域是收入 / 权益，右域是费用 / 成本。 */
export const MIDDLE_TYPES = [ACCOUNT_TYPE.ASSET, ACCOUNT_TYPE.LIABILITY];

/** 这个账户类型属不属于中域 */
export function isMiddleType(type) {
  return MIDDLE_TYPES.includes(type);
}

/** 日期升序，同一天按 seq —— 与流水表的排序口径一致。 */
function byDateSeq(a, b) {
  const d = String(a.date || '').localeCompare(String(b.date || ''));
  if (d) return d;
  return (Number(a.seq) || 0) - (Number(b.seq) || 0);
}

/** 这一笔对某个账户余额的影响（金额永远正数，方向由类型决定）。 */
function deltaOf(acc, dir, amount) {
  const debit = isDebitType(acc.type);
  if (dir === 'in') return debit ? amount : -amount;
  return debit ? -amount : amount;
}

/**
 * 建整页的数据。
 * @param {{accounts?:Array, transactions?:Array}} state
 * @returns {{rows:Array, totals:{income:number,expense:number,net:number,count:number}, span:{from:string,to:string}}}
 */
export function buildLifeVein(state) {
  const accounts = (state && state.accounts) || [];
  const byId = new Map();
  for (const a of accounts) if (a && a.id) byId.set(a.id, a);

  const list = ((state && state.transactions) || [])
    .filter(isPosted)
    .slice()
    .sort(byDateSeq);

  const bal = new Map();
  const rows = [];
  const totals = { income: 0, expense: 0, net: 0, count: 0 };

  for (const t of list) {
    const amount = Number(t && t.amount) || 0;
    if (!amount) continue;
    const from = byId.get(t.from_id);
    const to = byId.get(t.to_id);

    // 余额先滚：这一笔对两端各自的影响
    if (from) bal.set(from.id, (bal.get(from.id) || 0) + deltaOf(from, 'out', amount));
    if (to) bal.set(to.id, (bal.get(to.id) || 0) + deltaOf(to, 'in', amount));

    // 收入 / 支出按净额：收入类是**转出**才叫收入（B 极），
    // 费用类是**转入**才叫支出（A 极）；反向的那一端就是退回，减回去。
    if (from && from.type === ACCOUNT_TYPE.INCOME) totals.income += amount;
    if (to && to.type === ACCOUNT_TYPE.INCOME) totals.income -= amount;
    if (to && to.type === ACCOUNT_TYPE.EXPENSE) totals.expense += amount;
    if (from && from.type === ACCOUNT_TYPE.EXPENSE) totals.expense -= amount;

    // 气泡：只在「至少一端是中域」时出
    const fromMid = !!from && isMiddleType(from.type);
    const toMid = !!to && isMiddleType(to.type);
    if (!fromMid && !toMid) continue;

    let node = from;
    let other = to;
    let dir = 'out';
    if (fromMid && toMid) dir = 'transfer';
    else if (toMid) { node = to; other = from; dir = 'in'; }

    rows.push({
      key: String(t.id || ('lv_' + rows.length)),
      date: String(t.date || ''),
      dir,
      nodeId: node.id,
      nodeName: String(node.name || ''),
      otherName: other ? String(other.name || '') : '',
      // 转账 / 还款时，另一端也在动：它这笔之后的余额（泡外只看 node 的余额，
      // 但「还完这张卡还欠多少」需要它，见工具与测试）
      otherBalance: other ? (bal.get(other.id) || 0) : 0,
      amount,
      balance: bal.get(node.id) || 0,
      isOpening: !!t.opening,
      note: String(t.note || ''),
    });
  }

  totals.net = totals.income - totals.expense;
  totals.count = rows.length;
  return {
    rows,
    totals,
    span: {
      from: rows.length ? rows[0].date : '',
      to: rows.length ? rows[rows.length - 1].date : '',
    },
  };
}
