/**
 * 重置：节点模板（保留流水）与整本账（回到新建状态）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resetAccountsKeepData, resetBookState, SEED_ACCOUNTS } from '../js/core/reset-book.js';
import { createState } from '../js/core/state-store.js';
import { OPENING_ACCOUNT_ID } from '../js/core/schema.js';

test('重置节点模板：换回默认模板，清掉期初流水，普通流水保留', () => {
  const s = createState();
  s.accounts = [
    { id: 'old', code: 'OLD', name: '旧账户', type: '资产类', category: '储蓄', opening: 999 },
    { id: 'keep', code: 'K', name: '现金', type: '资产类', category: '现金', opening: 88 },
  ];
  s.transactions = [
    { id: 't1', date: '2026-01-01', from_id: OPENING_ACCOUNT_ID, to_id: 'keep', amount: 100, opening: true },
    { id: 't2', date: '2026-01-02', from_id: 'keep', to_id: 'old', amount: 50 },
  ];
  s.deletedAccounts = ['ghost'];

  const r = resetAccountsKeepData(s);
  assert.equal(r.transactions.length, 1, '期初流水必须被清掉');
  assert.equal(r.transactions[0].id, 't2');
  assert.equal(r.accounts.some((a) => a.name === '现金'), true);
  assert.equal(r.accounts.some((a) => a.name === '旧账户'), false);
  assert.equal(r.accounts.every((a) => a.opening === undefined), true, '账户上的期初字段也要清');
  assert.deepEqual(r.deletedAccounts, [], '删账户标记也要一起清');
});

test('重置账本：流水/节点/计划/备注/列宽全部回到新建状态', () => {
  const r = resetBookState();
  assert.equal(r.transactions.length, 0);
  assert.equal(r.scheduled.length, 0);
  assert.equal(r.notes.length, 0);
  assert.deepEqual(r.settings, {});
  assert.equal(r.accounts.length, 1 + SEED_ACCOUNTS.length);
  assert.equal(r.accounts[0].id, OPENING_ACCOUNT_ID);
});
