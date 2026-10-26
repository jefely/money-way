/**
 * 校验区渲染（UI 层）
 *
 * 只把 core 算好的数字摆上去，不做任何计算。
 */

import { balancesOf } from '../core/balance-calculator.js';
import { ACCOUNT_TYPE } from '../core/schema.js';

/**
 * @param {{state:object, index:{duplicateCodes:string[], missingCode:string[]}}} input
 */
export function paintChecks(input) {
  const state = (input && input.state) || { accounts: [], transactions: [] };
  const index = (input && input.index) || { duplicateCodes: [], missingCode: [] };

  const rows = balancesOf(state.accounts, state.transactions);
  const sum = {};
  for (const r of rows) sum[r.acc.type] = (sum[r.acc.type] || 0) + r.balance;

  const diff = Math.round((
    (sum[ACCOUNT_TYPE.ASSET] || 0) + (sum[ACCOUNT_TYPE.EXPENSE] || 0)
    - (sum[ACCOUNT_TYPE.LIABILITY] || 0) - (sum[ACCOUNT_TYPE.EQUITY] || 0)
    - (sum[ACCOUNT_TYPE.INCOME] || 0)
  ) * 100) / 100;

  const brokenTx = (state.transactions || []).filter((t) => !t.from_id || !t.to_id).length;
  const codesOk = index.duplicateCodes.length === 0 && index.missingCode.length === 0;

  setText('nt-check-balanced', brokenTx === 0 ? '0 ✓' : `${brokenTx} 笔断链 ✗`);
  setText('nt-check-identity', Math.abs(diff) < 0.005 ? '0 ✓' : `${diff}  ✗`);
  setText('nt-check-detail',
    `${(state.transactions || []).length} 笔 · ${rows.length} 账户`
    + (codesOk ? '' : ` · 简码有问题：重复 ${index.duplicateCodes.length} / 缺失 ${index.missingCode.length}`));
}

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
