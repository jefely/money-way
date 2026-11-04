/**
 * 草稿：不进余额 / 统计 / 恒等式 / 环图 / 判重 / 二维码。
 * .lz 保留 status，xlsx 有「状态」列。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState, addAccount, addTransaction, updateAccount, removeAccount } from '../js/core/state-store.js';
import { createTransaction, isPosted, ACCOUNT_TYPE } from '../js/core/schema.js';
import { balanceOf } from '../js/core/balance-calculator.js';
import { aggregateBuckets, bucketOf } from '../js/core/stats.js';
import { accountSummary } from '../js/core/ledger-stats.js';
import { checkAccountingIdentity } from '../js/core/validate.js';
import { validate } from '../js/core/validator.js';
import { fetchGraphData } from '../js/graph/mw-data-fetcher.js';
import { fingerprintBag } from '../js/core/import-dedupe.js';
import { packForQr, packPayload } from '../js/core/sync-code.js';
import { buildFlowSheet } from '../js/core/xlsx-template.js';
import { parseFlowRows, stateFromTemplate } from '../js/core/xlsx-template-read.js';
import { stateFromLzPayload } from '../js/core/lz-file.js';
import { markerOf, canPost } from '../js/core/draft-book.js';

function book() {
  let s = createState();
  s = addAccount(s, { id: 'bank', code: 'YH', name: '银行卡', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'food', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '餐饮' });
  s = addTransaction(s, { date: '2026-11-01', from_id: 'bank', to_id: 'food', amount: 10, note: '午饭' });
  s = addTransaction(s, {
    date: '2026-11-02', from_id: 'bank', to_id: 'food', amount: 999, note: '咖啡', status: 'draft',
  });
  return s;
}

test('缺 status = 已入账；只有 draft 才写下这个字段', () => {
  const old = createTransaction({ amount: 3, from_id: 'a', to_id: 'b' });
  assert.equal(old.status, undefined);
  assert.equal(isPosted(old), true);
  const draft = createTransaction({ amount: 3, status: 'draft' });
  assert.equal(draft.status, 'draft');
  assert.equal(isPosted(draft), false);
});

test('余额、统计、恒等式都不吃草稿，单边草稿也不算支出', () => {
  const s = book();
  const bank = s.accounts.find((a) => a.id === 'bank');
  const food = s.accounts.find((a) => a.id === 'food');
  assert.equal(balanceOf(bank, s.transactions).balance, -10);
  assert.equal(balanceOf(food, s.transactions).balance, 10);
  assert.equal(accountSummary(food, s.transactions).balance, 10);

  let one = createState();
  one = addAccount(one, { id: 'bank', code: 'YH', name: '银行卡', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  one = addTransaction(one, { date: '2026-11-02', from_id: 'bank', to_id: null, amount: 40, status: 'draft' });
  assert.equal(balanceOf(one.accounts.find((a) => a.id === 'bank'), one.transactions).balance, 0);

  const map = aggregateBuckets(
    [{ date: '2026-11-01', from: '银行卡', to: '餐饮', amount: 10, fromId: 'bank', toId: 'food' },
      { date: '2026-11-02', from: '银行卡', to: '餐饮', amount: 999, status: 'draft', fromId: 'bank', toId: 'food' }],
    [{ id: 'bank', name: '银行卡' }, { id: 'food', name: '餐饮' }],
    { start: '2026-11-01', end: '2026-11-30' },
  );
  assert.equal(bucketOf(map, { id: 'food', name: '餐饮' }).tIn, 10);

  const idt = checkAccountingIdentity([
    { cat: '资产类', balance: balanceOf(bank, s.transactions).balance },
    { cat: '费用类', balance: balanceOf(food, s.transactions).balance },
  ]);
  assert.equal(idt.diff, 0);
});

test('校验把草稿单独计数，不算 V1', () => {
  const r = validate({
    transactions: [{ id: 'd', status: 'draft', amount: 0, date: '', from_id: null, to_id: null }],
    accounts: [],
  });
  assert.equal(r.draftCount, 1);
  assert.equal(r.issues.filter((i) => i.code === 'V1' || i.code === 'V2' || i.code === 'V5').length, 0);
});

test('环图、判重、二维码切片都不含草稿', async () => {
  const s = book();
  const g = fetchGraphData({
    transactions: s.transactions,
    accounts: s.accounts,
    range: { start: '2026-11-01', end: '2026-11-30' },
  });
  assert.equal(g.txs.length, 1);
  assert.equal(g.txs[0].amount, 10);

  const bag = fingerprintBag(s.transactions);
  assert.equal([...bag.values()].reduce((n, x) => n + x, 0), 1);

  const packed = packPayload(s, s.transactions, null);
  assert.equal(packed.t.split('\n').filter(Boolean).length, 1);
  const qr = await packForQr(s, { base: 'https://x/', per: 10 });
  assert.equal(qr.total, 1);
});

test('xlsx 有状态列；缺列 = 已入账', () => {
  const s = book();
  const nameOf = (id) => (s.accounts.find((a) => a.id === id) || {}).name || '';
  const flow = buildFlowSheet(s, nameOf);
  const head = flow.rows[1].cells.map((c) => c.v);
  assert.ok(head.includes('状态'));
  const draftRow = flow.rows.find((r) => r.kind === 'data' && r.cells[5].v === '咖啡');
  assert.equal(draftRow.cells[6].v, '草稿');
  assert.equal(draftRow.cells[4].v, 999);

  const legacy = parseFlowRows([
    ['流水记录'],
    ['序', '日期', '转出账户', '转入账户', '金额', '备注'],
    [1, '2026-11-01', '银行卡', '餐饮', 10, '午饭'],
  ]);
  assert.equal(legacy.items[0].status, undefined);

  const next = parseFlowRows([
    ['流水记录'],
    ['序', '日期', '转出账户', '转入账户', '金额', '备注', '状态'],
    [1, '2026-11-02', '银行卡', '餐饮', 50, '咖啡', '草稿'],
    [2, '2026-11-03', '银行卡', '餐饮', 8, '午饭', ''],
  ]);
  assert.equal(next.items[0].status, 'draft');
  assert.equal(next.items[1].status, undefined);

  const built = stateFromTemplate({ accounts: [], flow: next, fixed: [], inst: [] });
  assert.equal(built.state.transactions[0].status, 'draft');
  assert.equal(built.state.transactions[1].status, undefined);
});

test('.lz 保留草稿状态、空类型和 mappings', () => {
  const restored = stateFromLzPayload({
    accounts: [{ name: '待定', type: '', category: '' }, { name: '餐饮', type: '费用类', category: '餐饮' }],
    transactions: [{ date: '2026-11-04', amount: 50, note: '咖啡', status: 'draft', from: '待定', to: '餐饮' }],
    mappings: { 咖啡: 'acc_keep' },
  });
  const pending = restored.state.accounts.find((a) => a.name === '待定');
  assert.equal(pending.type, '');
  const tx = restored.state.transactions.find((t) => t.note === '咖啡');
  assert.equal(tx.status, 'draft');
  assert.equal(restored.state.mappings['咖啡'], 'acc_keep');
});

test('补上类型后，两端齐全的草稿自动入账；标记跟着变', () => {
  let s = createState();
  const shell = (id, name, code) => ({ id, code, name, type: '', category: '', isHidden: false });
  s = { ...s, accounts: [...s.accounts, shell('a', '甲', 'A'), shell('b', '乙', 'B')] };
  s = addTransaction(s, { id: 't1', date: '2026-11-04', from_id: 'a', to_id: 'b', amount: 50, status: 'draft' });
  assert.equal(canPost(s.transactions[0], s.accounts), false);
  assert.equal(markerOf(s.transactions[0], s.accounts), 'untyped');

  s = updateAccount(s, 'a', { type: ACCOUNT_TYPE.ASSET });
  assert.equal(s.transactions.find((t) => t.id === 't1').status, 'draft');
  s = updateAccount(s, 'b', { type: ACCOUNT_TYPE.EXPENSE });
  const tx = s.transactions.find((t) => t.id === 't1');
  assert.equal(tx.status, undefined);
  assert.equal(isPosted(tx), true);
  assert.equal(markerOf(tx, s.accounts), '');
  assert.equal(balanceOf(s.accounts.find((a) => a.id === 'b'), s.transactions).balance, 50);
});

test('缺一端是空心标记；删账户时清掉指向它的映射', () => {
  let s = createState();
  s = addAccount(s, { id: 'a', code: 'A', name: '甲', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addTransaction(s, { date: '2026-11-04', from_id: null, to_id: null, amount: 50, note: '咖啡', status: 'draft' });
  assert.equal(markerOf(s.transactions[0], s.accounts), 'missing');
  s = { ...s, mappings: { 咖啡: 'a', 其他: 'z' } };
  s = removeAccount(s, 'a');
  assert.equal(s.mappings['咖啡'], undefined);
  assert.equal(s.mappings['其他'], 'z');
});
