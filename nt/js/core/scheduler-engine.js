// 界面：（无界面）排程引擎
/**
 * 计划引擎（Plan Scheduler）
 * 层：第一层 · 数据基座
 *
 * **整合的核心**：固定收支与分期在这里被统一成「计划流水」，
 * 对外只暴露两件事：
 *   generateFutureFlows(list, month)  某个月的虚拟流水
 *   getSchedulerSummary(list, accounts) 顶部那四个汇总数字
 *
 * 纯函数：不碰 DOM、不改入参、不写盘。
 * 虚拟流水带 isVirtual 标记，永远不会混进 state.transactions。
 */

import { createScheduled, FREQ } from './schema.js';
import { computeInstallment, isDueInMonth, dayInMonth, addMonths, monthsBetween } from './installment-engine.js';

/**
 * 某个月该发生的虚拟流水。
 * @param {Array} scheduledList 计划流水（固定 + 分期混在一起）
 * @param {string} month 'YYYY-MM'
 * @returns {Array<{isVirtual:true, date:string, from_id, to_id, amount, note, sourceId, kind}>}
 */
export function generateFutureFlows(scheduledList, month) {
  const out = [];
  const m = String(month || '');
  if (!/^\d{4}-\d{2}$/.test(m)) return out;

  for (const s of scheduledList || []) {
    if (!s || !s.isScheduled) continue;

    // ① 分期：只在该期内的月份发生
    if (s.inst) {
      if (!isDueInMonth(s, m)) continue;
      const st = computeInstallment(s, m);
      const day = dayInMonth(m, s.day);
      out.push(makeVirtual(s, `${m}-${pad(day)}`, st.perPeriod, 'installment'));
      continue;
    }

    // ② 普通固定收支
    if (s.freq === FREQ.DAILY) {
      // 每天一条
      const maxDay = dayInMonth(m, 31);
      for (let d = 1; d <= maxDay; d++) {
        out.push(makeVirtual(s, `${m}-${pad(d)}`, s.amount, 'fixed'));
      }
    } else {
      // 每月一条（31 号在 2 月自动钳到月末）
      const day = dayInMonth(m, s.day);
      out.push(makeVirtual(s, `${m}-${pad(day)}`, s.amount, 'fixed'));
    }
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** 一段区间内的全部虚拟流水（给时间轴用） */
export function generateFutureFlowsRange(scheduledList, fromMonth, toMonth) {
  const span = monthsBetween(fromMonth, toMonth);
  if (!Number.isFinite(span) || span < 0) return [];
  const out = [];
  for (let i = 0; i <= span; i++) {
    out.push(...generateFutureFlows(scheduledList, addMonths(fromMonth, i)));
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * 顶部汇总（子视图 A 的左上角 + 子视图 B 的左上角）。
 *
 * @param {Array} scheduledList
 * @param {Array<{id:string,type:string,isHidden:boolean}>} accounts
 * @param {string} month 参考月份（算剩余本金用）
 */
export function getSchedulerSummary(scheduledList, accounts, month) {
  const typeOf = new Map();
  for (const a of accounts || []) typeOf.set(a.id, a.type);

  const fixedList = (scheduledList || []).filter((s) => s && s.isScheduled && !s.inst);
  const instList = (scheduledList || []).filter((s) => s && s.isScheduled && s.inst);

  let fixedIncome = 0;
  let fixedExpense = 0;
  for (const f of fixedList) {
    const toType = typeOf.get(f.to_id) || '';
    if (toType === '收入类') fixedIncome += f.amount;
    else fixedExpense += f.amount;
  }

  let instPrincipal = 0;
  let instInterest = 0;
  for (const s of instList) {
    const st = computeInstallment(s, month || s.inst.firstMonth);
    instPrincipal += st.remainingPrincipal;
    instInterest += st.remainingInterest;
  }

  return {
    fixedCount: fixedList.length,
    instCount: instList.length,
    fixedIncome: round2(fixedIncome),
    fixedExpense: round2(fixedExpense),
    instRemainingPrincipal: round2(instPrincipal),
    instRemainingInterest: round2(instInterest),
  };
}

/**
 * 按「计划流水」推导一年的月度现金流（未来预测）。
 * @returns {Array<{month:string, income:number, expense:number, net:number}>}
 */
export function projectMonthlyCashflow(scheduledList, accounts, fromMonth, months) {
  const typeOf = new Map();
  for (const a of accounts || []) typeOf.set(a.id, a.type);

  const out = [];
  const n = Math.max(0, Math.floor(Number(months) || 0));
  for (let i = 0; i < n; i++) {
    const m = addMonths(fromMonth, i);
    const flows = generateFutureFlows(scheduledList, m);
    let income = 0;
    let expense = 0;
    for (const f of flows) {
      const t = typeOf.get(f.to_id) || '';
      if (t === '收入类') income += f.amount;
      else expense += f.amount;
    }
    out.push({ month: m, income: round2(income), expense: round2(expense), net: round2(income - expense) });
  }
  return out;
}

/* ---------- 内部 ---------- */

function makeVirtual(s, date, amount, kind) {
  return {
    isVirtual: true,
    kind,
    sourceId: s.id,
    date,
    from_id: s.from_id,
    to_id: s.to_id,
    amount: round2(amount),
    note: s.note || '',
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** 便于测试/迁移：把一批裸对象转成计划流水 */
export function normalizeScheduledList(list) {
  return (list || []).filter(Boolean).map((s) => createScheduled(s));
}
