// 分类统计：存量/流量两块的口径
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { categoryPanels } from '../js/core/ledger-stats.js';

const accounts = [
  { id: 'a', name: '储蓄卡', type: '资产类', category: '储蓄' },
  { id: 'z', name: '中转', type: '资产类', category: '其他' },
  { id: 'l', name: '信用卡', type: '负债类', category: '信用' },
  { id: 'i', name: '工资', type: '收入类', category: '工资' },
  { id: 'e', name: '餐饮', type: '费用类', category: '餐饮' },
];

const tx = (date, from_id, to_id, amount) => ({ date, from_id, to_id, amount });
const range = { start: '2026-02-01', end: '2026-02-28' };

const transactions = [
  // 储蓄卡：期初 1000，1 月支出 100 → 期初余额 900；2 月收入 500、支出 200 → 期末 1200
  tx('2026-01-01', 'opening', 'a', 1000),
  tx('2026-01-10', 'a', 'z', 100),
  tx('2026-02-05', 'z', 'a', 500),
  tx('2026-02-06', 'a', 'z', 200),
  // 负债：1 月欠 1000；2 月新增 200、还 50 → 正数欠款 1150
  tx('2026-01-11', 'l', 'z', 1000),
  tx('2026-02-10', 'l', 'z', 200),
  tx('2026-02-11', 'z', 'l', 50),
  // 收入：2 月收入 500、退回 20 → 净 480
  tx('2026-02-05', 'i', 'z', 500),
  tx('2026-02-12', 'z', 'i', 20),
  // 费用：2 月支出 200、退回 10 → 净 190
  tx('2026-02-06', 'z', 'e', 200),
  tx('2026-02-12', 'e', 'z', 10),
];

function panel(panels, kind, cat) {
  const group = panels[kind].find((g) => g.categories.some((c) => c.category === cat));
  return group && group.categories.find((c) => c.category === cat);
}

test('存量：资产期初 / 本期增减 / 期末', () => {
  const p = categoryPanels(accounts, transactions, range);
  const a = panel(p, 'stock', '储蓄');
  assert.equal(a.opening, 900);
  assert.equal(a.increase, 500);
  assert.equal(a.decrease, 200);
  assert.equal(a.end, 1200);
});

test('存量：负债显示正数欠款，借入增加、还款减少', () => {
  const p = categoryPanels(accounts, transactions, range);
  const l = panel(p, 'stock', '信用');
  assert.equal(l.opening, 1000);
  assert.equal(l.increase, 200);
  assert.equal(l.decrease, 50);
  assert.equal(l.end, 1150, '负债期末必须是正数欠款');
});

test('流量：收入按转出、费用按转入，净额都已扣退回', () => {
  const p = categoryPanels(accounts, transactions, range);
  const i = panel(p, 'flow', '工资');
  assert.equal(i.gross, 500);
  assert.equal(i.reverse, 20);
  assert.equal(i.net, 480);
  const e = panel(p, 'flow', '餐饮');
  assert.equal(e.gross, 200);
  assert.equal(e.reverse, 10);
  assert.equal(e.net, 190);
});

test('存量 / 流量分到左右两块，类型不串', () => {
  const p = categoryPanels(accounts, transactions, range);
  assert.ok(p.stock.some((g) => g.type === '资产类'));
  assert.ok(p.stock.some((g) => g.type === '负债类'));
  assert.ok(!p.stock.some((g) => g.type === '收入类' || g.type === '费用类'));
  assert.ok(p.flow.some((g) => g.type === '收入类'));
  assert.ok(p.flow.some((g) => g.type === '费用类'));
  assert.ok(!p.flow.some((g) => g.type === '资产类' || g.type === '负债类'));
});

test('类型合计与分类行同口径', () => {
  const p = categoryPanels(accounts, transactions, range);
  const assetGroup = p.stock.find((g) => g.type === '资产类');
  const sum = assetGroup.categories.reduce((n, c) => n + c.end, 0);
  assert.equal(assetGroup.total.end, sum);
  const flowGroup = p.flow.find((g) => g.type === '费用类');
  const net = flowGroup.categories.reduce((n, c) => n + c.net, 0);
  assert.equal(flowGroup.total.net, net);
});
