/**
 * 计划模块测试：固定收支 / 分期 / 汇总 / 虚拟流水不污染真实数据。
 *
 * 这是「固定 + 分期」整合的验收：
 *   · 固定收支按频率在正确的月份/日期出现
 *   · 分期只在自己期数内出现，且本金/利息拆得开
 *   · 两者都能被同一个 generateFutureFlows() 产出
 *   · 汇总数字对得上
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createScheduled, FREQ, ACCOUNT_TYPE, clampDay, normalizeMonth,
  OPENING_ACCOUNT_ID,
} from '../js/core/schema.js';
import {
  addMonths, monthsBetween, daysInMonth, dayInMonth,
  computeInstallment, isDueInMonth, calcInstallmentMatrix,
} from '../js/core/installment-engine.js';
import {
  generateFutureFlows, generateFutureFlowsRange,
  getSchedulerSummary, projectMonthlyCashflow, normalizeScheduledList,
} from '../js/core/scheduler-engine.js';

/* ---------- 造数据 ---------- */

const ACCOUNTS = [
  { id: 'acc_bank', code: 'ZHC', name: '招行储', type: ACCOUNT_TYPE.ASSET },
  { id: 'acc_rent', code: 'FZ', name: '房租', type: ACCOUNT_TYPE.EXPENSE },
  { id: 'acc_salary', code: 'GZ', name: '工资', type: ACCOUNT_TYPE.INCOME },
  { id: 'acc_card', code: 'ZHC2', name: '招行信', type: ACCOUNT_TYPE.LIABILITY },
];

/** 固定房租：每月 25 号 900 */
const RENT = createScheduled({
  id: 'sched_rent', freq: FREQ.MONTHLY, day: 25,
  from_id: 'acc_bank', to_id: 'acc_rent', amount: 900, note: '房租',
});

/** 固定工资：每月 10 号 12000（转入收入类） */
const SALARY = createScheduled({
  id: 'sched_salary', freq: FREQ.MONTHLY, day: 10,
  from_id: 'acc_bank', to_id: 'acc_salary', amount: 12000, note: '工资',
});

/** 分期：12 期，首月 2026-08，本金 12000，利息 720 → 每期 1060 */
const INST = createScheduled({
  id: 'sched_inst', freq: FREQ.MONTHLY, day: 5,
  from_id: 'acc_bank', to_id: 'acc_card', amount: 1060, note: '买手机',
  inst: { periods: 12, firstMonth: '2026-08', principal: 12000, interest: 720 },
});

/* ---------- 基础工具 ---------- */

test('月份工具：加减 / 差值 / 天数', () => {
  assert.equal(addMonths('2026-08', 3), '2026-11');
  assert.equal(addMonths('2026-11', 3), '2027-02', '跨年');
  assert.equal(monthsBetween('2026-08', '2027-02'), 6);
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29, '闰年');
  assert.equal(daysInMonth('2026-08'), 31);
});

test('日期钳制：31 号在 2 月落到月末', () => {
  assert.equal(dayInMonth('2026-02', 31), 28);
  assert.equal(dayInMonth('2028-02', 31), 29);
  assert.equal(dayInMonth('2026-08', 31), 31);
  assert.equal(clampDay(0), 1);
  assert.equal(clampDay(99), 31);
});

test('月份归一化：支持 2026-08 / 202608 / 2608', () => {
  assert.equal(normalizeMonth('2026-08'), '2026-08');
  assert.equal(normalizeMonth('2026-8'), '2026-08');
  assert.equal(normalizeMonth('202608'), '2026-08');
  assert.equal(normalizeMonth('2608'), '2026-08');
  assert.equal(normalizeMonth('乱写'), '');
});

/* ---------- 分期引擎 ---------- */

test('分期：等额摊还，本金与利息都能拆开', () => {
  const st = computeInstallment(INST, '2026-08');
  assert.equal(st.periods, 12);
  assert.equal(st.total, 12720);
  assert.equal(st.perPeriod, 1060);
  assert.equal(st.principalPer, 1000);
  assert.equal(st.interestPer, 60);
  assert.equal(st.lastMonth, '2027-07');
});

test('分期：已还期数随月份推进，期末归零', () => {
  assert.equal(computeInstallment(INST, '2026-07').paidPeriods, 0, '首月之前还没还');
  assert.equal(computeInstallment(INST, '2026-08').paidPeriods, 0, '当月算"这一期还没还完"');
  assert.equal(computeInstallment(INST, '2026-09').paidPeriods, 1);
  assert.equal(computeInstallment(INST, '2027-07').paidPeriods, 11);
  assert.equal(computeInstallment(INST, '2027-08').paidPeriods, 12);
  assert.equal(computeInstallment(INST, '2027-08').finished, true);
  assert.equal(computeInstallment(INST, '2028-01').remainingPeriods, 0, '期后不会变负');
});

test('分期：只在期数内命中', () => {
  assert.equal(isDueInMonth(INST, '2026-07'), false, '首月之前不还');
  assert.equal(isDueInMonth(INST, '2026-08'), true);
  assert.equal(isDueInMonth(INST, '2027-07'), true, '最后一期');
  assert.equal(isDueInMonth(INST, '2027-08'), false, '期后不还');
});

test('分期矩阵：月份列 + 每行 cells', () => {
  const m = calcInstallmentMatrix([RENT, SALARY, INST], '2026-08', '2026-10');
  assert.deepEqual(m.months, ['2026-08', '2026-09', '2026-10']);
  assert.equal(m.rows.length, 1, '只有带 inst 的才进矩阵');
  const row = m.rows[0];
  assert.equal(row.cells.length, 3);
  assert.equal(row.cells[0].amount, 1060);
  assert.equal(row.cells[0].principal, 1000);
  assert.equal(row.cells[0].interest, 60);
  // 到 2026-10 已过 2 期，剩 10 期 → 剩余本金 1000 × 10
  assert.equal(m.totalPrincipal, 10000, '剩余本金按「到 toMonth 时还剩几期」算');
});

/* ---------- 固定收支 → 虚拟流水 ---------- */

test('固定收支：每月一条，日期 = 设定日', () => {
  const flows = generateFutureFlows([RENT], '2026-08');
  assert.equal(flows.length, 1);
  assert.equal(flows[0].date, '2026-08-25');
  assert.equal(flows[0].amount, 900);
  assert.equal(flows[0].isVirtual, true);
  assert.equal(flows[0].kind, 'fixed');
});

test('固定收支：31 号的规则在 2 月自动落到月末', () => {
  const s = createScheduled({ id: 's31', freq: FREQ.MONTHLY, day: 31, from_id: 'a', to_id: 'b', amount: 100 });
  const flows = generateFutureFlows([s], '2026-02');
  assert.equal(flows.length, 1);
  assert.equal(flows[0].date, '2026-02-28');
});

test('固定收支：日频是一天一条', () => {
  const daily = createScheduled({ id: 'sd', freq: FREQ.DAILY, from_id: 'acc_bank', to_id: 'acc_rent', amount: 10 });
  const flows = generateFutureFlows([daily], '2026-08');
  assert.equal(flows.length, 31, '8 月 31 天');
  assert.equal(flows[0].date, '2026-08-01');
  assert.equal(flows[30].date, '2026-08-31');
});

/* ---------- 整合：两种计划用同一个出口 ---------- */

test('★ 整合：固定 + 分期都由 generateFutureFlows 产出，按日期排序', () => {
  const flows = generateFutureFlows([RENT, SALARY, INST], '2026-08');
  assert.equal(flows.length, 3, '房租 + 工资 + 分期');

  const dates = flows.map((f) => f.date);
  assert.deepEqual(dates, ['2026-08-05', '2026-08-10', '2026-08-25'], '必须按日期升序');

  assert.equal(flows.find((f) => f.kind === 'installment').amount, 1060);
  assert.equal(flows.filter((f) => f.kind === 'fixed').length, 2);
});

test('★ 整合：分期在期后不再产出，固定照旧', () => {
  const after = generateFutureFlows([RENT, INST], '2027-09');
  assert.equal(after.length, 1, '只剩房租');
  assert.equal(after[0].kind, 'fixed');
});

test('区间生成：跨月连续且有序', () => {
  const flows = generateFutureFlowsRange([RENT], '2026-08', '2026-10');
  assert.deepEqual(flows.map((f) => f.date), ['2026-08-25', '2026-09-25', '2026-10-25']);
});

/* ---------- 汇总 ---------- */

test('汇总：固定收入/支出 + 分期剩余本金/利息', () => {
  const s = getSchedulerSummary([RENT, SALARY, INST], ACCOUNTS, '2026-09');
  assert.equal(s.fixedCount, 2);
  assert.equal(s.instCount, 1);
  assert.equal(s.fixedIncome, 12000, '工资的转入账户是收入类');
  assert.equal(s.fixedExpense, 900, '房租的转入账户是费用类');
  // 2026-09 已还 1 期，剩 11 期 → 本金 11000 / 利息 660
  assert.equal(s.instRemainingPrincipal, 11000);
  assert.equal(s.instRemainingInterest, 660);
});

test('未来现金流预测：按月聚合收支', () => {
  const rows = projectMonthlyCashflow([RENT, SALARY], ACCOUNTS, '2026-08', 3);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { month: '2026-08', income: 12000, expense: 900, net: 11100 });
  assert.equal(rows[2].month, '2026-10');
});

/* ---------- 纯函数保证 ---------- */

test('虚拟流水带 isVirtual，且原计划数据不被修改', () => {
  const list = [RENT, SALARY, INST];
  const snapshot = JSON.stringify(list);
  const flows = generateFutureFlows(list, '2026-08');

  assert.equal(flows.every((f) => f.isVirtual === true), true);
  assert.equal(JSON.stringify(list), snapshot, '计划列表不许被改动');
});

test('normalizeScheduledList：裸对象也能转成规范结构', () => {
  const [s] = normalizeScheduledList([{ code: 'x', freq: 'monthly', day: 5, from_id: 'a', to_id: 'b', amount: '300' }]);
  assert.equal(s.isScheduled, true);
  assert.equal(s.day, 5);
  assert.equal(s.amount, 300);
  assert.equal(s.freq, FREQ.MONTHLY);
});

test('分期金额 = 本金 + 利息（别把利息算丢）', () => {
  const st = computeInstallment(INST, '2027-08');
  assert.equal(st.total, st.principal + st.interest);
  assert.equal(st.perPeriod * st.periods, 12720);
});
