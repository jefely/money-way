/**
 * LifeVein 页的中域气泡模型（core/lifevein-model.js）。
 *
 *   node --test nt/tests/lifevein-model.test.mjs
 *
 * 守的是口径（nt/LIFEVEIN-PAGE.md）：
 *   · 只有一端是中域（资产 / 负债）才出泡，两端都不是就不出；
 *   · 泡的方向：中域是转出方 = out，是转入方 = in，两端都中域 = transfer；
 *   · 余额是「这笔之后」的余额，借贷方向按 isDebitType（负债转出=欠款增加）；
 *   · 草稿不出泡、不进余额；缺端照出（项目裁决：绝不自动跳过）；
 *   · 收入 / 支出按净额（退回会减回去），转账与还款不影响合计。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLifeVein, isMiddleType } from '../js/core/lifevein-model.js';

const ACCOUNTS = [
  { id: 'opening', name: '期初余额', type: '权益类', isHidden: true },
  { id: 'bank', name: '招行储', type: '资产类' },
  { id: 'cash', name: '现金', type: '资产类' },
  { id: 'card', name: '信用卡', type: '负债类' },
  { id: 'food', name: '早餐', type: '费用类' },
  { id: 'salary', name: '工资', type: '收入类' },
];

/** 一条流水：日期 + 序号 + 两端 + 金额 */
function tx(seq, date, from, to, amount, extra) {
  return { id: 't' + seq, seq, date, from_id: from, to_id: to, amount, ...extra };
}

const STATE = {
  accounts: ACCOUNTS,
  transactions: [
    tx(1, '2026-11-01', 'salary', 'bank', 10000),
    tx(2, '2026-11-02', 'bank', 'food', 20),
    tx(3, '2026-11-03', 'bank', 'cash', 500),
    tx(4, '2026-11-04', 'cash', 'card', 300),
    tx(5, '2026-11-05', 'bank', 'food', 50, { status: 'draft' }),
    tx(6, '2026-11-06', 'food', 'bank', 5),
  ],
};

test('isMiddleType：只有资产 / 负债算中域', () => {
  assert.equal(isMiddleType('资产类'), true);
  assert.equal(isMiddleType('负债类'), true);
  assert.equal(isMiddleType('费用类'), false);
  assert.equal(isMiddleType('收入类'), false);
  assert.equal(isMiddleType(''), false);
});

test('一条流水一个泡：方向、节点、余额', () => {
  const { rows } = buildLifeVein(STATE);
  assert.equal(rows.length, 5);          // 草稿那条不出泡
  assert.deepEqual(rows.map((r) => r.dir), ['in', 'out', 'transfer', 'transfer', 'in']);
  assert.deepEqual(rows.map((r) => r.nodeName), ['招行储', '招行储', '招行储', '现金', '招行储']);
  // 工资 → 招行储：泡在招行储，余额 = 10000
  assert.equal(rows[0].balance, 10000);
  assert.equal(rows[0].otherName, '工资');
  // 招行储 → 早餐 20
  assert.equal(rows[1].balance, 9980);
  // 招行储 → 现金 500（两端都中域 = 转账，泡记在转出方）
  assert.equal(rows[2].balance, 9480);
  assert.equal(rows[2].otherName, '现金');
  // 现金 → 信用卡 300（还款也是转账）
  assert.equal(rows[3].balance, 200);
  // 早餐 → 招行储 5（退款）：钱回到资产
  assert.equal(rows[4].balance, 9485);
});

test('负债余额：转出是欠款增加，转入（还款）是减少', () => {
  const state = {
    accounts: ACCOUNTS,
    transactions: [
      tx(1, '2026-11-01', 'card', 'food', 88),                    // 消费：负债转出，欠款 +88
      tx(2, '2026-11-02', 'card', 'food', 12),                    // 再消费，欠款 100
      tx(3, '2026-11-03', 'opening', 'bank', 1000, { opening: true }),
      tx(4, '2026-11-04', 'bank', 'card', 40),                    // 还款：两端都中域
    ],
  };
  const { rows } = buildLifeVein(state);
  assert.equal(rows[0].balance, 88);
  assert.equal(rows[1].balance, 100);
  // 还款那笔泡记在转出方（银行），余额 1000 − 40
  assert.equal(rows[3].dir, 'transfer');
  assert.equal(rows[3].nodeName, '招行储');
  assert.equal(rows[3].balance, 960);
  // 而信用卡这一笔之后的欠款 = 60：正好由 otherBalance 给出
  assert.equal(rows[3].otherBalance, 60);
});

test('合计按净额：收入 − 支出，转账不算', () => {
  const { totals } = buildLifeVein(STATE);
  assert.equal(totals.income, 10000);
  assert.equal(totals.expense, 15);      // 20 花掉 − 5 退回
  assert.equal(totals.net, 9985);
  assert.equal(totals.count, 5);
});

test('两端都不是中域的流水不出泡、不进合计', () => {
  const state = {
    accounts: ACCOUNTS,
    transactions: [tx(1, '2026-11-01', 'salary', 'food', 100)],
  };
  const { rows, totals } = buildLifeVein(state);
  assert.equal(rows.length, 0);
  assert.equal(totals.expense, 100);   // 合计照算，只是没有中域气泡
});

test('草稿不全：不进余额、不出泡', () => {
  const state = {
    accounts: ACCOUNTS,
    transactions: [
      tx(1, '2026-11-01', 'salary', 'bank', 100),
      tx(2, '2026-11-02', 'bank', 'food', 999, { status: 'draft' }),
    ],
  };
  const { rows } = buildLifeVein(state);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].balance, 100);
});

test('缺端照出泡（绝不自动跳过），另一端名字留空', () => {
  const state = {
    accounts: ACCOUNTS,
    transactions: [tx(1, '2026-11-01', 'ghost', 'bank', 30)],
  };
  const { rows } = buildLifeVein(state);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dir, 'in');
  assert.equal(rows[0].nodeName, '招行储');
  assert.equal(rows[0].otherName, '');
});

test('期初流水照出，但标 isOpening', () => {
  const state = {
    accounts: ACCOUNTS,
    transactions: [tx(1, '2026-10-31', 'opening', 'bank', 1000, { opening: true })],
  };
  const { rows } = buildLifeVein(state);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].isOpening, true);
  assert.equal(rows[0].balance, 1000);
});

test('排序：日期升序，同一天按 seq', () => {
  const state = {
    accounts: ACCOUNTS,
    transactions: [
      tx(2, '2026-11-02', 'bank', 'food', 2),
      tx(1, '2026-11-02', 'bank', 'food', 1),
      tx(3, '2026-11-01', 'bank', 'food', 3),
    ],
  };
  const { rows } = buildLifeVein(state);
  assert.deepEqual(rows.map((r) => r.amount), [3, 1, 2]);
});

test('空账本不炸', () => {
  const { rows, totals, span } = buildLifeVein({ accounts: [], transactions: [] });
  assert.deepEqual(rows, []);
  assert.equal(totals.count, 0);
  assert.deepEqual(span, { from: '', to: '' });
  assert.deepEqual(buildLifeVein(undefined).rows, []);
});
