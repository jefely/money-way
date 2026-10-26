/**
 * 纯函数：金额与统计计算。
 *
 * 依赖隔离（公约 3.3）：本文件不得 import 任何 DOM/存储 API，
 * 必须能在 Node 下直接跑测试。
 */

/** 账户性质 → 借贷方向。资产类/费用类 = 借增贷减（debit），其余相反。 */
export const DEBIT_CATS = ['资产类', '费用类'];

export function isDebit(acc) {
  return DEBIT_CATS.includes(acc && acc.cat);
}

/** 金额安全解析：非法输入一律 0，绝不让 NaN 流进余额。 */
export function toAmount(v) {
  const n = Number(String(v == null ? '' : v).replace(/[¥,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * 单账户在区间内的统计。
 * @param {{cat:string, opening:number|string}} acc
 * @param {{tOut:number,tIn:number,pOut:number,pIn:number,hOut:number,hIn:number}} bucket
 * @returns {{balance:number, mOut:number, mIn:number, hOut:number, hIn:number}}
 */
export function computeAccountStats(acc, bucket) {
  const v = bucket || { tOut: 0, tIn: 0, pOut: 0, pIn: 0, hOut: 0, hIn: 0 };
  const opening = toAmount(acc && acc.opening);
  const balance = isDebit(acc)
    ? opening + v.tIn - v.tOut
    : opening + v.tOut - v.tIn;
  return { balance, mOut: v.pOut, mIn: v.pIn, hOut: v.hOut, hIn: v.hIn };
}

/**
 * 一次扫描，把所有流水的金额按账户聚合成六个桶。
 * 纯函数：不读 state、不写 state，只吃参数。
 *
 * 桶语义：
 *   tOut/tIn  到区间末为止的累计（算余额用）
 *   pOut/pIn  区间内
 *   hOut/hIn  区间之前
 *
 * @param {Array} transactions
 * @param {Array} accounts
 * @param {{start:string,end:string}} range
 * @returns {Map<string, object>} key = `id:<id>` 或 `n:<name>`
 */
export function aggregateBuckets(transactions, accounts, range) {
  const start = (range && range.start) || '';
  const end = (range && range.end) || '9999-99-99';

  const byName = new Map();
  for (const a of accounts || []) byName.set(a.name, 'id:' + a.id);

  const empty = () => ({ tOut: 0, tIn: 0, pOut: 0, pIn: 0, hOut: 0, hIn: 0 });
  const map = new Map();
  const bucket = (k) => {
    let v = map.get(k);
    if (!v) { v = empty(); map.set(k, v); }
    return v;
  };

  for (const t of transactions || []) {
    const amt = toAmount(t && t.amount);
    const d = String((t && t.date) || '');
    if (!amt || !d) continue;

    const from = String((t && t.from) || '').trim();
    const to = String((t && t.to) || '').trim();
    const rowKey = t.fromId ? 'id:' + t.fromId : (byName.get(from) || (from ? 'n:' + from : ''));
    const inKey = t.toId ? 'id:' + t.toId : (byName.get(to) || (to ? 'n:' + to : ''));

    const after = d > end;
    const inRange = d >= start && d <= end;
    const before = d < start;

    if (rowKey) {
      const v = bucket(rowKey);
      if (!after) v.tOut += amt;
      if (inRange) v.pOut += amt; else if (before) v.hOut += amt;
    }
    if (inKey) {
      const v = bucket(inKey);
      if (!after) v.tIn += amt;
      if (inRange) v.pIn += amt; else if (before) v.hIn += amt;
    }
  }
  return map;
}

/** 从聚合表里取某账户的桶（先按 id 再按名字兜底）。 */
export function bucketOf(map, acc) {
  if (!map || !acc) return null;
  return map.get('id:' + acc.id) || map.get('n:' + acc.name) || null;
}

/** 全部账户的统计结果（供表格渲染，纯数据）。 */
export function statsForAccounts(transactions, accounts, range) {
  const map = aggregateBuckets(transactions, accounts, range);
  return (accounts || []).map((acc) => ({
    acc,
    stats: computeAccountStats(acc, bucketOf(map, acc)),
  }));
}
