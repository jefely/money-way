/**
 * 第一层基础测试：金额 / 统计 / 校验 / 格式化。
 *
 *   node --test nt/tests/*.test.mjs
 *
 * 存储与迁移的测试在 storage.test.mjs（ID 模型），加密在 crypto.test.mjs。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toAmount, computeAccountStats, aggregateBuckets, bucketOf } from '../js/core/stats.js';
import { checkBalanced, checkAccountingIdentity } from '../js/core/validate.js';
import { money, moneyAlways, moneyOrBlank, shortDate, isIsoDate } from '../js/core/format.js';

const ACC = [
  { id: 'a1', cat: '资产类', name: '招行储' },
  { id: 'a2', cat: '资产类', name: '现金' },
  { id: 'a3', cat: '费用类', name: '餐饮' },
];

test('toAmount：脏输入一律 0', () => {
  assert.equal(toAmount('¥1,234.56'), 1234.56);
  assert.equal(toAmount('abc'), 0);
  assert.equal(toAmount(null), 0);
  assert.equal(toAmount(''), 0);
});

test('computeAccountStats：资产类 转入增、转出减', () => {
  const st = computeAccountStats(ACC[0], { tOut: 200, tIn: 500, pOut: 200, pIn: 500, hOut: 0, hIn: 0 });
  assert.equal(st.balance, 0 + 500 - 200);
});

test('computeAccountStats：费用类也是「转入增、转出减」', () => {
  const added = computeAccountStats(ACC[2], { tOut: 0, tIn: 80, pOut: 0, pIn: 80, hOut: 0, hIn: 0 });
  assert.equal(added.balance, 80);
  const reversed = computeAccountStats(ACC[2], { tOut: 80, tIn: 0, pOut: 80, pIn: 0, hOut: 0, hIn: 0 });
  assert.equal(reversed.balance, -80);
});

test('aggregateBuckets：区间内 / 区间前 / 区间后进不同桶', () => {
  const txs = [
    { date: '2026-01-05', from: '招行储', to: '餐饮', amount: '10' },
    { date: '2026-02-05', from: '招行储', to: '餐饮', amount: '20' },
    { date: '2026-03-05', from: '招行储', to: '餐饮', amount: '40' },
  ];
  const map = aggregateBuckets(txs, ACC, { start: '2026-02-01', end: '2026-02-28' });
  const bank = bucketOf(map, ACC[0]);
  const food = bucketOf(map, ACC[2]);

  assert.equal(bank.hOut, 10);
  assert.equal(bank.pOut, 20);
  assert.equal(bank.tOut, 30);
  assert.equal(food.tIn, 30);
});

test('aggregateBuckets：不改原数组（纯函数）', () => {
  const txs = [{ date: '2026-02-05', from: '招行储', to: '餐饮', amount: '20' }];
  const snapshot = JSON.stringify(txs);
  aggregateBuckets(txs, ACC, { start: '', end: '' });
  assert.equal(JSON.stringify(txs), snapshot);
});

test('checkBalanced：正常账目 diff = 0 且 ok', () => {
  const r = checkBalanced([
    { from: '招行储', to: '餐饮', amount: '10' },
    { from: '现金', to: '餐饮', amount: '5' },
  ]);
  assert.equal(r.diff, 0);
  assert.equal(r.ok, true);
});

test('checkBalanced：单边流水会被抓出来', () => {
  const r = checkBalanced([{ from: '招行储', to: '', amount: '10' }]);
  assert.equal(r.singleSided.length, 1);
  assert.equal(r.ok, false);
});

test('checkAccountingIdentity：资产 + 费用 = 负债 + 权益 + 收入', () => {
  const ok = checkAccountingIdentity([
    { cat: '资产类', balance: 100 },
    { cat: '负债类', balance: 40 },
    { cat: '权益类', balance: 60 },
  ]);
  assert.equal(ok.diff, 0);

  const withExpense = checkAccountingIdentity([
    { cat: '资产类', balance: -128.5 },
    { cat: '费用类', balance: 128.5 },
  ]);
  assert.equal(withExpense.diff, 0);

  const bad = checkAccountingIdentity([
    { cat: '资产类', balance: 100 },
    { cat: '负债类', balance: 40 },
    { cat: '权益类', balance: 50 },
  ]);
  assert.equal(bad.diff, 10);
  assert.equal(bad.ok, false);
});

test('format：金额 / 空值 / 短日期', () => {
  assert.equal(money(1400), '¥1,400.00');
  assert.equal(money(0), '—');
  assert.equal(moneyAlways(0), '¥0.00');
  assert.equal(moneyOrBlank(0), '');
  assert.equal(moneyOrBlank(12.5), '¥12.50');
  // 六位 YYMMDD（与单文件版一致；带连字符的 26-08-30 是旧格式）
  assert.equal(shortDate('2026-08-30'), '260830');
  assert.equal(isIsoDate('2026-08-30'), true);
  assert.equal(isIsoDate('2026-02-31'), false);
});
