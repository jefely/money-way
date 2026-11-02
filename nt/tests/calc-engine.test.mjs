/**
 * 计算引擎 —— v4.1 场景验收（余额 / 双式恒等 / 实物成本 / 成本类）。
 *
 *   node --test nt/tests/calc-engine.test.mjs
 *
 * 每个场景除了对单点余额，还断言 Σ(A 极) = Σ(B 极) ——
 * 这条恒等式一旦破，说明有笔钱凭空出现或消失了。
 * 事件层（怎么造、怎么校验、怎么合并）在 event-engine.test.mjs。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENT_STATUS,
  NODE_NATURE,
  createEvent,
  createNode,
} from '../js/core/event-engine.js';

import {
  auditBook,
  balanceOfNode,
  computeBalances,
  doubleEntryCheck,
  nodeFlows,
  physicalBook,
} from '../js/core/calc-engine.js';

import { checkAccountingIdentity } from '../js/core/validate.js';

/** 场景 ② / ③ 共用的节点底座 */
function bankNodes() {
  return [
    createNode({ id: 'bank', name: '储蓄卡', type: '资产类', category: '储蓄' }),
    createNode({ id: 'card', name: '信用卡', type: '负债类', category: '信用' }),
    createNode({ id: 'food', name: '食品', type: '费用类', category: '餐饮' }),
    createNode({ id: 'daily', name: '日用', type: '费用类', category: '日常' }),
    createNode({ id: 'misc', name: '其它', type: '费用类', category: '日常' }),
    createNode({ id: 'income', name: '工资', type: '收入类', category: '工资' }),
  ];
}

const posted = (patch) => createEvent({ status: EVENT_STATUS.POSTED, ...patch });

/* ============ 场景 ②：信用卡消费 + 还款 ============ */

test('场景② 信用卡：消费记费用一次，还款不再记第二次', () => {
  const nodes = bankNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const events = [
    posted({ id: 'ev-salary', date: '2026-11-01', amount: 5000, links: [{ from: 'income', to: 'bank', amount: 5000 }] }),
    posted({ id: 'ev-spend', date: '2026-11-02', amount: 1000, links: [{ from: 'card', to: 'food', amount: 1000 }] }),
    posted({ id: 'ev-repay', date: '2026-11-20', amount: 1000, links: [{ from: 'bank', to: 'card', amount: 1000 }] }),
  ];

  // 信用卡是 B 极：转出（消费）= 欠款增加 +1000；转入（还款）= 欠款减少 −1000
  assert.equal(balanceOfNode(byId.get('card'), events).balance, 0);
  // 费用只发生了一次
  assert.equal(balanceOfNode(byId.get('food'), events).balance, 1000);
  assert.equal(balanceOfNode(byId.get('bank'), events).balance, 4000);
  assert.equal(balanceOfNode(byId.get('income'), events).balance, 5000);

  const d = doubleEntryCheck(nodes, events);
  assert.equal(d.aTotal, 5000, 'A 极 = 银行卡 4000 + 餐饮 1000');
  assert.equal(d.bTotal, 5000, 'B 极 = 收入 5000 + 信用卡 0');
  assert.equal(d.diff, 0);
});

test('场景② 与旧恒等式等价：资产+费用 = 负债+权益+收入', () => {
  const nodes = bankNodes();
  const events = [
    posted({ id: 'e1', date: '2026-11-01', amount: 5000, links: [{ from: 'income', to: 'bank', amount: 5000 }] }),
    posted({ id: 'e2', date: '2026-11-02', amount: 1000, links: [{ from: 'card', to: 'food', amount: 1000 }] }),
  ];

  const balances = computeBalances(nodes, events).list
    .filter((row) => row.node && row.node.type)
    .map((row) => ({ cat: row.node.type, balance: row.balance }));

  const old = checkAccountingIdentity(balances);
  const neu = doubleEntryCheck(nodes, events);
  assert.equal(old.ok, true);
  assert.equal(neu.ok, true);
  // 同一个零：新模型的差 = 旧恒等式的差
  assert.equal(neu.diff, old.diff);
});

/* ============ 场景 ③：买电脑建仓 → 折旧 → 旧手机平仓 ============ */

test('场景③ 实物成本：建仓不算费用、折旧算费用、平仓归零并落损失', () => {
  const nodes = [
    createNode({ id: 'bank', name: '储蓄卡', type: '资产类', category: '储蓄' }),
    createNode({ id: 'income', name: '工资', type: '收入类', category: '工资' }),
    createNode({ id: 'pc', name: '电脑', type: '成本类', originalCost: 10000 }),
    createNode({ id: 'phone', name: '旧手机', type: '成本类', originalCost: 5000, itemStatus: 'disposed' }),
    createNode({ id: 'dep', name: '折旧费用', type: '费用类', category: '折旧' }),
    createNode({ id: 'loss', name: '资产处置损益', type: '费用类', category: '处置' }),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('pc').polarity, true, '实物节点默认 A 极');
  assert.equal('residualValue' in byId.get('pc'), false, '残值不落库，只算');

  const events = [
    posted({ id: 'e-in', date: '2026-11-01', amount: 20000, links: [{ from: 'income', to: 'bank', amount: 20000 }] }),
    posted({ id: 'e-buy-pc', date: '2026-11-03', amount: 10000, links: [{ from: 'bank', to: 'pc', amount: 10000 }] }),
    posted({ id: 'e-buy-phone', date: '2026-10-01', amount: 5000, links: [{ from: 'bank', to: 'phone', amount: 5000 }] }),
    posted({ id: 'e-dep', date: '2026-12-31', amount: 2000, links: [{ from: 'pc', to: 'dep', amount: 2000 }] }),
    // 平仓：旧手机 5000 → 回款 3000 + 变现亏损 2000
    posted({
      id: 'e-sell', date: '2026-11-05', amount: 5000,
      links: [{ from: 'phone', to: 'bank', amount: 3000 }, { from: 'phone', to: 'loss', amount: 2000 }],
    }),
  ];

  const pc = physicalBook(byId.get('pc'), events);
  assert.equal(pc.originalCost, 10000);
  assert.equal(pc.accumulated, 2000);
  assert.equal(pc.residual, 8000);
  assert.equal(pc.disposed, false);
  assert.equal(pc.overConsumed, false);

  const phone = physicalBook(byId.get('phone'), events);
  assert.equal(phone.accumulated, 5000);
  assert.equal(phone.residual, 0, '旧物节点必须清零');
  assert.equal(phone.disposed, true);

  assert.equal(balanceOfNode(byId.get('bank'), events).balance, 8000);
  assert.equal(balanceOfNode(byId.get('dep'), events).balance, 2000);
  assert.equal(balanceOfNode(byId.get('loss'), events).balance, 2000);

  const d = doubleEntryCheck(nodes, events);
  assert.equal(d.aTotal, 20000, 'A 极 = 卡 8000 + 电脑 8000 + 折旧 2000 + 手机 0 + 损失 2000');
  assert.equal(d.bTotal, 20000);
  assert.equal(d.diff, 0);
});

/* ============ 成本类 = 实物成本池（2026-11 追加的第六类） ============ */

test('成本类不填原值：用建仓流水推断原值，且建仓当期费用为 0', () => {
  const nodes = [
    createNode({ id: 'bank', name: '储蓄卡', type: '资产类' }),
    createNode({ id: 'pc', name: '电脑', type: '成本类' }),
    createNode({ id: 'dep', name: '折旧费用', type: '费用类' }),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('pc').nature, NODE_NATURE.PHYSICAL, '成本类自动是实物池');

  const buy = posted({ id: 'b1', date: '2026-11-01', amount: 10000, links: [{ from: 'bank', to: 'pc', amount: 10000 }] });

  // 建仓：资金从流动池转进实物池（沉睡），当期费用不增加
  assert.equal(balanceOfNode(byId.get('dep'), [buy]).balance, 0, '建仓不算当期费用');
  let book = physicalBook(byId.get('pc'), [buy]);
  assert.equal(book.originalCost, 10000, '原值由建仓流水推断出来');
  assert.equal(book.costSource, 'inferred');
  assert.equal(book.accumulated, 0);
  assert.equal(book.residual, 10000);

  // 折旧 2000：实物变少，沉没成本落到费用
  const dep = posted({ id: 'b2', date: '2026-12-31', amount: 2000, links: [{ from: 'pc', to: 'dep', amount: 2000 }] });
  book = physicalBook(byId.get('pc'), [buy, dep]);
  assert.equal(book.accumulated, 2000);
  assert.equal(book.residual, 8000);
  assert.equal(balanceOfNode(byId.get('dep'), [buy, dep]).balance, 2000);

  const d = doubleEntryCheck(nodes, [buy, dep]);
  assert.equal(d.diff, 0);
});

test('成本类原值若手工填了，就以填的为准', () => {
  const nodes = [
    createNode({ id: 'bank', name: '储蓄卡', type: '资产类' }),
    createNode({ id: 'phone', name: '旧手机', type: '成本类', originalCost: 6000 }),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const buy = posted({ id: 'p1', date: '2026-01-01', amount: 5000, links: [{ from: 'bank', to: 'phone', amount: 5000 }] });

  const book = physicalBook(byId.get('phone'), [buy]);
  assert.equal(book.originalCost, 6000, '手工填的原值优先');
  assert.equal(book.costSource, 'field');
  assert.equal(book.residual, 5000);
  assert.equal(book.accumulated, 1000);
});

/* ============ 体检入口 / 明细 ============ */

test('auditBook：结构 + 恒等 + 缓冲池 + 断链 一次给全', () => {
  const nodes = bankNodes();
  const ok = posted({ id: 'g1', date: '2026-11-01', amount: 100, links: [{ from: 'bank', to: 'food', amount: 100 }] });
  const raw = createEvent({ id: 'g2', date: '2026-11-02', amount: 25, rawText: '咖啡' });

  const clean = auditBook(nodes, [ok]);
  assert.equal(clean.ok, true);
  assert.equal(clean.pending.count, 0);
  assert.equal(clean.dangling, 0);

  const dirty = auditBook(nodes, [ok, raw]);
  assert.equal(dirty.ok, true, 'RAW 不算错，只是待归类');
  assert.equal(dirty.pending.count, 1);
  assert.equal(dirty.pending.amount, 25);

  const broken = auditBook(nodes, [ok, { ...ok, id: 'g3', links: [{ from: 'bank', to: 'ghost', amount: 1 }] }]);
  assert.equal(broken.ok, false);
  assert.equal(broken.dangling, 1);
});

test('nodeFlows：进出明细能按合并后的 ID 查到', () => {
  const nodes = [
    createNode({ id: 'bank', name: '储蓄卡', type: '资产类' }),
    createNode({ id: 'food', name: '餐饮', type: '费用类' }),
  ];
  const ev = posted({ id: 'f1', date: '2026-11-01', amount: 88, links: [{ from: 'bank', to: 'food', amount: 88 }] });
  const flows = nodeFlows('food', nodes, [ev]);
  assert.equal(flows.length, 1);
  assert.equal(flows[0].direction, 'in');
  assert.equal(flows[0].amount, 88);
  assert.equal(nodeFlows('nobody', nodes, [ev]).length, 0);
});
