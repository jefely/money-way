// 期初方向：资产从期初转入，负债/权益/收入从账户转到期初
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OPENING_ACCOUNT_ID } from '../js/core/schema.js';
import { openingEnds, normalizeOpeningDirections } from '../js/core/opening-tx.js';
import { accountSummary, openingOf } from '../js/core/ledger-stats.js';
import { migrate } from '../js/core/migrate.js';

const asset = { id: 'a', name: '现金', type: '资产类', category: '现金' };
const liability = { id: 'l', name: '信用卡', type: '负债类', category: '信用' };

function state() {
  return {
    version: 2,
    accounts: [asset, liability],
    transactions: [
      { id: 't1', from_id: OPENING_ACCOUNT_ID, to_id: 'a', amount: 100, date: '2000-01-01', opening: true },
      { id: 't2', from_id: OPENING_ACCOUNT_ID, to_id: 'l', amount: 200, date: '2000-01-01', opening: true },
    ],
  };
}

test('openingEnds：资产是期初→账户，负债是账户→期初', () => {
  assert.deepEqual(openingEnds(asset), { from_id: OPENING_ACCOUNT_ID, to_id: 'a' });
  assert.deepEqual(openingEnds(liability), { from_id: 'l', to_id: OPENING_ACCOUNT_ID });
});

test('旧数据修正：负债期初方向翻正，资产不动', () => {
  const out = normalizeOpeningDirections(state());
  const a = out.transactions.find((t) => t.id === 't1');
  const l = out.transactions.find((t) => t.id === 't2');
  assert.equal(a.from_id, OPENING_ACCOUNT_ID);
  assert.equal(a.to_id, 'a');
  assert.equal(l.from_id, 'l');
  assert.equal(l.to_id, OPENING_ACCOUNT_ID);
  assert.equal(openingOf(out, 'l'), 200);
});

test('修正后负债余额为正数欠款（应付口径）', () => {
  const out = normalizeOpeningDirections(state());
  const s = accountSummary(liability, out.transactions, { start: '2000-01-02', end: '2000-12-31' });
  assert.equal(s.balance, 200);
});

test('migrate 会对已经是 v2 的旧存档修正期初方向', () => {
  const m = migrate(state());
  const l = m.state.transactions.find((t) => t.id === 't2');
  assert.equal(l.from_id, 'l');
  assert.equal(l.to_id, OPENING_ACCOUNT_ID);
});

test('幂等：已经正确的期初不再改动，也不重复生成', () => {
  const once = normalizeOpeningDirections(state());
  const twice = normalizeOpeningDirections(once);
  assert.equal(twice, once);
  assert.equal(once.transactions.length, 2);
});
