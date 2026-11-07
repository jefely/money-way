/**
 * 节点合并：把待归类节点并进真实节点。
 *
 *   node --test nt/tests/account-merge.test.mjs
 *
 * 守的是两件事：
 *   · 流水两端都要改指目标节点（只改一端 = 钱凭空多出来）
 *   · 流水备注里的关键字不动 —— 「味丰源」归到「早餐」后，那 19 笔仍然记着是给味丰源的
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState, addAccount, addTransaction } from '../js/core/state-store.js';
import { mergeAccountInto } from '../js/core/account-merge.js';

function book() {
  let s = createState();
  s = addAccount(s, { id: 'cmb', name: '招行储7912', type: '资产类', category: '储蓄' });
  s = addAccount(s, { id: 'temp', name: '味丰源' });
  s = addAccount(s, { id: 'bf', name: '早餐', type: '费用类', category: '日常开销' });
  s = addTransaction(s, { date: '2026-10-01', from_id: 'cmb', to_id: 'temp', amount: 12, note: '味丰源｜收钱码收款', noteKeyword: '味丰源' });
  s = addTransaction(s, { date: '2026-10-02', from_id: 'temp', to_id: 'cmb', amount: 3, note: '退款', noteKeyword: '味丰源' });
  s = addTransaction(s, { date: '2026-10-03', from_id: 'cmb', to_id: 'bf', amount: 5, note: '别的', noteKeyword: '别的' });
  return s;
}

test('合并：两端都改指目标，旧节点删掉，moved 只数受影响的笔数', () => {
  const before = book();
  const r = mergeAccountInto(before, 'temp', 'bf');
  assert.equal(r.moved, 2);
  assert.ok(!r.state.accounts.some((a) => a.id === 'temp'));
  assert.ok(r.state.accounts.some((a) => a.id === 'bf'));

  const [t1, t2] = r.state.transactions;
  assert.equal(t1.from_id, 'cmb');
  assert.equal(t1.to_id, 'bf');
  assert.equal(t2.from_id, 'bf');
  assert.equal(t2.to_id, 'cmb');

  // 备注关键字保持「味丰源」：节点归并了，这钱当初是给谁的还在
  assert.equal(t1.noteKeyword, '味丰源');
  assert.equal(t2.noteKeyword, '味丰源');
});

test('合并：不相干的流水原样不动', () => {
  const before = book();
  const r = mergeAccountInto(before, 'temp', 'bf');
  const other = r.state.transactions[2];
  assert.equal(other.from_id, 'cmb');
  assert.equal(other.to_id, 'bf');
  assert.equal(other.amount, 5);
});

test('合并：参数无效时原样返回', () => {
  const before = book();
  assert.equal(mergeAccountInto(before, 'temp', 'temp').moved, 0);
  assert.equal(mergeAccountInto(before, 'nope', 'bf').moved, 0);
  assert.equal(mergeAccountInto(before, 'temp', 'nope').state, before);
});
