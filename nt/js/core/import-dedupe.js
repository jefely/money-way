// 界面：（无界面）账单导入判重
/**
 * 导入判重（多重集）
 * 层：第一层 · 数据基座
 *
 * 同一天、同一商户、同一金额可以有两笔真账（有的账单没有单号）。
 * 所以不是「见过就丢」，而是按指纹计数抵消：
 * 库里已经有 N 笔同样的，这一批的前 N 笔算重复，多出来的仍导入。
 * 有交易单号时再加一把「单号」钥匙，避免只靠金额把两笔真账并成一笔。
 */

/** 一笔流水或即将写入的行 → 指纹 */
export function importFingerprint(tx) {
  const row = tx || {};
  if (row.billId) return 'no:' + String(row.billId);
  const amt = Math.round((Number(row.amount) || 0) * 100);
  return ['fp', row.date || '', row.from_id || '', row.to_id || '', amt, row.note || ''].join('|');
}

/** 已有流水 → 指纹计数 */
export function fingerprintBag(transactions) {
  const bag = new Map();
  for (const t of transactions || []) {
    const key = importFingerprint(t);
    bag.set(key, (bag.get(key) || 0) + 1);
  }
  return bag;
}

/**
 * 这一笔是否还该导入。
 * keys 里任一把在计数里还有余量，就抵消一次并视为重复。
 * @returns {boolean} true = 新的，要写入
 */
export function takeIfNew(bag, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const n = bag.get(key) || 0;
    if (n > 0) {
      bag.set(key, n - 1);
      return false;
    }
  }
  return true;
}

/** 即将写入的行用哪些钥匙去对库 */
export function keysForIncoming(row) {
  const plain = importFingerprint({ ...row, billId: '' });
  if (row && row.billId) return ['no:' + String(row.billId), plain];
  return [plain];
}
