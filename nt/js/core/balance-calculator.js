/**
 * 余额计算（纯 Σ流水，ID 版）
 * 层：第一层 · 数据基座
 *
 * **唯一的余额算法。** 账户上没有 opening 字段参与 ——
 * 期初已经由 core/state-store.js 的 migrateOpeningToTransactions 变成流水了。
 *
 * 三个原则的落地：
 *   存 ID   → 只认 from_id / to_id，改名不断链
 *   看名字  → 本文件不产生任何名字，只返回数字
 *   靠类型  → 加减只由 account.type 决定，金额永远是正数
 */

import { isDebitType } from './schema.js';

/**
 * 单账户余额。
 * @param {{id:string,type:string}} account
 * @param {Array<{from_id:string,to_id:string,amount:number}>} transactions
 * @returns {{balance:number, inflow:number, outflow:number}}
 */
export function balanceOf(account, transactions) {
  const id = account && account.id;
  let inflow = 0;
  let outflow = 0;

  if (!id) return { balance: 0, inflow: 0, outflow: 0 };

  for (const t of transactions || []) {
    const amt = Number(t && t.amount) || 0;
    if (!amt) continue;
    if (t.from_id === id) outflow += amt;
    if (t.to_id === id) inflow += amt;
  }

  // 借增贷减：资产/费用 = 转入 − 转出；其余相反
  const balance = isDebitType(account.type) ? inflow - outflow : outflow - inflow;
  return { balance, inflow, outflow };
}

/** 全部账户的余额表（只算可见账户，期初虚拟账户不出现） */
export function balancesOf(accounts, transactions) {
  return (accounts || [])
    .filter((a) => a && !a.isHidden)
    .map((acc) => ({ acc, ...balanceOf(acc, transactions) }));
}

/** 某个时间点之前的余额（用于「过去/现在」切分） */
export function balanceAsOf(account, transactions, isoDate) {
  const upto = (transactions || []).filter((t) => String(t.date || '') <= String(isoDate || '9999-12-31'));
  return balanceOf(account, upto);
}
