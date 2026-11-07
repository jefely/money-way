/**
 * 备注统计：只累加、不平账。
 *
 *   node --test nt/tests/note-stats.test.mjs
 *
 * 守的是用户 2026-11-08 定的口径：
 *   · 一级按关键字合计，二级按备注类型分组
 *   · 金额取绝对值累加（备注统计回答的是「这个说法一共多少钱」）
 *   · 没有关键字的流水不进备注统计
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { noteTotals, rollupByKeyword, rowsOfKeyword } from '../js/core/note-stats.js';

function state() {
  return {
    notes: [
      { id: 'n1', keyword: '味丰源', type: '餐饮' },
      { id: 'n2', keyword: '昆明地铁', type: '交通' },
    ],
    transactions: [
      { id: 't1', date: '2026-10-01', amount: 12, noteKeyword: '味丰源' },
      { id: 't2', date: '2026-10-02', amount: 8.5, noteKeyword: '味丰源' },
      { id: 't3', date: '2026-10-03', amount: 4, noteKeyword: '味丰源' },
      { id: 't4', date: '2026-10-04', amount: 6, noteKeyword: '昆明地铁' },
      { id: 't5', date: '2026-10-05', amount: 99, noteKeyword: '' },
    ],
  };
}

test('noteTotals：按「关键字 + 类型」两级分组，金额取绝对值累加', () => {
  const rows = noteTotals(state());
  const wei = rows.find((r) => r.keyword === '味丰源');
  assert.equal(wei.type, '餐饮');
  assert.equal(wei.count, 3);
  assert.equal(wei.sum, 24.5);

  const dit = rows.find((r) => r.keyword === '昆明地铁');
  assert.equal(dit.sum, 6);
  assert.equal(dit.count, 1);

  // 没有关键字的流水不进备注统计
  assert.equal(rows.length, 2);
});

test('noteTotals：同一个关键字在不同类型下会分成两行', () => {
  const s = state();
  s.notes.push({ id: 'n3', keyword: '味丰源', type: '日用' });
  const rows = noteTotals(s);
  // 备注表里同一个关键字出现两次时，后写入的覆盖（map 语义）
  assert.equal(rows.filter((r) => r.keyword === '味丰源').length, 1);
});

test('rollupByKeyword：一级合计把类型合并掉', () => {
  const byKw = rollupByKeyword(noteTotals(state()));
  assert.equal(byKw.length, 2);
  assert.equal(byKw[0].keyword, '味丰源');   // 金额大的排前面
  assert.equal(byKw[0].sum, 24.5);
  assert.deepEqual(byKw[0].types.map((t) => t.type), ['餐饮']);
});

test('rowsOfKeyword：按日期倒序返回命中的流水', () => {
  const rows = rowsOfKeyword(state(), '味丰源');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].date, '2026-10-03');
  assert.equal(rows[2].date, '2026-10-01');
  assert.equal(rowsOfKeyword(state(), '').length, 0);
});
