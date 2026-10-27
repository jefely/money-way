/**
 * 时间状态机测试。
 *
 * 两条不能破的规矩：
 *   ① 纯函数：调用前后 transactions 长度不变
 *   ② 已还的期数不能再算成未来
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  splitByTime, buildVirtualRepayments, summarizeVirtual, SEGMENT,
} from '../js/timeline/time-state.js';
import { createState, addAccount, addTransaction } from '../js/core/state-store.js';
import { ACCOUNT_TYPE } from '../js/core/schema.js';

function seed() {
  let s = createState();
  s = addAccount(s, { id: 'a1', code: 'ZHC', name: '招行储', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'a2', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '日常' });
  s = addTransaction(s, { date: '2026-07-15', from_id: 'a1', to_id: 'a2', amount: 10, note: '过去', seq: 1 });
  s = addTransaction(s, { date: '2026-08-10', from_id: 'a1', to_id: 'a2', amount: 20, note: '现在', seq: 2 });
  s = addTransaction(s, { date: '2026-09-05', from_id: 'a1', to_id: 'a2', amount: 30, note: '未来', seq: 3 });
  return s;
}

const AUG = { targetDate: '2026-08-20' };

test('★ 三段切分：过去 / 现在 / 未来', () => {
  const st = seed();
  const r = splitByTime(st.transactions, st.accounts, [], AUG);
  assert.equal(r.past.length, 1);
  assert.equal(r.current.length, 1);
  assert.equal(r.future.length, 1);
  assert.equal(r.past[0].note, '过去');
  assert.equal(r.current[0].note, '现在');
  assert.equal(r.future[0].note, '未来');
});

test('★ 纯函数：调用前后 transactions 长度与内容都不变', () => {
  const st = seed();
  const before = JSON.stringify(st.transactions);
  splitByTime(st.transactions, st.accounts,
    [{ name: '手机', day: 5, amount: 300, inst: { periods: 6, firstMonth: '2026-06', principal: 1800, interest: 0 } }],
    AUG);
  assert.equal(JSON.stringify(st.transactions), before, '不许写回真实数据');
  assert.equal(st.transactions.length, 3);
});

test('三段加起来等于全部流水（不丢不重）', () => {
  const st = seed();
  const r = splitByTime(st.transactions, st.accounts, [], AUG);
  assert.equal(r.past.length + r.current.length + r.future.length, st.transactions.length);
});

test('没日期的流水归到「现在」，不会消失', () => {
  let s = createState();
  s = addAccount(s, { id: 'x', code: 'AA', name: 'A', type: ACCOUNT_TYPE.ASSET, category: '' });
  s = addAccount(s, { id: 'y', code: 'BB', name: 'B', type: ACCOUNT_TYPE.EXPENSE, category: '' });
  s = addTransaction(s, { date: '', from_id: 'x', to_id: 'y', amount: 5, note: '无日期', seq: 1 });
  const r = splitByTime(s.transactions, s.accounts, [], AUG);
  assert.equal(r.current.length, 1);
});

test('★ 虚拟还款：已还的期数**不能**再算成未来', () => {
  // 6 期，2026-06 开始；8 月时已还 2 期（6月、7月），剩 4 期
  const inst = {
    name: '手机', day: 5, amount: 300,
    inst: { periods: 6, firstMonth: '2026-06', principal: 1800, interest: 0 },
  };
  const v = buildVirtualRepayments([inst], '2026-08');
  assert.equal(v.length, 4, '应为 6 − 2 = 4 期，实际 ' + v.length);
  assert.equal(v[0].periodIndex, 3, '第一期虚拟事件应是第 3 期');
});

test('★ 虚拟还款的日期按 firstMonth 逐月推进', () => {
  const inst = {
    name: '手机', day: 5,
    inst: { periods: 3, firstMonth: '2026-10', principal: 300, interest: 0 },
  };
  const v = buildVirtualRepayments([inst], '2026-09');   // 9 月：一期都还没到
  assert.equal(v.length, 3);
  assert.deepEqual(v.map((x) => x.date), ['2026-10-05', '2026-11-05', '2026-12-05']);
});

test('★ 还款日 31 号遇到 2 月要钳到月末', () => {
  const inst = {
    name: '房贷', day: 31,
    inst: { periods: 2, firstMonth: '2027-01', principal: 200, interest: 0 },
  };
  const v = buildVirtualRepayments([inst], '2026-12');
  assert.equal(v[0].date, '2027-01-31');
  assert.equal(v[1].date, '2027-02-28', '2 月只有 28 天');
});

test('已结束的分期不产生虚拟事件', () => {
  const inst = {
    name: '旧账', day: 10,
    inst: { periods: 3, firstMonth: '2025-01', principal: 300, interest: 0 },
  };
  const v = buildVirtualRepayments([inst], '2026-08');
  assert.equal(v.length, 0, '早就还完了');
});

test('虚拟事件按日期升序', () => {
  const a = { name: 'A', day: 20, inst: { periods: 2, firstMonth: '2026-09', principal: 100, interest: 0 } };
  const b = { name: 'B', day: 5, inst: { periods: 2, firstMonth: '2026-09', principal: 100, interest: 0 } };
  const v = buildVirtualRepayments([a, b], '2026-08');
  const dates = v.map((x) => x.date);
  assert.deepEqual(dates.slice(), dates.slice().sort(), '应当已排序：' + dates.join(','));
});

test('summarizeVirtual 求和与计数', () => {
  const v = buildVirtualRepayments(
    [{ name: 'X', day: 1, inst: { periods: 3, firstMonth: '2026-09', principal: 300, interest: 0 } }],
    '2026-08',
  );
  const s = summarizeVirtual(v);
  assert.equal(s.count, 3);
  assert.equal(s.total, 300);
});

test('没有分期时 virtual 是空数组（不是 undefined）', () => {
  const st = seed();
  const r = splitByTime(st.transactions, st.accounts, [], AUG);
  assert.ok(Array.isArray(r.virtual));
  assert.equal(r.virtual.length, 0);
});

test('counts 与实际长度一致', () => {
  const st = seed();
  const r = splitByTime(st.transactions, st.accounts, [], AUG);
  assert.equal(r.counts.past, r.past.length);
  assert.equal(r.counts.current, r.current.length);
  assert.equal(r.counts.future, r.future.length);
  assert.equal(r.counts.virtual, r.virtual.length);
});

test('SEGMENT 常量齐备', () => {
  assert.equal(SEGMENT.PAST, 'past');
  assert.equal(SEGMENT.CURRENT, 'current');
  assert.equal(SEGMENT.FUTURE, 'future');
});
