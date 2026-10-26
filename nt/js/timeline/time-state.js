// 界面：（无界面）时间分段
/**
 * ☐5 时间状态机
 * 层：第二层 · 时间轴引擎
 *
 * 按 targetDate 把流水切成 past / current / future 三段，
 * 并把「未来分期的虚拟还款事件」**在这里推算生成**——
 * 关键：虚拟事件只出现在返回值里，**绝不写回 state.transactions**。
 *
 * 验收：调用前后 state.transactions 长度不变（纯函数）。
 */

import { computeInstallment } from '../core/installment-engine.js';

export const SEGMENT = { PAST: 'past', CURRENT: 'current', FUTURE: 'future' };

/**
 * @param {Array} transactions 真实流水
 * @param {Array} accounts
 * @param {Array} installments 分期规则（可为空）
 * @param {{targetDate:string, monthStart?:string, monthEnd?:string}} opts
 * @returns {{past:Array, current:Array, future:Array, virtual:Array, targetDate:string}}
 */
export function splitByTime(transactions, accounts, installments, opts) {
  const target = String((opts && opts.targetDate) || '');
  const monthStart = String((opts && opts.monthStart) || (target ? target.slice(0, 7) + '-01' : ''));
  const monthEnd = String((opts && opts.monthEnd) || monthStartEnd(monthStart));

  const past = [];
  const current = [];
  const future = [];

  for (const t of transactions || []) {
    const d = String((t && t.date) || '');
    if (!d) { current.push(t); continue; }
    if (d < monthStart) past.push(t);
    else if (d > monthEnd) future.push(t);
    else current.push(t);
  }

  // 虚拟还款：只为「未来尚未到期」的期数生成，不写回真实数据
  const virtual = [];
  for (const inst of installments || []) {
    if (!inst || !inst.name) continue;
    const st = computeInstallment(inst, target);
    for (let k = st.paidPeriods; k < st.totalPeriods; k++) {
      virtual.push({
        isVirtual: true,
        kind: 'installment',
        source: inst.name,
        periodIndex: k + 1,
        amount: st.perPeriod,
        // TODO(☐5): 按 firstMonth 推进到第 k 期的真实日期
        date: '',
      });
    }
  }

  return { past, current, future, virtual, targetDate: target };
}

/** 给定月份起点，算出该月最后一天。 */
function monthStartEnd(monthStart) {
  const s = String(monthStart || '');
  if (!/^\d{4}-\d{2}-01$/.test(s)) return '';
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const last = new Date(y, m, 0).getDate();
  return `${s.slice(0, 8)}${String(last).padStart(2, '0')}`;
}
