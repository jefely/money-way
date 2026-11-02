/**
 * 事件引擎 —— 事实层验收（造 / 校验 / 改 / 合并）。
 *
 *   node --test nt/tests/event-engine.test.mjs
 *
 * 这里只验「事实怎么成立」；余额、双式恒等、实物台账在 calc-engine.test.mjs。
 * 核心一条：事件只增不改，要改就开一条逆向事件。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENT_STATUS,
  NODE_NATURE,
  createEvent,
  createNode,
  mergeNode,
  polarityOfType,
  postEvent,
  reverseEvent,
  splitEvent,
  unallocatedOf,
  validateEvent,
  voidEvent,
} from '../js/core/event-engine.js';

import { balanceOfNode, computeBalances } from '../js/core/calc-engine.js';
import { isDebitType } from '../js/core/schema.js';

const posted = (patch) => createEvent({ status: EVENT_STATUS.POSTED, ...patch });

/** 场景 ① 用的节点底座 */
function bankNodes() {
  return [
    createNode({ id: 'bank', name: '储蓄卡', type: '资产类', category: '储蓄' }),
    createNode({ id: 'food', name: '食品', type: '费用类', category: '餐饮' }),
    createNode({ id: 'daily', name: '日用', type: '费用类', category: '日常' }),
    createNode({ id: 'misc', name: '其它', type: '费用类', category: '日常' }),
  ];
}

/* ============ 场景 ①：超市 500 拆三份 ============ */

test('场景① 超市 500 拆三份：一条事件、三条连线、合计对齐', () => {
  const nodes = bankNodes();
  const base = createEvent({ id: 'ev-market', date: '2026-11-01', amount: 500, note: '超市采购' });
  const ev = splitEvent(base, [
    { to: 'food', amount: 300 },
    { to: 'daily', amount: 150 },
    { to: 'misc', amount: 50 },
  ], { from: 'bank' });

  // 拆之前是 RAW（半成品），拆完要显式入账，引擎不替你决定
  assert.equal(base.status, EVENT_STATUS.RAW);
  assert.equal(base.links.length, 0);
  assert.equal(unallocatedOf(base), 500);
  assert.equal(unallocatedOf(ev), 0);

  const p = postEvent(ev, []);
  const r = validateEvent(p, nodes);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.total, 500);
  assert.equal(p.links.length, 3);

  // 银行卡是 A 极：转出 500 → 余额 −500
  assert.equal(balanceOfNode(nodes[0], [p]).balance, -500);
  assert.equal(balanceOfNode(nodes[1], [p]).balance, 300);
  assert.equal(balanceOfNode(nodes[2], [p]).balance, 150);
  assert.equal(balanceOfNode(nodes[3], [p]).balance, 50);
});

test('场景① 少分 50 会被抓成 E_UNALLOCATED，不允许静默通过', () => {
  const nodes = bankNodes();
  const ev = splitEvent(posted({ id: 'ev-bad', date: '2026-11-01', amount: 500 }), [
    { to: 'food', amount: 300 },
    { to: 'daily', amount: 150 },
  ], { from: 'bank' });

  const r = validateEvent(ev, nodes);
  assert.equal(r.ok, false);
  assert.equal(r.problems.some((x) => x.code === 'E_UNALLOCATED'), true);
  assert.equal(r.unallocated, 50);
});

/* ============ 事实不可篡改：退款 / 作废 ============ */

test('退款：生成逆向事件，原事件一个字都不动', () => {
  const nodes = bankNodes();
  const buy = posted({ id: 'ev-buy', date: '2026-11-02', amount: 100, links: [{ from: 'bank', to: 'food', amount: 100 }] });
  const snapshot = JSON.stringify(buy);

  const refund = reverseEvent(buy, { id: 'ev-refund', date: '2026-11-04' });
  assert.equal(refund.reverses, 'ev-buy');
  assert.equal(refund.links[0].from, 'food');
  assert.equal(refund.links[0].to, 'bank');
  assert.equal(refund.amount, 100);
  assert.equal(JSON.stringify(buy), snapshot, '原事件被改动了');

  const events = [buy, refund];
  assert.equal(balanceOfNode(nodes[1], events).balance, 0);
  assert.equal(balanceOfNode(nodes[0], events).balance, 0);
});

test('作废：只改状态，连线和金额保留', () => {
  const ev = posted({ id: 'ev-void', date: '2026-11-02', amount: 30, links: [{ from: 'bank', to: 'food', amount: 30 }] });
  const dead = voidEvent(ev, '录错了');

  assert.equal(dead.status, EVENT_STATUS.VOID);
  assert.equal(dead.links.length, 1);
  assert.equal(dead.amount, 30);
  assert.equal(ev.status, EVENT_STATUS.POSTED, '原对象不该被改');

  const nodes = bankNodes();
  assert.equal(balanceOfNode(nodes[0], [dead]).balance, 0, 'VOID 不参与计算');
});

/* ============ 缓冲池：备注即缓冲 ============ */

test('RAW 缓冲池：没归类之前不参与任何计算', () => {
  const nodes = bankNodes();
  const raw = createEvent({ id: 'ev-raw', date: '2026-11-01', amount: 25, rawText: '咖啡' });

  assert.equal(raw.status, EVENT_STATUS.RAW);
  assert.equal(raw.links.length, 0);
  assert.equal(raw.note, '');
  for (const node of nodes) assert.equal(balanceOfNode(node, [raw]).balance, 0, node.name);

  const p = postEvent(raw, [{ from: 'bank', to: 'food', amount: 25 }]);
  assert.equal(validateEvent(p, nodes).ok, true);
  assert.equal(balanceOfNode(nodes[1], [p]).balance, 25);
  assert.equal(balanceOfNode(nodes[0], [p]).balance, -25);
});

/* ============ 幽灵重定向：合并节点不改历史 ============ */

test('合并节点：历史流水指向旧 ID，计算时自动重定向', () => {
  const nodes = [
    createNode({ id: 'bank', name: '储蓄卡', type: '资产类' }),
    createNode({ id: 'food-old', name: '吃饭', type: '费用类' }),
    createNode({ id: 'food-new', name: '餐饮', type: '费用类' }),
  ];
  const ev = posted({ id: 'ev-1', date: '2026-11-01', amount: 200, links: [{ from: 'bank', to: 'food-old', amount: 200 }] });
  const snapshot = JSON.stringify(ev);

  const merged = mergeNode(nodes, 'food-old', 'food-new');
  assert.equal(JSON.stringify(ev), snapshot, '合并不能改流水');

  const byId = new Map(merged.map((n) => [n.id, n]));
  // 旧 ID 自己那一行必须是 0：钱已经算到新节点头上，不能再记一次
  const rows = computeBalances(merged, [ev]).rows;
  assert.equal(rows.get('food-old').balance, 0);
  assert.equal(rows.get('food-new').balance, 200);
  // 但按旧 ID 去查，应该查到新节点的余额 —— 这正是「重定向」的意思
  assert.equal(balanceOfNode(byId.get('food-old'), [ev], merged).balance, 200);
  assert.equal(byId.get('food-old').isHidden, true);
});

test('合并成环：环上节点收敛到同一个代表，不会无限循环', () => {
  const nodes = [
    createNode({ id: 'a', name: 'A', type: '费用类' }),
    createNode({ id: 'b', name: 'B', type: '费用类' }),
  ];
  const loop = mergeNode(mergeNode(nodes, 'a', 'b'), 'b', 'a');

  const ev = posted({ id: 'e', date: '2026-11-01', amount: 10, links: [{ from: 'a', to: 'b', amount: 10 }] });
  const rows = computeBalances(loop, [ev]).rows;
  assert.equal(rows.get('a').balance + rows.get('b').balance, 0, '环上两边不会各记一次');
  assert.equal(validateEvent(ev, loop).problems.some((p) => p.code === 'E_SELF_LINK'), true);
});

/* ============ 拒绝路径 ============ */

test('校验拒绝：自环 / 未知节点 / 零额 / 坏日期 / 已入账却没有连线', () => {
  const nodes = bankNodes();
  const codes = (ev) => validateEvent(ev, nodes).problems.map((p) => p.code);

  assert.equal(codes(posted({ id: 'e1', date: '2026-11-01', amount: 10, links: [{ from: 'bank', to: 'bank', amount: 10 }] })).includes('E_SELF_LINK'), true);
  assert.equal(codes(posted({ id: 'e2', date: '2026-11-01', amount: 10, links: [{ from: 'bank', to: 'nope', amount: 10 }] })).includes('E_UNKNOWN_NODE'), true);
  assert.equal(codes(createEvent({ id: 'e3', date: '2026-11-01', amount: 0 })).includes('E_BAD_AMOUNT'), true);
  assert.equal(codes(createEvent({ id: 'e4', date: '2026-02-31', amount: 10 })).includes('E_BAD_DATE'), true);
  assert.equal(codes(posted({ id: 'e5', date: '2026-11-01', amount: 10 })).includes('E_NO_LINKS'), true);

  // 负额被 createLink 取绝对值归正，方向由 from/to 表达 —— 不报错是设计
  const neg = posted({ id: 'e6', date: '2026-11-01', amount: 10, links: [{ from: 'bank', to: 'food', amount: -10 }] });
  assert.equal(neg.links[0].amount, 10);
});

/* ============ 极性：六类型 → 一个布尔 ============ */

test('polarityOfType 与 schema 的 DEBIT_TYPES 同源', () => {
  assert.equal(polarityOfType('资产类'), true);
  assert.equal(polarityOfType('费用类'), true);
  assert.equal(polarityOfType('成本类'), true);
  assert.equal(polarityOfType('负债类'), false);
  assert.equal(polarityOfType('权益类'), false);
  assert.equal(polarityOfType('收入类'), false);
  for (const t of ['资产类', '负债类', '权益类', '收入类', '费用类', '成本类']) {
    assert.equal(polarityOfType(t), isDebitType(t), t);
  }
  // 空类型与 createAccount 的默认值（资产类）一致
  assert.equal(polarityOfType(''), true);
});

test('成本类 = 实物成本池：选了类型就自动是 physical，A 极', () => {
  const pc = createNode({ id: 'pc', name: '电脑', type: '成本类', originalCost: 10000 });
  assert.equal(pc.polarity, true, '成本类是 A 极（借增贷减，与资产同向）');
  assert.equal(pc.polaritySource, 'type');
  assert.equal(pc.nature, NODE_NATURE.PHYSICAL, '成本类自动成为实物池，不用再填 nature');
  assert.equal(pc.originalCost, 10000);
  assert.equal(pc.itemStatus, 'active');
  assert.equal('residualValue' in pc, false, '残值不落库，只算');

  // 没填原值也合法：原值可以由建仓流水推断（见 calc-engine 的 physicalBook）
  const bare = createNode({ id: 'bare', name: '旧手机', type: '成本类' });
  assert.equal(bare.nature, NODE_NATURE.PHYSICAL);
  assert.equal(bare.originalCost, 0);

  // 其它类型不会莫名变成实物
  assert.equal(createNode({ id: 'x', name: '储蓄', type: '资产类' }).nature, NODE_NATURE.ACCOUNT);
});
