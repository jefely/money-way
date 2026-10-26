/**
 * 纯函数测试（Node 内置 test runner，无第三方依赖）。
 *
 *   node --test nt/tests/
 *
 * 公约 3.3：这些测试**不 import 任何浏览器 API**，所以能直接跑。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toAmount, computeAccountStats, aggregateBuckets, bucketOf } from '../js/core/stats.js';
import { checkBalanced, checkAccountingIdentity } from '../js/core/validate.js';
import { money, moneyAlways, shortDate, isIsoDate } from '../js/core/format.js';
import { createState, addTransaction, removeTransaction } from '../js/core/state.js';
import { migrate } from '../js/core/migrate.js';

const ACC = [
  { id: 'a1', cat: '资产类', name: '招行储', opening: '1000' },
  { id: 'a2', cat: '资产类', name: '现金', opening: '0' },
  { id: 'a3', cat: '费用类', name: '餐饮', opening: '0' },
];

test('toAmount：脏输入一律 0', () => {
  assert.equal(toAmount('¥1,234.56'), 1234.56);
  assert.equal(toAmount('abc'), 0);
  assert.equal(toAmount(null), 0);
  assert.equal(toAmount(''), 0);
});

test('computeAccountStats：资产类 转入增、转出减', () => {
  const st = computeAccountStats(ACC[0], { tOut: 200, tIn: 500, pOut: 200, pIn: 500, hOut: 0, hIn: 0 });
  assert.equal(st.balance, 1000 + 500 - 200);
});

test('computeAccountStats：费用类也是「转入增、转出减」', () => {
  // 费用类在 double-entry 里同样借增贷减：现金 转出 → 餐饮 转入，餐饮因此增加。
  const added = computeAccountStats(ACC[2], { tOut: 0, tIn: 80, pOut: 0, pIn: 80, hOut: 0, hIn: 0 });
  assert.equal(added.balance, 80);

  // 反过来从餐饮转出 = 冲销，余额下降。
  const reversed = computeAccountStats(ACC[2], { tOut: 80, tIn: 0, pOut: 80, pIn: 0, hOut: 0, hIn: 0 });
  assert.equal(reversed.balance, -80);
});

test('aggregateBuckets：区间内 / 区间前 / 区间后三种日期分别进不同桶', () => {
  const txs = [
    { date: '2026-01-05', from: '招行储', to: '餐饮', amount: '10' },
    { date: '2026-02-05', from: '招行储', to: '餐饮', amount: '20' },
    { date: '2026-03-05', from: '招行储', to: '餐饮', amount: '40' },
  ];
  const map = aggregateBuckets(txs, ACC, { start: '2026-02-01', end: '2026-02-28' });
  const bank = bucketOf(map, ACC[0]);
  const food = bucketOf(map, ACC[2]);

  assert.equal(bank.hOut, 10, '区间前只算历史桶');
  assert.equal(bank.pOut, 20, '区间内只算当期桶');
  assert.equal(bank.tOut, 30, '到区间末的累计 = 区间前 + 区间内（不含区间后）');
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
  // 只有资产/负债/权益时，这就是最简形式
  const ok = checkAccountingIdentity([
    { cat: '资产类', balance: 100 },
    { cat: '负债类', balance: 40 },
    { cat: '权益类', balance: 60 },
  ]);
  assert.equal(ok.diff, 0);
  assert.equal(ok.ok, true);

  // 记一笔费用：资产 -128.5、费用 +128.5 —— 恒等式必须仍然为 0
  const withExpense = checkAccountingIdentity([
    { cat: '资产类', balance: -128.5 },
    { cat: '费用类', balance: 128.5 },
  ]);
  assert.equal(withExpense.diff, 0);
  assert.equal(withExpense.ok, true);

  // 记一笔收入：资产 +500、收入 +500
  const withIncome = checkAccountingIdentity([
    { cat: '资产类', balance: 500 },
    { cat: '收入类', balance: 500 },
  ]);
  assert.equal(withIncome.diff, 0);

  // 真正不平的账要被抓出来
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
  assert.equal(shortDate('2026-08-30'), '26-08-30');
  assert.equal(isIsoDate('2026-08-30'), true);
  assert.equal(isIsoDate('2026-02-31'), false);
});

test('state：addTransaction 不改原状态，seq 递增', () => {
  const s0 = createState();
  const s1 = addTransaction(s0, { date: '2026-01-01', from: 'a', to: 'b', amount: '1' });
  assert.equal(s0.transactions.length, 0, '原状态必须不变');
  assert.equal(s1.transactions.length, 1);
  assert.equal(s1.transactions[0].seq, 1);

  const s2 = addTransaction(s1, { date: '2026-01-02', from: 'a', to: 'b', amount: '2' });
  assert.equal(s2.transactions[1].seq, 2);

  const s3 = removeTransaction(s2, s2.transactions[0].id);
  assert.equal(s3.transactions.length, 1);
  assert.equal(s2.transactions.length, 2, '删除也要返回新状态');
});

test('migrate：幂等 —— 跑两次结果一致', () => {
  const raw = { accounts: [], transactions: [{ id: 't1', seq: 3, amount: '1' }] };
  const once = migrate(raw).state;
  const twice = migrate(once).state;
  assert.deepEqual(once, twice);
  assert.equal(once.version, 1);
});

test('migrate：版本高于当前时不降级', () => {
  const r = migrate({ version: 99, transactions: [] });
  assert.equal(r.state.version, 99);
  assert.equal(r.migrated, false);
});
