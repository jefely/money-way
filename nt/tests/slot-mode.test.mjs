/**
 * 环图的两套粒度模式（用户 2026-11 定）。
 *
 *   node --test nt/tests/slot-mode.test.mjs
 *
 * 模式 0（count，默认）：一笔流水占 2 个单位，每单位等角
 *        单位角 = (360 − 分类数 × 0.8) / (流水笔数 × 2)
 * 模式 1（amount）      ：**分类之间均分一圈**，分类内按**净额**占比分
 *        节点角 = 可用角/组数 × (|节点净额| ÷ 组内净额绝对值之和)
 *        净额 = 转入 − 转出（余额变动），不是收付合计
 *
 * 净额为 0 的中转账户留一条细弧，不再从环上消失。
 * 整个类型净额都是 0 时，这一段在类型内部均分。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeSlots, GAP_DEG } from '../js/graph/mw-slot-calculator.js';

const ACCOUNTS = [
  { id: 'a_salary', code: 'GZ', name: '工资', type: '收入类', category: '薪金' },
  { id: 'a_bank', code: 'ZHC', name: '招行储', type: '资产类', category: '储蓄' },
  { id: 'a_bank2', code: 'ZFB', name: '支付宝储物', type: '资产类', category: '储蓄' },
  { id: 'a_food', code: 'CY', name: '餐饮', type: '费用类', category: '餐饮' },
  { id: 'a_cash', code: 'XJ', name: '现金', type: '资产类', category: '现金' },
];

const byId = new Map(ACCOUNTS.map((a) => [a.id, a]));
const accOf = (id) => byId.get(id) || null;

function tx(from, to, amount = 100, date = '2026-08-01') {
  return { from_id: from, to_id: to, amount, date };
}

/**
 * 净额：工资 −1500 · 招行储 +600 · 支付宝储 +400 · 餐饮 +500
 * 三个分类：收入类|薪金 1500 · 资产类|储蓄 1000 · 费用类|餐饮 500
 */
const SAMPLE = [
  tx('a_salary', 'a_bank', 1000),
  tx('a_salary', 'a_bank2', 500),
  tx('a_bank', 'a_food', 400),
  tx('a_bank2', 'a_food', 100),
];

const spanOf = (r, id) => r.slots
  .filter((s) => s.acc === id)
  .reduce((sum, s) => sum + s.span, 0);

test('笔数粒度（模式0）：每个槽位角度相同', () => {
  const r = computeSlots(SAMPLE, { accOf, outerRadius: 640 });
  assert.equal(r.mode, 'count');
  const spans = new Set(r.slots.map((s) => Math.round(s.span * 1e9) / 1e9));
  assert.equal(spans.size, 1, '笔数模式下所有槽位等角');
});

test('★★ 金额粒度（模式1）：六大类型均分（只分出现过的），类型内按净额占比', () => {
  const r = computeSlots(SAMPLE, { accOf, outerRadius: 640, unitMode: 1 });
  assert.equal(r.mode, 'amount');

  // 只出现三类：收入类 / 资产类 / 费用类
  const types = [...new Set(r.slots.filter((s) => s.acc).map((s) => s.type))];
  assert.equal(types.length, 3);

  const availRad = (360 - types.length * GAP_DEG) * (Math.PI / 180);
  const typeRad = availRad / types.length;

  // 每类里只有一个账户 → 占满自己那一份
  assert.ok(Math.abs(spanOf(r, 'a_salary') - typeRad) < 1e-9, '工资：收入类唯一账户');
  assert.ok(Math.abs(spanOf(r, 'a_food') - typeRad) < 1e-9, '餐饮：费用类唯一账户');

  // 资产类有两个账户，按净额 600 : 400 = 3 : 2 分这一份
  assert.ok(Math.abs(spanOf(r, 'a_bank') - typeRad * 0.6) < 1e-9, '招行储 600/1000');
  assert.ok(Math.abs(spanOf(r, 'a_bank2') - typeRad * 0.4) < 1e-9, '支付宝储 400/1000');

  // 整圈把可用角用满
  const used = r.slots.reduce((sum, s) => sum + s.span, 0);
  assert.ok(Math.abs(used - availRad) < 1e-9, '可用角必须刚好用满');

  // 量纲护栏：单个槽位不许超过一整圈，整圈不许超过 2π
  assert.ok(r.slots.every((s) => s.span >= 0 && s.span < Math.PI * 2), '单个槽位跨过一整圈');
  assert.ok(used <= Math.PI * 2 + 1e-9, '整圈超过 2π');
});

test('★ 金额粒度：只出现一类就占整圈，两类各占一半', () => {
  // 只有资产类（招行储 ↔ 支付宝储物）
  const one = computeSlots([tx('a_bank', 'a_bank2', 100)], { accOf, outerRadius: 640, unitMode: 1 });
  assert.equal(one.mode, 'amount');
  const oneUsed = one.slots.reduce((sum, s) => sum + s.span, 0);
  assert.ok(Math.abs(oneUsed - (360 - GAP_DEG) * (Math.PI / 180)) < 1e-9, '一类 = 整圈');

  // 资产类 + 费用类
  const two = computeSlots([tx('a_bank', 'a_food', 100)], { accOf, outerRadius: 640, unitMode: 1 });
  const types2 = [...new Set(two.slots.filter((s) => s.acc).map((s) => s.type))];
  assert.equal(types2.length, 2);
  const each = two.slots.reduce((sum, s) => sum + s.span, 0) / 2;
  assert.ok(Math.abs(each - (360 - 2 * GAP_DEG) * (Math.PI / 180) / 2) < 1e-9, '两类 = 各一半');
});

test('★ 金额粒度：净额为 0 的中转账户仍留一条细弧', () => {
  // 现金转入 100 又转出 100 → 净额 0
  const txs = [tx('a_bank', 'a_cash', 100), tx('a_cash', 'a_food', 100)];
  const r = computeSlots(txs, { accOf, outerRadius: 640, unitMode: 1 });
  assert.equal(r.mode, 'amount');
  assert.ok(spanOf(r, 'a_cash') > 0.01, '净额 0 也要看得见');
  assert.ok(spanOf(r, 'a_cash') < spanOf(r, 'a_bank'), '细弧比有净额的账户窄');
  assert.ok(spanOf(r, 'a_bank') > 0, '银行卡净额 −100，仍有弧段');
  assert.ok(spanOf(r, 'a_food') > 0, '餐饮净额 +100，仍有弧段');
  const types = [...new Set(r.slots.filter((s) => s.acc).map((s) => s.type))];
  const avail = (360 - types.length * GAP_DEG) * (Math.PI / 180);
  const used = r.slots.reduce((sum, s) => sum + s.span, 0);
  assert.ok(Math.abs(used - avail) < 1e-6, '细弧占的是类型内部的角度，整圈仍然铺满');
});

test('金额粒度：全部净额为 0 时退回笔数模式，不会把整圈压成 0', () => {
  const txs = [tx('a_bank', 'a_cash', 100), tx('a_cash', 'a_bank', 100)];
  const r = computeSlots(txs, { accOf, outerRadius: 640, unitMode: 1 });
  assert.equal(r.mode, 'count', '净额全 0，实际落回 count');
  assert.ok(r.slots.every((s) => s.span > 0));
});

test('金额粒度：整个类型净额为 0 时，类型内部均分，账户仍可见', () => {
  // 资产类里的两个账户互相转账（钱进来又原样出去）→ 该类型净额全 0
  const txs = [
    tx('a_bank', 'a_bank2', 100),
    tx('a_bank2', 'a_bank', 100),
    tx('a_salary', 'a_food', 500),
  ];
  const r = computeSlots(txs, { accOf, outerRadius: 640, unitMode: 1 });
  assert.equal(r.mode, 'amount');
  assert.ok(spanOf(r, 'a_bank') > 0.01, '资产类不再整段留空');
  assert.ok(Math.abs(spanOf(r, 'a_bank') - spanOf(r, 'a_bank2')) < 1e-6, '同类型净额都是 0 时均分');
  assert.ok(spanOf(r, 'a_salary') > 0, '收入类照常');
  assert.ok(spanOf(r, 'a_food') > 0, '费用类照常');
});

test('金额粒度：各段首尾相接，相邻槽位不会重叠或留空洞', () => {
  const r = computeSlots(SAMPLE, { accOf, outerRadius: 640, unitMode: 1 });
  for (let i = 1; i < r.slots.length; i++) {
    const gap = r.slots[i].a1 - r.slots[i - 1].a2;
    assert.ok(gap >= -1e-12, `第 ${i} 段与前一段重叠了`);
    assert.ok(gap < 1e-9 || gap >= (GAP_DEG * Math.PI) / 180 - 1e-12, '只允许差一个组间缝');
  }
});

test('两种模式的分组与颜色完全一致（只有弧长变）', () => {
  const a = computeSlots(SAMPLE, { accOf, outerRadius: 640 });
  const b = computeSlots(SAMPLE, { accOf, outerRadius: 640, unitMode: 1 });

  assert.deepEqual(a.groupList.map((g) => g.key), b.groupList.map((g) => g.key));
  assert.deepEqual(a.colorList, b.colorList);
  assert.deepEqual(a.slots.map((s) => s.sortKey), b.slots.map((s) => s.sortKey));
});
