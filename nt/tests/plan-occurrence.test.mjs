/**
 * 未来行：确认落到今天、作废不改模板、改账户写回模板、转出不用「分期还款」。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState, addAccount } from '../js/core/state-store.js';
import { createScheduled } from '../js/core/schema.js';
import { ACCOUNT_TYPE } from '../js/core/schema.js';
import {
  planKey, pickSavingsAccount, confirmOccurrence, voidOccurrence,
  visiblePlans, syncPlanFromEdit, occurrenceTaken, installmentRowView,
} from '../js/core/plan-occurrence.js';
import { buildVirtualRepayments } from '../js/timeline/time-state.js';

function book() {
  let s = createState();
  s = addAccount(s, { id: 'bank', code: 'ZHC', name: '招行储', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'cash', code: 'XJ', name: '现金', type: ACCOUNT_TYPE.ASSET, category: '现金' });
  s = addAccount(s, { id: 'card', code: 'XY', name: '招行信', type: ACCOUNT_TYPE.LIABILITY, category: '信用卡' });
  const rule = createScheduled({
    id: 'sch1', freq: 'monthly', day: 5, from_id: null, to_id: 'card', amount: 100, note: '手机',
    inst: { periods: 3, firstMonth: '2026-11', principal: 300, interest: 0 },
  });
  s = { ...s, scheduled: [rule] };
  return s;
}

test('储蓄卡优先于其它资产', () => {
  const s = book();
  assert.equal(pickSavingsAccount(s.accounts).id, 'bank');
});

test('分期未来行的转出是储蓄卡，备注带分期还款，不是「分期还款」这个假账户', () => {
  const s = book();
  const v = buildVirtualRepayments(s.scheduled, '2026-11', s.accounts);
  assert.ok(v.length >= 1);
  assert.equal(v[0].fromName, '招行储');
  assert.notEqual(v[0].fromName, '分期还款');
  assert.match(v[0].note, /分期还款/);
  assert.match(v[0].note, /第 1\/3 期/);
  assert.equal(v[0].fromId, 'bank');
});

test('确认追加到现在末尾且日期是今天；再出现就被藏起', () => {
  const s = book();
  const spec = {
    planKey: planKey('sch1', '2026-12'),
    sourceId: 'sch1',
    month: '2026-12',
    fromId: 'bank',
    toId: 'card',
    amount: 100,
    note: '分期还款 第 2/3 期',
  };
  const next = confirmOccurrence(s, spec, '2026-11-04');
  const tx = next.transactions[next.transactions.length - 1];
  assert.equal(tx.date, '2026-11-04');
  assert.equal(tx.from_id, 'bank');
  assert.equal(tx.planKey, 'sch1|2026-12');
  assert.equal(next.scheduled.length, 1, '模板还在');
  assert.equal(visiblePlans([{ planKey: spec.planKey }], next).length, 0);
});

test('作废只记一期，不删模板', () => {
  const s = book();
  const spec = { planKey: 'sch1|2026-12', sourceId: 'sch1', month: '2026-12' };
  const next = voidOccurrence(s, spec);
  assert.equal(next.scheduled.length, 1);
  assert.equal(next.scheduled[0].id, 'sch1');
  assert.ok(occurrenceTaken(next, 'sch1|2026-12'));
  assert.equal((next.transactions || []).length, s.transactions.length);
});

test('改已确认流水的转出，写回固定收支模板', () => {
  let s = book();
  s = confirmOccurrence(s, {
    planKey: 'sch1|2026-12', sourceId: 'sch1', month: '2026-12',
    fromId: 'bank', toId: 'card', amount: 100, note: '分期还款',
  }, '2026-11-04');
  const tx = s.transactions[s.transactions.length - 1];
  s = {
    ...s,
    transactions: s.transactions.map((t) => (t.id === tx.id ? { ...t, from_id: 'cash' } : t)),
  };
  const synced = syncPlanFromEdit(s, tx.id);
  assert.equal(synced.scheduled[0].from_id, 'cash');
  assert.ok(synced.scheduled[0].inst, '分期规则还在');
});

test('固定表看分期：转出落到储蓄卡，备注含分期还款', () => {
  const s = book();
  const view = installmentRowView(s.scheduled[0], s.accounts);
  assert.equal(view.fromId, 'bank');
  assert.match(view.note, /分期还款/);
  assert.equal(view.freq, 'monthly');
});
