/**
 * ☐3 分期推算器
 * 层：第一层 · 数据基座
 *
 * 按日期推算「已还几期」，**不存盘**。
 * 存盘的是规则（首期、期数、每期金额），已还期数永远是算出来的 ——
 * 所以改日期、改期数都不会污染历史数据。
 *
 * 验收：输入日期，返回当前已还期数、剩余期数，不受 UI 干扰；同一输入两次结果一致。
 */

import { toAmount } from './stats.js';

/**
 * @param {{firstMonth?:string, periods?:number, perPeriod?:number|string,
 *          startDate?:string, paidOverrides?:number}} installment
 * @param {string} targetDate ISO 日期（YYYY-MM-DD）
 * @returns {{paidPeriods:number, remainingPeriods:number, totalPeriods:number,
 *            perPeriod:number, paidAmount:number, remainingAmount:number,
 *            nextDueDate:string|null, finished:boolean}}
 */
export function computeInstallment(installment, targetDate) {
  const inst = installment || {};
  const total = Math.max(0, Math.floor(Number(inst.periods) || 0));
  const per = toAmount(inst.perPeriod);
  const target = String(targetDate || '');

  // TODO(☐3): 从 firstMonth（或 startDate）逐月推进到 targetDate，
  // 数出已经过去的月份数 = paidPeriods；期数上限是 total。
  // 手工覆盖（paidOverrides）优先于推算 —— 但也只是"覆盖已还数"，不写入流水。
  const paid = Math.min(total, Math.max(0, Math.floor(Number(inst.paidOverrides) || 0)));

  return {
    paidPeriods: paid,
    remainingPeriods: Math.max(0, total - paid),
    totalPeriods: total,
    perPeriod: per,
    paidAmount: Math.round(paid * per * 100) / 100,
    remainingAmount: Math.round(Math.max(0, total - paid) * per * 100) / 100,
    nextDueDate: null,   // TODO(☐3): 下一个还款月的日期
    finished: total > 0 && paid >= total,
    targetDate: target,
  };
}
