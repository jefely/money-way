/**
 * 新账户名自动归类，以及「新增」标记的生命周期。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchAccountName } from '../js/core/account-match.js';
import { createState, ensureAccountByText, updateAccount, addTransaction } from '../js/core/state-store.js';
import { promoteDrafts } from '../js/core/draft-book.js';
import { isPosted } from '../js/core/schema.js';
import { stateFromLzPayload } from '../js/core/lz-file.js';

test('银行名、花呗、咖啡、工资按词库或启发式归类', () => {
  assert.deepEqual(
    ((n) => { const m = matchAccountName(n); return { type: m.type, category: m.category }; })('招行储0803'),
    { type: '资产类', category: '储蓄' },
  );
  assert.equal(matchAccountName('工行').category, '储蓄');
  assert.equal(matchAccountName('花呗').type, '负债类');
  assert.equal(matchAccountName('花呗').category, '网贷');
  assert.equal(matchAccountName('白条').category, '网贷');
  assert.equal(matchAccountName('信用卡').category, '信用');
  assert.equal(matchAccountName('咖啡').type, '费用类');
  assert.equal(matchAccountName('咖啡').category, '餐饮');
  assert.equal(matchAccountName('工资').type, '收入类');
  assert.equal(matchAccountName('微信支付').type, '资产类');
  assert.equal(matchAccountName('微信支付').category, '网络账户');
});

test('认不出的名字不猜类型', () => {
  assert.equal(matchAccountName('老李'), null);
  assert.equal(matchAccountName(''), null);
});

test('自动建的账户带新增标记；改过就去掉；序列化后还在', () => {
  const made = ensureAccountByText(createState(), '招行储0803');
  const acc = made.state.accounts.find((a) => a.id === made.id);
  assert.equal(acc.fresh, true);
  assert.equal(acc.type, '资产类');
  assert.equal(acc.name, '招行储0803');

  const plain = JSON.parse(JSON.stringify(made.state));
  assert.equal(plain.accounts.find((a) => a.id === made.id).fresh, true, '加密备份存的是整份 state');

  const edited = updateAccount(made.state, made.id, { category: '储蓄' });
  assert.equal(edited.accounts.find((a) => a.id === made.id).fresh, undefined);
});

test('两边都能归类时草稿直接入账', () => {
  let s = createState();
  const from = ensureAccountByText(s, '微信');
  s = from.state;
  const to = ensureAccountByText(s, '咖啡');
  s = to.state;
  s = promoteDrafts(addTransaction(s, {
    date: '2026-11-04', from_id: from.id, to_id: to.id, amount: 50, note: '咖啡', status: 'draft',
  }));
  const tx = s.transactions[s.transactions.length - 1];
  assert.equal(isPosted(tx), true);
});

test('认不出的账户仍是新增且没有类型', () => {
  const made = ensureAccountByText(createState(), '老李');
  const acc = made.state.accounts.find((a) => a.id === made.id);
  assert.equal(acc.type, '');
  assert.equal(acc.fresh, true);
});

test('.lz 还原保留新增标记', () => {
  const restored = stateFromLzPayload({
    accounts: [{ name: '招行储0803', type: '资产类', category: '储蓄', fresh: true }],
    transactions: [],
  });
  const acc = restored.state.accounts.find((a) => a.name === '招行储0803');
  assert.equal(acc.fresh, true);
});
