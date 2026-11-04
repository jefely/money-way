// 界面：流水与固定收支期次的联动
/**
 * 真实流水和「固定收支期次」的绑定动作：
 *   · 删除自动到账的那一笔 → 这一期记成已作废，下次自动补账不会再补；
 *   · 框选批量删除 → 同样作废，撤销时再把这些作废标记清掉；
 *   · 从某笔流水生成每月固定收支 → 那笔流水已代表当月这一期，标成已处理。
 *
 * 单独一个文件：flow.js 已经接近 300 行有效代码上限，这些不是页面装配。
 */

import { planKey, voidOccurrence } from '../core/plan-occurrence.js';
import { removeTransaction, removeBatch } from '../core/state-store.js';

function keysOf(state, ids) {
  const set = new Set(ids || []);
  return ((state && state.transactions) || [])
    .filter((t) => t && set.has(t.id) && t.planKey)
    .map((t) => t.planKey);
}

/** 删一笔；带 planKey 的同时作废这一期。 */
export function removeFlowTx(state, id) {
  const tx = ((state && state.transactions) || []).find((t) => t && t.id === id);
  let next = removeTransaction(state, id);
  if (tx && tx.planKey) next = voidOccurrence(next, { planKey: tx.planKey });
  return next;
}

/** 批量删；返回 { state, removed, keys }，keys 供撤销时清作废标记。 */
export function removeFlowBatch(state, ids) {
  const keys = keysOf(state, ids);
  const r = removeBatch(state, 'transactions', ids);
  let next = r.state;
  for (const key of keys) next = voidOccurrence(next, { planKey: key });
  return { state: next, removed: r.removed, keys };
}

/** 撤销批量删除：恢复的期次不能再算作废。 */
export function unvoidKeys(state, keys) {
  if (!keys || !keys.length) return state;
  const set = new Set(keys);
  return { ...state, voidedPlans: (state.voidedPlans || []).filter((k) => !set.has(k)) };
}

/** 用某笔流水生成规则时，把这笔流水所在的月份标成已处理，避免自动补账重复。 */
export function markPlanHandled(state, sourceId, txDate) {
  const month = String(txDate || '').slice(0, 7);
  const key = month ? planKey(sourceId, month) : '';
  if (!key || (state.voidedPlans || []).includes(key)) return state;
  return { ...state, voidedPlans: (state.voidedPlans || []).concat(key) };
}
