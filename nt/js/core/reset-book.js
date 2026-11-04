// 界面：（无界面）重置账户但保留流水
/**
 * 重置账户（保留流水 / 计划）
 * 层：第一层 · 数据基座
 *
 * 账户表换回内置的三户。同名账户的流水 id 会改挂到新 id 上，
 * 对不上名字的仍留在流水里，校验页会报断链。
 */

import { createAccount, OPENING_ACCOUNT } from './schema.js';

export const SEED_ACCOUNTS = [
  { id: 'acc_cash', code: 'XJ', name: '现金', type: '资产类', category: '现金' },
  { id: 'acc_bank', code: 'ZHC', name: '招行储', type: '资产类', category: '储蓄' },
  { id: 'acc_food', code: 'CY', name: '餐饮', type: '费用类', category: '日常' },
];

export function resetAccountsKeepData(state) {
  const src = state || {};
  const seeds = SEED_ACCOUNTS.map((s) => createAccount(s));
  const byName = new Map(seeds.map((a) => [a.name, a.id]));
  const idMap = new Map();
  for (const a of src.accounts || []) {
    if (a && a.name && byName.has(a.name)) idMap.set(a.id, byName.get(a.name));
  }
  const mapId = (id) => (id && idMap.has(id) ? idMap.get(id) : id);
  const remap = (row) => {
    if (!row) return row;
    return { ...row, from_id: mapId(row.from_id), to_id: mapId(row.to_id) };
  };
  return {
    ...src,
    accounts: [{ ...OPENING_ACCOUNT }, ...seeds],
    transactions: (src.transactions || []).map(remap),
    scheduled: (src.scheduled || []).map(remap),
  };
}
