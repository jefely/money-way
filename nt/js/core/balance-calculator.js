/**
 * ☐2 余额计算器
 * 层：第一层 · 数据基座
 *
 * **唯一的 Σ流水 算法。**
 * 一旦期初迁移（☐1）完成，账户就只剩流水，不再有 `+ opening` 这条旁路。
 *
 * 验收：
 *   · 传入账户和全量流水，输出精确余额
 *   · 本文件里不许再出现 `acc.opening`
 */

import { toAmount } from './stats.js';

export const DEBIT_CATS = ['资产类', '费用类'];

/** 资产/费用类 = 借增贷减；其余相反。 */
export function isDebitAccount(acc) {
  return DEBIT_CATS.includes(acc && acc.cat);
}

/**
 * 单账户余额（纯 Σ流水）。
 * @param {{id:string,name:string,cat:string}} acc
 * @param {Array} transactions
 * @returns {{balance:number, inflow:number, outflow:number}}
 */
export function balanceOf(acc, transactions) {
  // TODO(☐2): 遍历 transactions，累计该账户的 inflow / outflow，
  // 再按 isDebitAccount 决定 `balance = inflow - outflow` 还是反过来。
  // 匹配规则：先认 fromId/toId，再退回按名字匹配（兼容老数据）。
  let inflow = 0;
  let outflow = 0;
  const name = String((acc && acc.name) || '');
  const id = (acc && acc.id) || '';

  for (const t of transactions || []) {
    const amt = toAmount(t && t.amount);
    if (!amt) continue;
    const hitFrom = (t.fromId && t.fromId === id) || (!t.fromId && t.from === name);
    const hitTo = (t.toId && t.toId === id) || (!t.toId && t.to === name);
    if (hitFrom) outflow += amt;
    if (hitTo) inflow += amt;
  }

  const balance = isDebitAccount(acc) ? inflow - outflow : outflow - inflow;
  return { balance, inflow, outflow };
}

/** 全部账户的余额表。 */
export function balancesOf(accounts, transactions) {
  return (accounts || []).map((acc) => ({ acc, ...balanceOf(acc, transactions) }));
}
