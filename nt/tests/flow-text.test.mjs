/**
 * 流水文本互转测试：导出再导入，账不变（这是编辑器能安全改数据的前提）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  transactionsToText, replaceTransactionsFromText, appendTransactionsFromText,
} from '../js/core/flow-text.js';
import { createState, addAccount, addTransaction } from '../js/core/state-store.js';
import { balanceOf } from '../js/core/balance-calculator.js';
import { ACCOUNT_TYPE } from '../js/core/schema.js';

function seed() {
  let s = createState();
  s = addAccount(s, { id: 'a1', code: 'ZHC', name: '招行储', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'a2', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '日常' });
  s = addTransaction(s, { date: '2026-08-20', from_id: 'a1', to_id: 'a2', amount: 128.5, note: '午饭', seq: 1 });
  s = addTransaction(s, { date: '2026-08-21', from_id: 'a2', to_id: 'a1', amount: 36, note: '早饭', seq: 2 });
  return s;
}

test('导出：每行一笔，Tab 分隔，日期是 6 位', () => {
  const txt = transactionsToText(seed());
  const lines = txt.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], '260820\t招行储\t餐饮\t128.5\t午饭');
  assert.equal(lines[1], '260821\t餐饮\t招行储\t36\t早饭');
});

test('★ 往返：导出再整体导入，余额一分不差', () => {
  const s = seed();
  const txt = transactionsToText(s);

  const bankBefore = balanceOf(s.accounts.find((a) => a.id === 'a1'), s.transactions).balance;
  const foodBefore = balanceOf(s.accounts.find((a) => a.id === 'a2'), s.transactions).balance;

  const r = replaceTransactionsFromText(s, txt);
  const bankAfter = balanceOf(r.state.accounts.find((a) => a.id === 'a1'), r.state.transactions).balance;
  const foodAfter = balanceOf(r.state.accounts.find((a) => a.id === 'a2'), r.state.transactions).balance;

  assert.equal(bankAfter, bankBefore, '招行储余额必须一致');
  assert.equal(foodAfter, foodBefore, '餐饮余额必须一致');
  assert.equal(r.added, 2);
  assert.equal(r.removed, 2);
  assert.equal(r.created.length, 0, '账户都认识，不该新建');
});

test('整体替换：删掉一行，流水就少一笔', () => {
  const s = seed();
  const txt = '260820\t招行储\t餐饮\t128.5\t午饭';
  const r = replaceTransactionsFromText(s, txt);
  assert.equal(r.state.transactions.length, 1);
  assert.equal(r.removed, 2);
});

test('整体替换：改金额，余额跟着变', () => {
  const s = seed();
  const txt = '260820\t招行储\t餐饮\t999\t午饭';
  const r = replaceTransactionsFromText(s, txt);
  const bank = r.state.accounts.find((a) => a.name === '招行储');
  assert.equal(balanceOf(bank, r.state.transactions).balance, -999);
});

test('整体替换：编辑器里出现新账户名字 → 自动建账户', () => {
  const s = seed();
  const txt = '260820\t招行储\t餐饮\t128.5\t午饭\n260822\t中信信\t餐饮\t300\t聚餐';
  const r = replaceTransactionsFromText(s, txt);

  assert.deepEqual(r.created, ['中信信']);
  const added = r.state.accounts.find((a) => a.name === '中信信');
  assert.ok(added, '新账户要建出来');
  assert.equal(added.type, '资产类', '默认资产类');
  assert.ok(added.code.length >= 2, '简码要自动生成');
});

test('追加：不动旧流水，只往后加', () => {
  const s = seed();
  const txt = '260822\t招行储\t餐饮\t50\t加餐';
  const r = appendTransactionsFromText(s, txt);
  assert.equal(r.state.transactions.length, 3);
  assert.equal(r.removed, 0);
  assert.equal(s.transactions.length, 2, '原 state 不能被改');
});

test('行序会被保留（编辑器里第几行就是第几笔）', () => {
  const s = seed();
  const txt = '260825\t招行储\t餐饮\t1\t第三\n260826\t招行储\t餐饮\t2\t第四';
  const r = replaceTransactionsFromText(s, txt);
  const seqs = r.state.transactions.map((t) => t.seq);
  assert.deepEqual(seqs, [1, 2]);
  assert.equal(r.state.transactions[0].note, '第三');
});

test('空文本 → 清空全部流水（但账户留着）', () => {
  const s = seed();
  const r = replaceTransactionsFromText(s, '');
  assert.equal(r.state.transactions.length, 0);
  assert.equal(r.state.accounts.length, s.accounts.length, '账户不该被删');
});

test('有错行时，errors 要带回来（由 UI 决定是否拦）', () => {
  const s = seed();
  const txt = '260820\t招行储\t餐饮\t128.5\t午饭\n这不是一行\t\t\t';
  const r = replaceTransactionsFromText(s, txt);
  assert.equal(r.added, 1);
  assert.equal(r.errors.length, 1);
});

test('纯函数：不修改传入的 state', () => {
  const s = seed();
  const snap = JSON.stringify(s);
  replaceTransactionsFromText(s, '260820\t招行储\t餐饮\t1\tx');
  appendTransactionsFromText(s, '260821\t招行储\t餐饮\t2\ty');
  assert.equal(JSON.stringify(s), snap);
});
