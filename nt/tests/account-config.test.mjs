/**
 * 账户配置导入导出测试。
 *
 * 核心约束：**导入不删账户**（删除会连带删流水，不能由文本导入悄悄做）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { accountsToText, applyAccountsText, ACCOUNT_HEADER } from '../js/core/account-config.js';
import { createState, addAccount, addTransaction } from '../js/core/state-store.js';
import { balanceOf } from '../js/core/balance-calculator.js';
import { ACCOUNT_TYPE } from '../js/core/schema.js';

function seed() {
  let s = createState();
  s = addAccount(s, { id: 'a1', code: 'XJ', name: '现金', type: ACCOUNT_TYPE.ASSET, category: '现金' });
  s = addAccount(s, { id: 'a2', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '日常' });
  s = addTransaction(s, {
    date: '2000-01-01', from_id: '__OPENING__', to_id: 'a1',
    amount: 500, note: '期初', opening: true, seq: 0,
  });
  s = addTransaction(s, { date: '2026-08-20', from_id: 'a1', to_id: 'a2', amount: 3.5, note: '午饭', seq: 1 });
  return s;
}

test('★ 导出只含账户段，不含流水', () => {
  const text = accountsToText(seed());
  assert.ok(text.includes('账户：'), '应有账户段');
  assert.ok(text.includes(ACCOUNT_HEADER), '应有表头');
  assert.ok(text.includes('现金'), '应含账户');
  assert.ok(!text.includes('流水：'), '不该出现流水段');
  assert.ok(!text.includes('午饭'), '不该出现流水备注');
});

test('头部注释齐全且以 # 开头', () => {
  const text = accountsToText(seed());
  const head = text.split('\n').filter((l) => l.startsWith('#'));
  assert.ok(head.length >= 3, '至少三行说明，实际 ' + head.length);
});

test('withHeader:false 时没有注释', () => {
  const text = accountsToText(seed(), { withHeader: false });
  assert.ok(!text.includes('#'), '不该有注释行');
  assert.ok(text.startsWith('账户：'));
});

test('★ 往返：导出再导入，账户数量不变', () => {
  const st = seed();
  const text = accountsToText(st);
  const r = applyAccountsText(st, text);

  const before = st.accounts.length;
  const after = r.state.accounts.length;
  assert.equal(after, before, '账户数应不变');
  assert.equal(r.added, 0, '不该新增');
});

test('★ 导入不删除账户（只在文本里少写几个也一样）', () => {
  const st = seed();
  // 只写一个账户
  const r = applyAccountsText(st, '账户：\n' + ACCOUNT_HEADER + '\n资产类，现金，XJ，现金，500，，，');
  assert.equal(r.state.accounts.length, st.accounts.length, '不许删账户');
});

test('★ 改类型会生效（收入类 → 资产类）', () => {
  const st = seed();
  const r = applyAccountsText(st, '账户：\n' + ACCOUNT_HEADER + '\n资产类，现金，XJ，现金，500，，，\n收入类，日常，CY，餐饮，，，');
  const cy = r.state.accounts.find((a) => a.name === '餐饮');
  assert.equal(cy.type, '收入类');
  assert.ok(r.updated >= 1, '应计入更新，实际 ' + r.updated);
});

test('★ 改期初会换掉原来的 opening 流水', () => {
  const st = seed();
  const r = applyAccountsText(st, '账户：\n' + ACCOUNT_HEADER + '\n资产类，现金，XJ，现金，888，，，');

  const openings = r.state.transactions.filter((t) => t.opening && t.to_id === 'a1');
  assert.equal(openings.length, 1, '同一账户只该有一条期初');
  assert.equal(openings[0].amount, 888);

  const cash = r.state.accounts.find((a) => a.name === '现金');
  // 期初 888 - 花掉 3.5（那笔午饭还在）
  assert.equal(balanceOf(cash, r.state.transactions).balance, 884.5);
});

test('★ 期初留空时不动原有期初（空=不改）', () => {
  const st = seed();
  // 期初留空 → 不写 opening，但原期初仍在（设计如此：空=不改）
  const r = applyAccountsText(st, '账户：\n' + ACCOUNT_HEADER + '\n资产类，现金，XJ，现金，，，，');
  const openings = r.state.transactions.filter((t) => t.opening && t.to_id === 'a1');
  assert.equal(openings.length, 1, '留空不改期初');
});

test('新账户会被加进来', () => {
  const st = seed();
  const r = applyAccountsText(st,
    '账户：\n' + ACCOUNT_HEADER + '\n负债类，信用，ZXX，招商信用卡，1500，，，');
  assert.equal(r.added, 1);
  assert.ok(r.state.accounts.some((a) => a.name === '招商信用卡'));
});

test('坏行不影响其它行', () => {
  const st = seed();
  const r = applyAccountsText(st,
    '账户：\n' + ACCOUNT_HEADER + '\n乱写类，x，BAD，坏账户，，，\n资产类，现金，XJ，现金，500，，，');
  assert.ok(r.errors.length >= 1, '应有错误');
  assert.ok(r.state.accounts.some((a) => a.name === '现金'));
  assert.ok(!r.state.accounts.some((a) => a.name === '坏账户'));
});

test('纯函数：不改传入的 state', () => {
  const st = seed();
  const snap = JSON.stringify(st);
  applyAccountsText(st, accountsToText(st));
  assert.equal(JSON.stringify(st), snap);
});
