// 分类查询：时间段 + 分类关键字
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { queryByCategory } from '../js/core/category-query.js';

const accounts = [
  { id: 'a', name: '工资卡', type: '资产类', category: '储蓄' },
  { id: 'b', name: '现金', type: '资产类', category: '现金' },
  { id: 'c', name: '餐饮', type: '费用类', category: '日常' },
];

const tx = (id, date, from_id, to_id, amount, status) => ({
  id, date, from_id, to_id, amount, note: id, status,
});

const txs = [
  tx('t1', '2026-02-01', 'a', 'c', 50),       // 储蓄 → 日常，命中
  tx('t2', '2026-02-02', 'b', 'a', 100),      // 现金 → 储蓄，命中
  tx('t3', '2026-02-03', 'b', 'c', 20),       // 不命中
  tx('t4', '2026-01-01', 'a', 'c', 30),       // 时间段外
  tx('t5', '2026-02-04', 'a', 'c', 10, 'draft'), // 草稿不算
];

const range = { start: '2026-02-01', end: '2026-02-28' };

test('按转出或转入账户的分类命中', () => {
  const r = queryByCategory(txs, accounts, range, '储蓄');
  assert.deepEqual(r.map((x) => x.tx.id).sort(), ['t1', 't2']);
  assert.equal(r[0].to.name, '工资卡');
});

test('时间段过滤：区间外的流水不出现', () => {
  const r = queryByCategory(txs, accounts, range, '储蓄');
  assert.ok(!r.some((x) => x.tx.id === 't4'));
});

test('草稿不算流水', () => {
  const r = queryByCategory(txs, accounts, range, '储蓄');
  assert.ok(!r.some((x) => x.tx.id === 't5'));
});

test('空关键字返回空，不把整本账倒出来', () => {
  assert.deepEqual(queryByCategory(txs, accounts, range, ''), []);
  assert.deepEqual(queryByCategory(txs, accounts, range, '   '), []);
});

test('无命中返回空数组；日期倒序', () => {
  assert.deepEqual(queryByCategory(txs, accounts, range, '不存在'), []);
  const r = queryByCategory(txs, accounts, range, '储蓄');
  assert.equal(r[0].tx.date >= r[1].tx.date, true);
});
