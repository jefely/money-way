/**
 * 批量删除 / 撤销（removeBatch · restoreBatch）
 *
 * 这两件事为什么值得单独测：撤销是「把删掉的东西放回去」，
 * 而「放回原位」和「放回列表」是两回事 —— 顺序变了，用户一眼就看得出来
 * （流水表的序号、分期当月的先后）。所以断言位置，不只断言数量。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createState, addTransaction, removeBatch, restoreBatch, removeTransaction,
} from '../js/core/state-store.js';

function seeded() {
  let s = createState();
  for (const note of ['甲', '乙', '丙', '丁']) {
    s = addTransaction(s, { date: '2026-10-0' + (note.length + 1), amount: 10, note });
  }
  return s;
}

test('removeBatch 删掉指定 id，并记住原来在第几个', () => {
  const s = seeded();
  const ids = [s.transactions[1].id, s.transactions[3].id];

  const r = removeBatch(s, 'transactions', ids);

  assert.equal(r.state.transactions.length, 2);
  assert.deepEqual(r.removed.map((x) => x.index), [1, 3]);
  assert.deepEqual(r.removed.map((x) => x.row.note), ['乙', '丁']);
  // 原 state 不动（不可变更新）
  assert.equal(s.transactions.length, 4);
});

test('restoreBatch 按原位置放回，顺序与删除前一致', () => {
  const s = seeded();
  const before = s.transactions.map((t) => t.note);
  const ids = [s.transactions[0].id, s.transactions[2].id];

  const r = removeBatch(s, 'transactions', ids);
  const back = restoreBatch(r.state, 'transactions', r.removed);

  assert.equal(back.transactions.length, 4);
  assert.deepEqual(back.transactions.map((t) => t.note), before);
});

test('restoreBatch 乱序传入也按原位置恢复', () => {
  const s = seeded();
  const before = s.transactions.map((t) => t.note);

  const r = removeBatch(s, 'transactions', [s.transactions[3].id, s.transactions[1].id]);
  const back = restoreBatch(r.state, 'transactions', r.removed.slice().reverse());

  assert.deepEqual(back.transactions.map((t) => t.note), before);
});

test('removeBatch 对不存在的 id 什么都不做', () => {
  const s = seeded();
  const r = removeBatch(s, 'transactions', ['tx_不存在']);

  assert.equal(r.removed.length, 0);
  assert.equal(r.state.transactions.length, 4);
});

test('removeBatch 也能用于 scheduled（固定收支 / 分期）', () => {
  let s = createState();
  s = {
    ...s,
    scheduled: [
      { id: 'a', amount: 1 },
      { id: 'b', amount: 2 },
      { id: 'c', amount: 3 },
    ],
  };

  const r = removeBatch(s, 'scheduled', ['b']);
  assert.deepEqual(r.state.scheduled.map((x) => x.id), ['a', 'c']);

  const back = restoreBatch(r.state, 'scheduled', r.removed);
  assert.deepEqual(back.scheduled.map((x) => x.id), ['a', 'b', 'c']);
});

test('删光再全部恢复 = 原样', () => {
  const s = seeded();
  const before = s.transactions.map((t) => t.id);

  const r = removeBatch(s, 'transactions', before);
  assert.equal(r.state.transactions.length, 0);

  const back = restoreBatch(r.state, 'transactions', r.removed);
  assert.deepEqual(back.transactions.map((t) => t.id), before);
});

test('removeTransaction 仍是单笔删除（批量函数没有替换它）', () => {
  const s = seeded();
  const one = removeTransaction(s, s.transactions[2].id);
  assert.equal(one.transactions.length, 3);
  assert.deepEqual(one.transactions.map((t) => t.note), ['甲', '乙', '丁']);
});
