/**
 * 存储框架测试：ID 模型 / 改名不断链 / 余额 / 迁移 / 幂等。
 *
 *   node --test nt/tests/*.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createState, addAccount, addTransaction, updateAccount, updateTransaction,
  removeAccount, removeTransaction, nameOf, idOf, visibleAccounts,
  migrateOpeningToTransactions, nextSeq,
} from '../js/core/state-store.js';
import { balanceOf, balancesOf, balanceAsOf } from '../js/core/balance-calculator.js';
import { migrate } from '../js/core/migrate.js';
import {
  OPENING_ACCOUNT_ID, ACCOUNT_TYPE, SCHEMA_VERSION,
  createAccount, createTransaction, isDebitType,
} from '../js/core/schema.js';

/* ---------- 基础：造一本有小账的数据 ---------- */

function seed() {
  let s = createState();
  s = addAccount(s, { id: 'acc_bank', name: '交行储8380', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'acc_food', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '餐饮' });
  s = addAccount(s, { id: 'acc_card', name: '招行信', type: ACCOUNT_TYPE.LIABILITY, category: '信用卡' });
  s = addTransaction(s, { id: 'tx_1', date: '2026-08-03', from_id: 'acc_bank', to_id: 'acc_food', amount: 10230.27, note: '还信用卡' });
  return s;
}

test('schema：金额永远是正数，符号由类型决定', () => {
  const t = createTransaction({ amount: '-500', from_id: 'a', to_id: 'b' });
  assert.equal(t.amount, 500, '负数输入要被取绝对值');

  assert.equal(isDebitType(ACCOUNT_TYPE.ASSET), true);
  assert.equal(isDebitType(ACCOUNT_TYPE.LIABILITY), false);
  assert.equal(isDebitType(ACCOUNT_TYPE.EXPENSE), true);
});

test('余额：资产类转入增加、转出减少', () => {
  const s = seed();
  const bank = s.accounts.find((a) => a.id === 'acc_bank');
  const food = s.accounts.find((a) => a.id === 'acc_food');

  assert.equal(balanceOf(bank, s.transactions).balance, -10230.27);
  assert.equal(balanceOf(food, s.transactions).balance, 10230.27);
});

test('余额：负债类转出增加、转入减少', () => {
  let s = seed();
  s = addTransaction(s, { date: '2026-08-05', from_id: 'acc_card', to_id: 'acc_bank', amount: 500 });
  const card = s.accounts.find((a) => a.id === 'acc_card');
  // 负债类：转出 +500 → 欠款增加 500
  assert.equal(balanceOf(card, s.transactions).balance, 500);
});

test('★ 改名不断链：改账户名后，历史流水依然算得对', () => {
  const s = seed();
  const bank = s.accounts.find((a) => a.id === 'acc_bank');

  // 用户把「交行储8380」改成「交行卡」
  const renamed = updateAccount(s, 'acc_bank', { name: '交行卡' });
  const bank2 = renamed.accounts.find((a) => a.id === 'acc_bank');

  assert.equal(nameOf(renamed, 'acc_bank'), '交行卡');
  // 关键断言：余额与"用 ID 找"都还成立，改名没有产生任何断链
  assert.equal(balanceOf(bank2, renamed.transactions).balance, balanceOf(bank, s.transactions).balance);
  assert.equal(renamed.transactions[0].from_id, 'acc_bank');
  assert.equal(renamed.transactions[0].from, undefined, '流水里不许出现名字字段');
});

test('idOf / nameOf：名字与 ID 双向解析', () => {
  const s = seed();
  assert.equal(idOf(s, '餐饮'), 'acc_food');
  assert.equal(idOf(s, '不存在的账户'), null);
  assert.equal(nameOf(s, 'acc_food'), '餐饮');
  assert.equal(nameOf(s, '没有这个ID'), '', '查不到要给空串，不能给 undefined');
});

test('期初账户：isHidden，不出现在可见列表，但参与余额', () => {
  const s = createState();
  assert.equal(s.accounts.length, 1);
  assert.equal(s.accounts[0].id, OPENING_ACCOUNT_ID);
  assert.equal(visibleAccounts(s).length, 0, '期初账户不进 UI 列表');
});

test('期初迁移：账户 opening → 期初流水，余额不变且幂等', () => {
  let s = createState();
  s = addAccount(s, { id: 'acc_a', name: '现金', type: ACCOUNT_TYPE.ASSET });
  // 老数据里直接挂在账户上
  s.accounts = s.accounts.map((a) => (a.id === 'acc_a' ? { ...a, opening: 1000 } : a));

  const first = migrateOpeningToTransactions(s);
  assert.equal(first.added, 1);
  const cash = first.state.accounts.find((a) => a.id === 'acc_a');
  assert.equal(balanceOf(cash, first.state.transactions).balance, 1000);

  // 再跑一次不应重复生成
  const second = migrateOpeningToTransactions(first.state);
  assert.equal(second.added, 0);
  assert.equal(second.state.transactions.length, first.state.transactions.length);
});

test('删账户会连带删掉引用它的流水（不留断链）', () => {
  const s = seed();
  const after = removeAccount(s, 'acc_food');
  assert.equal(after.accounts.some((a) => a.id === 'acc_food'), false);
  assert.equal(after.transactions.length, 0, '引用被删账户的流水必须一起清掉');
});

test('期初虚拟账户不许删', () => {
  const s = createState();
  const after = removeAccount(s, OPENING_ACCOUNT_ID);
  assert.equal(after.accounts.length, 1);
});

test('state-store 全是纯函数：原状态不被修改', () => {
  const s = seed();
  const snapshot = JSON.stringify(s);
  addTransaction(s, { date: '2026-01-01', from_id: 'acc_bank', to_id: 'acc_food', amount: 1 });
  updateTransaction(s, 'tx_1', { amount: 99 });
  removeTransaction(s, 'tx_1');
  addAccount(s, { name: '新账户' });
  assert.equal(JSON.stringify(s), snapshot);
});

test('nextSeq 递增', () => {
  const s = seed();
  assert.equal(nextSeq(s), 2);
});

/* ---------- 迁移：v1 名字 → v2 ID ---------- */

const V1 = {
  version: 1,
  accounts: [
    { id: 'a1', cat: '资产类', sub: '储蓄', code: 'JHC', name: '交行储8380', opening: '1000' },
    { id: 'a2', cat: '费用类', sub: '餐饮', code: 'CY', name: '餐饮', opening: '0' },
  ],
  transactions: [
    { id: 't1', date: '2026-08-03', from: '交行储8380', to: '餐饮', amount: '128.50', note: '午饭', seq: 1 },
    { id: 't2', date: '2026-08-04', from: 'JHC', to: '餐饮', amount: '20', note: '简码引用', seq: 2 },
  ],
};

test('迁移 v1→v2：名字转成 ID，简化码也能解析', () => {
  const r = migrate(V1);
  assert.equal(r.state.version, SCHEMA_VERSION);

  const t1 = r.state.transactions.find((t) => t.id === 't1');
  const t2 = r.state.transactions.find((t) => t.id === 't2');
  assert.equal(t1.from_id, 'a1');
  assert.equal(t1.to_id, 'a2');
  assert.equal(t2.from_id, 'a1', '用简码 JHC 引用的也要解析成同一个 ID');
  assert.equal(t1.from, undefined, '迁移后不许再留名字字段');
});

test('迁移：账户 opening 变成期初流水，余额不变', () => {
  const r = migrate(V1);
  const opening = r.state.transactions.filter((t) => t.opening);
  assert.equal(opening.length, 1);
  assert.equal(opening[0].to_id, 'a1');
  assert.equal(opening[0].amount, 1000);

  const bank = r.state.accounts.find((a) => a.id === 'a1');
  // 期初 1000 + 转出 128.50 + 转出 20 = 851.50 的负数形式（资产类转出减少）
  assert.equal(balanceOf(bank, r.state.transactions).balance, 1000 - 128.5 - 20);
});

test('迁移幂等：跑两次结果一致，且第二次不再"迁移"', () => {
  const once = migrate(V1);
  const twice = migrate(once.state);
  assert.equal(twice.migrated, false);
  assert.deepEqual(
    twice.state.transactions.map((t) => t.id).sort(),
    once.state.transactions.map((t) => t.id).sort(),
  );
});

test('迁移后改名：历史流水仍然算得对（端到端）', () => {
  const r = migrate(V1);
  const before = balanceOf(r.state.accounts.find((a) => a.id === 'a1'), r.state.transactions).balance;

  const renamed = updateAccount(r.state, 'a1', { name: '交行卡' });
  const after = balanceOf(renamed.accounts.find((a) => a.id === 'a1'), renamed.transactions).balance;

  assert.equal(after, before, '改名不该影响一分钱');
});

test('迁移报告：断链条数会被统计出来', () => {
  const dirty = {
    version: 1,
    accounts: [{ id: 'a1', cat: '资产类', name: '现金' }],
    transactions: [{ id: 't1', date: '2026-01-01', from: '现金', to: '不存在的账户', amount: '5' }],
  };
  const r = migrate(dirty);
  assert.equal(r.stats.chainBroken, 1);
  const t = r.state.transactions[0];
  assert.equal(t.from_id, 'a1');
  assert.equal(t.to_id, null, '解析不到的对手方留 null，由校验层报 V3');
});

test('balanceAsOf：按日期切出的余额（过去/现在）', () => {
  const s = seed();
  const bank = s.accounts.find((a) => a.id === 'acc_bank');
  // 所有流水都在 2026-08-03
  assert.equal(balanceAsOf(bank, s.transactions, '2026-08-02').balance, 0);
  assert.equal(balanceAsOf(bank, s.transactions, '2026-08-03').balance, -10230.27);
});

test('balancesOf：不包含期初虚拟账户', () => {
  const s = seed();
  const rows = balancesOf(s.accounts, s.transactions);
  assert.equal(rows.some((r) => r.acc.id === OPENING_ACCOUNT_ID), false);
  assert.equal(rows.length, 3);
});

test('createAccount 会归一化非法类型', () => {
  const a = createAccount({ name: 'x', type: '乱七八糟' });
  assert.equal(a.type, ACCOUNT_TYPE.ASSET);
});
