// 界面：校验 tab → 账本校验区
/**
 * 校验区渲染（UI 层）
 *
 * 只把 core 算好的数字摆上去，不做任何计算。
 */

import { balanceOf } from '../core/balance-calculator.js';
import { ACCOUNT_TYPE } from '../core/schema.js';

/**
 * @param {{state:object, index:{duplicateCodes:string[], missingCode:string[]}}} input
 */
export function paintChecks(input) {
  const state = (input && input.state) || { accounts: [], transactions: [] };
  const index = (input && input.index) || { duplicateCodes: [], missingCode: [] };

  // 注意：这里必须用**全部**账户（含隐藏的期初账户），
  // 否则期初那笔的权益来源会被漏掉，恒等式永远差一个期初总额。
  const rows = (state.accounts || [])
    .filter((a) => a)
    .map((acc) => ({ acc, ...balanceOf(acc, state.transactions) }));
  const sum = {};
  for (const r of rows) sum[r.acc.type] = (sum[r.acc.type] || 0) + r.balance;

  const diff = Math.round((
    (sum[ACCOUNT_TYPE.ASSET] || 0) + (sum[ACCOUNT_TYPE.EXPENSE] || 0)
    - (sum[ACCOUNT_TYPE.LIABILITY] || 0) - (sum[ACCOUNT_TYPE.EQUITY] || 0)
    - (sum[ACCOUNT_TYPE.INCOME] || 0)
  ) * 100) / 100;

  const brokenTx = (state.transactions || []).filter((t) => !t.from_id || !t.to_id).length;
  // 简码重复允许（2026-11 用户决定）：只提示，不算「有问题」；
  // 只有缺失仍需要用户补。
  const missing = index.missingCode.length;
  const dups = index.duplicateCodes.length;
  const visibleCount = rows.filter((r) => !r.acc.isHidden).length;

  setText('nt-check-balanced', brokenTx === 0 ? '0 ✓' : `${brokenTx} 笔断链 ✗`);
  setText('nt-check-identity', Math.abs(diff) < 0.005 ? '0 ✓' : `${diff}  ✗`);
  setText('nt-check-detail',
    `${(state.transactions || []).length} 笔 · ${visibleCount} 账户`
    + (missing ? ` · 缺少简码 ${missing}` : '')
    + (dups ? ` · 简码重复 ${dups}（允许）` : ''));
}

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
