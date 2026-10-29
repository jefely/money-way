/**
 * 账户分区 / 序号 / 未定义账户补壳（core/account-order.js）
 *
 * 用户 2026-10-30：设置表自动扫描「流水里有、设置表里没有」的账户，
 * 补一个类型/分类都为空的壳，放进第 3 个区域「未分类账户」。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  zoneKeyOf, accountsOfZone, orderBySeq, nextSeqFor, moveWithinType, withUndefinedAccounts,
} from '../js/core/account-order.js';

test('zoneKeyOf：按类型分 A/B，类型为空归 U', () => {
  assert.equal(zoneKeyOf({ type: '资产类' }), 'A');
  assert.equal(zoneKeyOf({ type: '费用类' }), 'A');
  assert.equal(zoneKeyOf({ type: '负债类' }), 'B');
  assert.equal(zoneKeyOf({ type: '收入类' }), 'B');
  assert.equal(zoneKeyOf({ type: '' }), 'U');
  assert.equal(zoneKeyOf({}), 'U');
  assert.equal(zoneKeyOf({ type: '客户' }), 'A', '自己填的未知类型仍留在 A');
});

test('orderBySeq：按序号升序、同号保持原顺序', () => {
  const list = [
    { id: 'a', type: '资产类', seq: 100 },
    { id: 'b', type: '资产类' },
    { id: 'c', type: '资产类', seq: 80 },
  ];
  assert.deepEqual(orderBySeq(list).map((x) => x.id), ['b', 'c', 'a']);
});

test('nextSeqFor：本区最大有效序号 + 1', () => {
  assert.equal(nextSeqFor([{ seq: 3 }, { seq: 100 }, {}]), 101);
  assert.equal(nextSeqFor([]), 1);
});

test('moveWithinType：与同类型的前一个交换', () => {
  const list = [
    { id: 'a', type: '资产类' },
    { id: 'b', type: '负债类' },
    { id: 'c', type: '资产类' },
  ];
  const r = moveWithinType(list, 'c');
  assert.equal(r.moved, true);
  assert.deepEqual(r.accounts.map((x) => x.id), ['c', 'b', 'a']);
  assert.equal(moveWithinType(list, 'a').moved, false, '第一个没得换');
});

test('withUndefinedAccounts：断链 ID 补空壳，落在 U 区，且幂等', () => {
  const s = {
    accounts: [{ id: 'a', name: '现金', type: '资产类' }],
    transactions: [
      { from_id: 'a', to_id: 'ghost', amount: 1, date: '2026-10-01' },
      { from_id: 'ghost2', to_id: 'a', amount: 2, date: '2026-10-02' },
    ],
  };
  const r = withUndefinedAccounts(s);
  assert.equal(r.accounts.length, 3);
  assert.deepEqual(r.accounts.slice(1).map((x) => x.id), ['ghost', 'ghost2']);
  assert.equal(r.accounts[1].type, '');
  assert.equal(r.accounts[1].category, '');
  assert.equal(zoneKeyOf(r.accounts[1]), 'U');

  assert.equal(withUndefinedAccounts(r), r, '补过就不该再补');
  assert.equal(accountsOfZone(r.accounts, 'U').length, 2);
});
