/**
 * LifeVein 模型：账户分域、每日余额、事件。
 *
 *   node --test nt/tests/lifevein-model.test.mjs
 *
 * 守的是口径（nt/LIFEVEIN-PAGE.md）：
 *   · 六条泳道按类型分；空类型（U 区）不进任何泳道；
 *   · 资产 / 负债是「存量」账户，按天算余额；收入 / 费用 / 成本不是；
 *   · 余额方向沿用 isDebitType：负债「转出」= 欠款增加；
 *   · 草稿不参与；缺端照常进事件（绝不自作主张跳过）；
 *   · 今天在账本中间时，时间轴要延伸到今天。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLifeVein, balanceAt, laneOfType, isStockType,
} from '../js/core/lifevein-model.js';

const ACC = [
  { id: 'opening', name: '期初', type: '权益类' },
  { id: 'salary', name: '工资', type: '收入类' },
  { id: 'card', name: '信用卡', type: '负债类' },
  { id: 'bank', name: '招行储', type: '资产类' },
  { id: 'food', name: '早餐', type: '费用类' },
  { id: 'pc', name: '电脑', type: '成本类' },
  { id: 'u', name: '未定', type: '' },
];

function tx(seq, date, from, to, amount, extra) {
  return { id: 't' + seq, seq, date, from_id: from, to_id: to, amount, ...extra };
}

const STATE = {
  accounts: ACC,
  transactions: [
    tx(1, '2026-11-01', 'opening', 'bank', 1000),
    tx(2, '2026-11-02', 'bank', 'food', 20),
    tx(3, '2026-11-02', 'card', 'food', 88),
    tx(4, '2026-11-03', 'bank', 'card', 40),
    tx(5, '2026-11-04', 'salary', 'bank', 8000),
    tx(6, '2026-11-05', 'bank', 'pc', 3000),
    tx(7, '2026-11-05', 'bank', 'food', 999, { status: 'draft' }),
  ],
};

test('laneOfType：3 轴 × 2 侧 = 6 个半列，空类型不画', () => {
  // lane = 轴 × 2 + (右侧 ? 1 : 0)：左轴 收入 0 / 权益 1，中轴 负债 2 / 资产 3，右轴 费用 4 / 成本 5
  assert.equal(laneOfType('收入类'), 0);
  assert.equal(laneOfType('权益类'), 1);
  assert.equal(laneOfType('负债类'), 2);
  assert.equal(laneOfType('资产类'), 3);
  assert.equal(laneOfType('费用类'), 4);
  assert.equal(laneOfType('成本类'), 5);
  assert.equal(laneOfType(''), -1);
  assert.equal(laneOfType(undefined), -1);
});

test('isStockType：只有资产 / 负债持有存量', () => {
  assert.equal(isStockType('资产类'), true);
  assert.equal(isStockType('负债类'), true);
  assert.equal(isStockType('收入类'), false);
  assert.equal(isStockType('费用类'), false);
  assert.equal(isStockType('成本类'), false);
});

test('时间轴：从最早流水到今天（今天在中间时也要延伸）', () => {
  const m = buildLifeVein(STATE, '2026-11-03');
  assert.equal(m.startIso, '2026-11-01');
  assert.equal(m.endIso, '2026-11-05');
  assert.equal(m.days, 5);
  assert.equal(m.todayDay, 2);
});

test('资产余额：转入加、转出减，按天铺开', () => {
  const m = buildLifeVein(STATE, '2026-11-03');
  const arr = m.stock.get('bank');
  assert.deepEqual(Array.from(arr), [1000, 980, 940, 8940, 5940]);
});

test('负债余额：转出（刷卡）= 欠款增加，转入（还款）= 减少', () => {
  const m = buildLifeVein(STATE, '2026-11-03');
  const arr = m.stock.get('card');
  assert.deepEqual(Array.from(arr), [0, 88, 48, 48, 48]);
});

test('balanceAt：浮点日按相邻两天插值', () => {
  const m = buildLifeVein(STATE, '2026-11-03');
  assert.equal(balanceAt(m, 'bank', 0), 1000);
  assert.equal(balanceAt(m, 'bank', 1), 980);
  assert.equal(balanceAt(m, 'bank', 1.5), 960);     // 980 → 940 的中点
  assert.equal(balanceAt(m, 'bank', -5), 1000);     // 夹到第一天
  assert.equal(balanceAt(m, 'bank', 99), 5940);     // 夹到最后一天
  assert.equal(balanceAt(m, 'nope', 3), 0);
});

test('草稿不进事件、不进余额', () => {
  const m = buildLifeVein(STATE, '2026-11-03');
  assert.equal(m.events.length, 6);                  // 7 条里去掉草稿那条
  assert.equal(m.txCount, 6);
  const arr = m.stock.get('bank');
  assert.equal(arr[4], 5940);                        // 没有减掉那 999
});

test('事件带两端的泳道：缺端 = -1，但照样进事件', () => {
  const state = {
    accounts: ACC,
    transactions: [tx(1, '2026-11-01', 'ghost', 'bank', 30)],
  };
  const m = buildLifeVein(state, '2026-11-01');
  assert.equal(m.events.length, 1);
  assert.equal(m.events[0].fromLane, -1);
  assert.equal(m.events[0].toLane, 3);
  assert.equal(m.events[0].amount, 30);
});

test('账户带泳道与同泳道槽位：两张卡不会挤在一个位置', () => {
  const state = {
    accounts: [...ACC, { id: 'card2', name: '中信卡', type: '负债类' }],
    transactions: [],
  };
  const m = buildLifeVein(state, '2026-11-01');
  const cards = m.accounts.filter((a) => a.lane === 2);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((a) => a.slot), [0, 1]);
});

test('空账本：一天、今天、没有泡', () => {
  const m = buildLifeVein({ accounts: [], transactions: [] }, '2026-11-08');
  assert.equal(m.days, 1);
  assert.equal(m.startIso, '2026-11-08');
  assert.equal(m.todayDay, 0);
  assert.equal(m.events.length, 0);
  assert.equal(m.stock.size, 0);
  assert.deepEqual(buildLifeVein(undefined, '2026-11-08').accounts, []);
});
