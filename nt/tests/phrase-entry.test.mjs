/**
 * 一句话入账、自学习映射、失焦不丢草稿。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState, addAccount, removeAccount } from '../js/core/state-store.js';
import { ACCOUNT_TYPE, isPosted } from '../js/core/schema.js';
import { balanceOf } from '../js/core/balance-calculator.js';
import { applyPhrase, fillDraft, retainDrafts, suggestPhraseAccounts } from '../js/core/phrase-entry.js';

const NOW = new Date(2026, 10, 4);

test('咖啡 50 是草稿：备注咖啡，转入餐饮，不建咖啡节点', () => {
  const r = applyPhrase(createState(), '咖啡 50', NOW);
  assert.equal(r.outcome, 'need-from');
  assert.equal(r.tx.status, 'draft');
  assert.equal(r.tx.amount, 50);
  assert.equal(r.tx.note, '咖啡');
  assert.equal(r.tx.from_id, null);
  const food = r.state.accounts.find((a) => a.id === r.tx.to_id);
  assert.equal(food.name, '餐饮');
  assert.equal(food.type, ACCOUNT_TYPE.EXPENSE);
  assert.ok(!r.state.accounts.some((a) => a.name === '咖啡' || a.name === '饮品'));
});

test('接着写微信：补转出，餐饮已在，直接入账', () => {
  const first = applyPhrase(createState(), '咖啡 50', NOW);
  const r = fillDraft(first.state, first.tx.id, '微信');
  assert.equal(isPosted(r.tx), true);
  const wx = r.state.accounts.find((a) => a.id === r.tx.from_id);
  const food = r.state.accounts.find((a) => a.id === r.tx.to_id);
  assert.equal(wx.name, '微信');
  assert.equal(wx.type, ACCOUNT_TYPE.ASSET);
  assert.equal(wx.category, '网络账户');
  assert.equal(food.name, '餐饮');
  assert.equal(balanceOf(wx, r.state.transactions).balance, -50);
});

test('模糊的「微」只建议，不建账户', () => {
  const first = applyPhrase(createState(), '咖啡 50', NOW);
  const r = fillDraft(first.state, first.tx.id, '微');
  assert.equal(r.outcome, 'suggest');
  assert.equal(r.state, first.state);
  assert.ok(r.suggestions.some((s) => s.acc.name === '微信'));
  assert.ok(!r.state.accounts.some((a) => a.name === '微' || a.name === '微信'));
});

test('认不出的词留在备注，不建节点', () => {
  const first = applyPhrase(createState(), '咖啡 50', NOW);
  const r = fillDraft(first.state, first.tx.id, '老李', { force: true });
  assert.ok(!r.state.accounts.some((a) => a.name === '老李'));
  assert.equal(r.tx.from_id, null);
  assert.ok(String(r.tx.note).includes('老李'));
  assert.equal(r.tx.status, 'draft');
});

test('的家伙、豆包不当、ZD 不会变成节点', () => {
  let cur = applyPhrase(createState(), '咖啡 50', NOW);
  for (const word of ['的家伙', '豆包不当', 'ZD']) {
    cur = fillDraft(cur.state, cur.tx.id, word, { force: true });
    assert.ok(!cur.state.accounts.some((a) => a.name === word));
    assert.ok(String(cur.tx.note).includes(word));
  }
});

test('工资到微信 8000 直接入账：收入 → 资产', () => {
  const r = applyPhrase(createState(), '工资到微信 8000', NOW);
  assert.equal(r.outcome, 'posted');
  assert.equal(isPosted(r.tx), true);
  assert.equal(r.tx.amount, 8000);
  const from = r.state.accounts.find((a) => a.id === r.tx.from_id);
  const to = r.state.accounts.find((a) => a.id === r.tx.to_id);
  assert.equal(from.name, '工资');
  assert.equal(from.type, ACCOUNT_TYPE.INCOME);
  assert.equal(to.name, '微信');
  assert.equal(to.type, ACCOUNT_TYPE.ASSET);
  assert.equal(to.category, '网络账户');
  assert.ok(!r.state.accounts.some((a) => a.name === '饮品'));
});

test('昨天用微信买咖啡50：微信转出，餐饮转入，备注是咖啡', () => {
  const r = applyPhrase(createState(), '昨天用微信买咖啡50', NOW);
  assert.equal(r.tx.date, '2026-11-03');
  assert.equal(r.tx.amount, 50);
  assert.equal(r.tx.note, '咖啡');
  assert.equal(isPosted(r.tx), true);
  const wx = r.state.accounts.find((a) => a.name === '微信');
  const food = r.state.accounts.find((a) => a.name === '餐饮');
  assert.equal(r.tx.from_id, wx.id);
  assert.equal(r.tx.to_id, food.id);
  assert.ok(!r.state.accounts.some((a) => a.name === '咖啡'));
  assert.equal(balanceOf(wx, r.state.transactions).balance, -50);
});

test('听不懂的句子整句进备注，不猜金额', () => {
  const text = '今天那个老李还了我上次请他吃饭的钱';
  const r = applyPhrase(createState(), text, NOW);
  assert.equal(r.outcome, 'note');
  assert.equal(r.tx.status, 'draft');
  assert.equal(r.tx.amount, 0);
  assert.equal(r.tx.note, text);
  assert.equal(r.tx.from_id, null);
});

test('用户把备注归到已有账户后，下次咖啡会记住，删账户则忘掉', () => {
  let s = createState();
  s = addAccount(s, { id: 'drink', code: 'YP', name: '饮品', type: ACCOUNT_TYPE.EXPENSE, category: '餐饮' });
  const first = applyPhrase(s, '咖啡 50', NOW);
  const paid = fillDraft(first.state, first.tx.id, '微信');
  assert.equal(isPosted(paid.tx), true);
  const done = fillDraft(paid.state, paid.tx.id, '饮品');
  assert.equal(isPosted(done.tx), true);
  assert.equal(done.tx.to_id, 'drink');
  assert.equal(done.state.mappings['咖啡'], 'drink');

  const again = applyPhrase(done.state, '咖啡 30', NOW);
  assert.equal(again.tx.to_id, 'drink');
  assert.equal(again.tx.status, 'draft', '还没写转出，映射只补转入');

  const dropped = removeAccount(done.state, 'drink');
  assert.equal(dropped.mappings['咖啡'], undefined);
});

test('失焦与超时不删除草稿', () => {
  const r = applyPhrase(createState(), '咖啡 50', NOW);
  const kept = retainDrafts(r.state);
  assert.equal(kept.transactions.length, 1);
  assert.equal(kept.transactions[0].id, r.tx.id);
  assert.equal(kept.transactions[0].status, 'draft');
  assert.equal(kept.transactions[0].amount, 50);
});

test('发送时认不出的碎片不建节点', () => {
  const first = applyPhrase(createState(), '咖啡 50', NOW);
  const hinted = fillDraft(first.state, first.tx.id, '微');
  assert.equal(hinted.outcome, 'suggest');
  const made = fillDraft(first.state, first.tx.id, '微', { force: true });
  assert.ok(!made.state.accounts.some((a) => a.name === '微'));
  assert.equal(made.tx.from_id, null);
  assert.ok(String(made.tx.note).includes('微'));
});

test('简码对上节点，不会掉进备注', () => {
  let s = createState();
  s = addAccount(s, { id: 'bank', code: 'ZHC', name: '招行储蓄卡', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  const first = applyPhrase(s, '咖啡 50', NOW);
  const r = fillDraft(first.state, first.tx.id, 'zhc', { force: true });
  assert.equal(r.tx.from_id, 'bank');
  assert.equal(r.tx.note, '咖啡');
  const named = (r.state.accounts || []).find((a) => a.id === 'bank');
  assert.equal(named.name, '招行储蓄卡');
});

test('候选里能看到模糊的支付账户', () => {
  const items = suggestPhraseAccounts(createState(), '薇信');
  assert.ok(items.some((s) => s.acc.name === '微信'));
});
