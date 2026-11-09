// 界面：（无界面）时间分段
/**
 * ☐5 时间状态机
 * 层：第二层 · 时间轴引擎
 *
 * 按 targetDate 把真实流水切成 past / current / future 三段，
 * 并把「未来还没还的分期」推成**虚拟还款事件**。
 *
 * 两条硬规矩：
 *   ① 虚拟事件只出现在返回值里，**绝不写回 state.transactions**；
 *   ② 已还的期数不能再算成未来 —— 这要求把「月份」而不是「日期」
 *      传给 computeInstallment（它只认 YYYY-MM）。
 *
 * 验收：调用前后 transactions 长度不变；虚拟事件数 = 剩余期数之和。
 */

import { computeInstallment, addMonths, dayInMonth } from '../core/installment-engine.js';
import { pickSavingsAccount, planKey } from '../core/plan-occurrence.js';

export const SEGMENT = { PAST: 'past', CURRENT: 'current', FUTURE: 'future' };

/**
 * @param {Array} transactions 真实流水
 * @param {Array} accounts
 * @param {Array} installments 分期规则（可为空）
 * @param {{targetDate:string, monthStart?:string, monthEnd?:string}} opts
 * @returns {{past:Array, current:Array, future:Array, virtual:Array,
 *            targetDate:string, targetMonth:string, counts:object}}
 */
export function splitByTime(transactions, accounts, installments, opts) {
  const target = String((opts && opts.targetDate) || '');
  const targetMonth = target ? target.slice(0, 7) : '';
  const monthStart = String((opts && opts.monthStart) || (targetMonth ? targetMonth + '-01' : ''));
  const monthEnd = String((opts && opts.monthEnd) || monthStartEnd(monthStart));

  const past = [];
  const current = [];
  const future = [];

  for (const t of transactions || []) {
    const d = String((t && t.date) || '');
    if (!d) { current.push(t); continue; }        // 没日期的当「现在」，不丢
    if (monthStart && d < monthStart) past.push(t);
    else if (monthEnd && d > monthEnd) future.push(t);
    else current.push(t);
  }

  const virtual = buildVirtualRepayments(installments, targetMonth, accounts)
    .concat(buildVirtualFixed(installments, target, accounts));
  virtual.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    past,
    current,
    future,
    virtual,
    targetDate: target,
    targetMonth,
    counts: {
      past: past.length,
      current: current.length,
      future: future.length,
      virtual: virtual.length,
    },
  };
}

/**
 * 未来尚未到期的分期还款 → 虚拟事件。
 *
 * 期数从 firstMonth 起算，第 k 期（1 基）落在 addMonths(firstMonth, k-1)，
 * 日期取该月的还款日，遇到 2 月自动钳到月内最后一天。
 *
 * @param {Array} installments
 * @param {string} targetMonth 'YYYY-MM'
 * @returns {Array}
 */
export function buildVirtualRepayments(installments, targetMonth, accounts) {
  const out = [];

  // 账户表只用来把 id 翻成人名；账本记录里根本没有 name 字段
  const accById = new Map();
  for (const a of accounts || []) if (a && a.id) accById.set(a.id, a);
  const nameOf = (id) => {
    const a = accById.get(id);
    return a ? String(a.name || '') : '';
  };

  for (const inst of installments || []) {
    // 判据是「有没有 inst 规则」，不是有没有 name
    if (!inst || !inst.inst) continue;

    // computeInstallment 只认 'YYYY-MM'，传日期会得到 NaN → 已还期数算成 0
    const st = computeInstallment(inst, targetMonth);
    if (!st.firstMonth || st.periods <= 0) continue;

    const payDay = Number(inst.day) || Number((inst.inst || {}).day) || 1;
    const toName = nameOf(inst.to_id) || inst.note || inst.name || '分期';
    const savedFrom = nameOf(inst.from_id);
    const picked = savedFrom ? null : pickSavingsAccount(accounts);
    const fromName = savedFrom || (picked ? picked.name : '');
    const fromId = (savedFrom && inst.from_id) || (picked && picked.id) || null;
    const sourceId = inst.id || inst.name || toName;

    for (let k = st.paidPeriods; k < st.periods; k++) {
      const month = addMonths(st.firstMonth, k);
      if (!month) continue;
      const day = dayInMonth(month, payDay);
      const n = k + 1;
      out.push({
        isVirtual: true,
        kind: 'installment',
        source: sourceId,
        sourceId,
        periodIndex: n,
        periods: st.periods,
        month,
        planKey: planKey(sourceId, month),
        date: `${month}-${String(day).padStart(2, '0')}`,
        amount: st.perPeriod,
        principal: st.principalPer,
        interest: st.interestPer,
        fromName,
        fromId,
        toName,
        toId: inst.to_id || null,
        note: `分期还款 第 ${n}/${st.periods} 期`,
      });
    }
  }

  out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
}

/**
 * 固定收支的未来发生（不含分期）。每月最多望 6 个月，每天只望 14 天。
 * 没有 isScheduled 且没有账户的裸对象不当成规则，避免把测试夹具拆成一堆虚拟行。
 */
export function buildVirtualFixed(list, targetDate, accounts) {
  const out = [];
  const start = String(targetDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return out;
  const fromMonth = start.slice(0, 7);
  const accById = new Map();
  for (const a of accounts || []) if (a && a.id) accById.set(a.id, a);
  const nameOf = (id) => {
    const a = accById.get(id);
    return a ? String(a.name || '') : '';
  };

  for (const s of list || []) {
    if (!s || s.inst || s.isScheduled !== true) continue;
    const sourceId = s.id || s.note || 'fixed';
    if (s.freq === 'daily') {
      for (let i = 0; i < 14; i += 1) {
        const date = shiftIso(start, i);
        out.push(fixedRow(s, date, date, sourceId, nameOf));
      }
      continue;
    }
    for (let i = 0; i < 6; i += 1) {
      const month = addMonths(fromMonth, i);
      if (!month) continue;
      const day = dayInMonth(month, Number(s.day) || 1);
      const date = `${month}-${String(day).padStart(2, '0')}`;
      if (date < start) continue;
      out.push(fixedRow(s, date, month, sourceId, nameOf));
    }
  }
  return out;
}

function fixedRow(s, date, key, sourceId, nameOf) {
  return {
    isVirtual: true,
    kind: 'fixed',
    source: sourceId,
    sourceId,
    month: key,
    planKey: planKey(sourceId, key),
    date,
    amount: Number(s.amount) || 0,
    fromName: nameOf(s.from_id),
    fromId: s.from_id || null,
    toName: nameOf(s.to_id),
    toId: s.to_id || null,
    note: s.note || '',
    periodIndex: key,
    periods: '',
  };
}

function shiftIso(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 只求和，用于页面上的「未来 N 笔 / 合计 ¥X」。
 * @param {Array} virtual
 */
export function summarizeVirtual(virtual) {
  let total = 0;
  for (const v of virtual || []) total += Number(v.amount) || 0;
  return { count: (virtual || []).length, total: Math.round(total * 100) / 100 };
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
