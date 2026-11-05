// 数据：期初流水的方向
/**
 * 期初流水不是普通转账：方向由账户性质决定，否则负债的欠款会记成负余额。
 *
 *   借方类型（资产 / 费用 / 成本）：期初余额 → 账户（转入增加余额）
 *   贷方类型（负债 / 权益 / 收入）：账户 → 期初余额（转出增加余额）
 *
 * 例：信用卡欠 19 万，应记「信用卡 → 期初余额 19 万」，
 * 而不是「期初余额 → 信用卡 19 万」—— 后者会被算成一笔转入，余额变负。
 */

import { isDebitType, OPENING_ACCOUNT_ID } from './schema.js';

/** 这笔期初该从哪到哪。空类型按借方（资产壳）处理。 */
export function openingEnds(account) {
  const acc = account || {};
  const type = String(acc.type || '').trim();
  const debit = !type || isDebitType(type);
  return debit
    ? { from_id: OPENING_ACCOUNT_ID, to_id: acc.id }
    : { from_id: acc.id, to_id: OPENING_ACCOUNT_ID };
}

/** 期初流水对应的真实账户 id（另一端是 __OPENING__）。 */
export function openingAccountId(tx) {
  if (!tx) return null;
  if (tx.from_id === OPENING_ACCOUNT_ID) return tx.to_id || null;
  if (tx.to_id === OPENING_ACCOUNT_ID) return tx.from_id || null;
  return null;
}

/** 旧存档修正：把方向录反的期初流水按账户类型摆正，幂等。 */
export function normalizeOpeningDirections(state) {
  const base = state && typeof state === 'object' ? state : {};
  const byId = new Map((base.accounts || []).filter(Boolean).map((a) => [a.id, a]));
  let changed = false;

  const transactions = (base.transactions || []).map((t) => {
    if (!t) return t;
    const accId = openingAccountId(t);
    if (!accId || accId === OPENING_ACCOUNT_ID) return t;
    const acc = byId.get(accId);
    if (!acc) return t;
    const want = openingEnds(acc);
    if (t.from_id === want.from_id && t.to_id === want.to_id) {
      if (t.opening) return t;
      changed = true;
      return { ...t, opening: true };
    }
    changed = true;
    return { ...t, from_id: want.from_id, to_id: want.to_id, opening: true };
  });

  return changed ? { ...base, transactions } : base;
}
