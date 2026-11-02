/**
 * 资金路径追踪（2026-11-03 第二版：两轮）。
 *
 *   node --test nt/tests/flow-path.test.mjs
 *
 * 向后：
 *   第一轮（链，每层只找一条）
 *     E-1 = 选中那笔「转出节点」作为**转入**的、之前最近一条
 *     E-2 = E-1 的「转出节点」作为转入的、在 E-1 之前的最近一条 ……
 *   第二轮（补齐，同层同号）
 *     每层把「转入账户 == 该层代表记录的转入账户」的其它记录也标成同一层
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { traceFlowPath } from '../js/graph/path-tracer.js';

/**
 * t0 工资→银行卡 1000
 * t1 银行卡→餐饮 300
 * t2 餐饮→备用金 100
 * t3 银行卡→交通 50
 * t4 工资→银行卡 2000
 */
const TX = [
  { id: 't0', from_id: 's', to_id: 'b', amount: 1000 },
  { id: 't1', from_id: 'b', to_id: 'f', amount: 300 },
  { id: 't2', from_id: 'f', to_id: 'x', amount: 100 },
  { id: 't3', from_id: 'b', to_id: 't', amount: 50 },
  { id: 't4', from_id: 's', to_id: 'b', amount: 2000 },
];

test('★ 选中中间一笔：向前 1，向后 -1', () => {
  const r = traceFlowPath(TX, 1);   // t1: 银行卡 → 餐饮
  assert.equal(r.steps.get(1), 0);
  assert.equal(r.steps.get(2), 1, '餐饮之后第一次转出 → 1');
  assert.equal(r.steps.get(0), -1, '银行卡最近一次转入 → -1');
});

test('★ 向后找的是**最近**一条，不是最早', () => {
  const txs = [
    { id: 't0', from_id: 'p', to_id: 's', amount: 1 },      // p → 工资
    { id: 't1', from_id: 's', to_id: 'b', amount: 2 },      // 工资 → 银行卡（早）
    { id: 't2', from_id: 'q', to_id: 's', amount: 3 },      // q → 工资
    { id: 't3', from_id: 's', to_id: 'b', amount: 4 },      // 工资 → 银行卡（近，-1 代表）
    { id: 't4', from_id: 'b', to_id: 't', amount: 100 },    // 选中（金额要够大）
  ];
  const r = traceFlowPath(txs, 4);
  assert.equal(r.steps.get(4), 0);
  assert.equal(r.steps.get(3), -1, '-1 的代表是最近那笔 t3');
  assert.equal(r.steps.get(1), -1, '同层补齐 t1');
  // 关键：第二层从 t3 继续往前找「工资」的转入 → 命中 t2（不是 t0）
  assert.equal(r.steps.get(2), -2, '从最近的 -1 继续往前');
  assert.equal(r.steps.get(0), -2, 't0 与 t2 转入同一账户 → 同层补齐');
});

test('★ 第二轮补齐：转入账户相同的其它记录同层同号', () => {
  const txs = [
    { id: 't0', from_id: 'o', to_id: 'w', amount: 500 },    // 其它应付 → 微信钱包
    { id: 't1', from_id: 'b', to_id: 'w', amount: 999 },    // 招行储 → 微信钱包
    { id: 't2', from_id: 'o', to_id: 'w', amount: 10000 },  // 其它应付 → 微信钱包（最近）
    { id: 't3', from_id: 'w', to_id: 'b', amount: 20000 },  // 选中（金额要够大，别触发上限）
  ];
  const r = traceFlowPath(txs, 3);
  assert.equal(r.steps.get(3), 0);
  // 第一轮：最近一条是 t2
  assert.equal(r.steps.get(2), -1, '微信钱包最近一次转入');
  // 第二轮：t0、t1 也是转入微信钱包 → 同层
  assert.equal(r.steps.get(0), -1);
  assert.equal(r.steps.get(1), -1);
});

test('★ 第二层从 -1 那条继续往前，换成它的转出账户', () => {
  const txs = [
    { id: 't0', from_id: 'p', to_id: 'o', amount: 1 },      // 客户 → 其它应付
    { id: 't1', from_id: 'o', to_id: 'w', amount: 500 },    // 其它应付 → 微信钱包
    { id: 't2', from_id: 'o', to_id: 'w', amount: 900 },    // 其它应付 → 微信钱包（最近 → -1）
    { id: 't3', from_id: 'w', to_id: 'b', amount: 4995 },   // 选中
  ];
  const r = traceFlowPath(txs, 3);
  assert.equal(r.steps.get(2), -1, '微信钱包最近一次转入');
  assert.equal(r.steps.get(1), -1, '同层补齐');
  // -1 的转出账户是「其它应付」，在 t2 之前找「其它应付」的转入 → t0
  assert.equal(r.steps.get(0), -2);
});

test('★ 第二轮金额累计：超过选中那笔的发生额就停止追踪', () => {
  const txs = [
    { id: 't0', from_id: 'a', to_id: 'w', amount: 60 },   // 更早的一笔
    { id: 't1', from_id: 'b', to_id: 'w', amount: 50 },   // 累计会超
    { id: 't2', from_id: 'c', to_id: 'w', amount: 10 },   // 最近 → -1 代表
    { id: 't3', from_id: 'w', to_id: 'x', amount: 100 },  // 选中
  ];
  const r = traceFlowPath(txs, 3);
  assert.equal(r.steps.get(3), 0);
  assert.equal(r.steps.get(2), -1, '代表记录：最近那条');
  assert.equal(r.steps.get(1), -1, '10 + 50 = 60，没超 100');
  assert.equal(r.steps.has(0), false, '60 + 60 = 120 > 100 → 停止，t0 不进链');
});

test('金额累计不会误伤：刚好等于上限仍然收', () => {
  const txs = [
    { id: 't0', from_id: 'a', to_id: 'w', amount: 40 },
    { id: 't1', from_id: 'b', to_id: 'w', amount: 60 },
    { id: 't2', from_id: 'w', to_id: 'x', amount: 100 },   // 选中
  ];
  const r = traceFlowPath(txs, 2);
  assert.equal(r.steps.get(0), -1, '40 没超');
  assert.equal(r.steps.get(1), -1, '40 + 60 = 100，等于上限，仍然收');
});

test('向前**不汇聚**：只认第一次作为转出节点的那一笔', () => {
  const txs = [
    { id: 'a', from_id: 's', to_id: 'b', amount: 1 },   // 选中
    { id: 'b', from_id: 'b', to_id: 'f', amount: 2 },   // 第一次：1
    { id: 'c', from_id: 'b', to_id: 'g', amount: 3 },   // 第二次：不收
  ];
  const r = traceFlowPath(txs, 0);
  assert.equal(r.steps.get(1), 1);
  assert.equal(r.steps.has(2), false, '第二笔转出不属于这条路径');
});

test('★ 同名不同 ID 的账户也算同一个节点（合并/迁移留下的重名）', () => {
  const NAMES = { w1: '微信钱包', w2: '微信钱包', b: '招行储', o: '其它应付' };
  const nameOf = (id) => NAMES[id] || '';
  const txs = [
    { id: 'a', from_id: 'o', to_id: 'w2', amount: 10000 },
    { id: 'b', from_id: 'w1', to_id: 'b', amount: 4995 },
  ];
  const strict = traceFlowPath(txs, 1);
  assert.equal(strict.steps.has(0), false, '严格按 ID 时追不到');
  const loose = traceFlowPath(txs, 1, {
    sameAccount: (x, y) => x === y || (!!nameOf(x) && nameOf(x) === nameOf(y)),
  });
  assert.equal(loose.steps.get(0), -1, '按名字认作同一节点后就能追到');
});

test('成环不死循环（已标记的切断）', () => {
  const txs = [
    { id: 'a', from_id: 'x', to_id: 'y', amount: 1 },
    { id: 'b', from_id: 'y', to_id: 'x', amount: 1 },
  ];
  const r = traceFlowPath(txs, 0, { maxDepth: 20 });
  assert.ok(r.linkIndices.length <= 2);
  assert.equal(r.steps.get(0), 0);
});

test('maxDepth 限制层数', () => {
  const txs = [];
  for (let i = 0; i < 10; i += 1) {
    txs.push({ id: 't' + i, from_id: 'a' + i, to_id: 'a' + (i + 1), amount: 1 });
  }
  const r = traceFlowPath(txs, 0, { maxDepth: 3 });
  assert.equal(r.steps.size, 4, '0 和 1/2/3 共四条');
  assert.equal(r.steps.get(3), 3);
  assert.equal(r.steps.has(4), false);
});

test('★ maxDepth = 0 表示**不限**，一路追到底', () => {
  const txs = [];
  for (let i = 0; i < 10; i += 1) {
    txs.push({ id: 't' + i, from_id: 'a' + i, to_id: 'a' + (i + 1), amount: 1 });
  }
  const r = traceFlowPath(txs, 0, { maxDepth: 0 });
  assert.equal(r.steps.size, 10, '全部十笔都进链');
  assert.equal(r.steps.get(9), 9);
});

test('空输入 / 越界不炸', () => {
  assert.deepEqual(traceFlowPath([], 0).linkIndices, []);
  assert.deepEqual(traceFlowPath(null, 0).linkIndices, []);
  assert.deepEqual(traceFlowPath(TX, 99).linkIndices, []);
  assert.deepEqual(traceFlowPath(TX, -1).linkIndices, []);
});

test('单边流水：缺一端时该方向直接停', () => {
  const txs = [{ id: 'a', from_id: '', to_id: 'b', amount: 1 }];
  const r = traceFlowPath(txs, 0);
  assert.deepEqual(r.linkIndices, [0]);
  assert.equal(r.steps.get(0), 0);
});
