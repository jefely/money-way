/**
 * 资金路径追踪（2026-11-03 定稿版）。
 *
 *   node --test nt/tests/flow-path.test.mjs
 *
 * 向后：**逐层推进，累计凑够为止**
 *   -1 = 选中那笔「转出节点」作为转入的、之前最近一条（+ 同层补齐）
 *        累计这一层；不够选中那笔的发生额就继续往下追
 *   -2 = -1 代表记录的「转出节点」作为转入的、更早的最近一条（+ 同层补齐）
 *   …… 直到累计 ≥ 选中金额，或者链断 / 到深度上限
 *
 * 向前：单线（第一轮），每层只找第一次作为转出节点的那一笔
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
  assert.equal(r.steps.get(0), -1, '银行卡之前最近一次转入 → -1');
});

test('★ 从**最近**一条往上，不是最早', () => {
  const txs = [
    { id: 't0', from_id: 'p', to_id: 's', amount: 1 },      // p → 工资
    { id: 't1', from_id: 's', to_id: 'b', amount: 2 },      // 工资 → 银行卡（早）
    { id: 't2', from_id: 'q', to_id: 's', amount: 3 },      // q → 工资
    { id: 't3', from_id: 's', to_id: 'b', amount: 4 },      // 工资 → 银行卡（近，-1 代表）
    { id: 't4', from_id: 'b', to_id: 't', amount: 100 },    // 选中
  ];
  const r = traceFlowPath(txs, 4);
  assert.equal(r.steps.get(3), -1, '-1 的代表是最近那笔 t3');
  assert.equal(r.steps.get(1), -1, '同层补齐 t1');
  // 第二层从 t3 继续往前找「工资」的转入 → 命中 t2（不是 t0）
  assert.equal(r.steps.get(2), -2, '从最近的 -1 继续往前');
  assert.equal(r.steps.get(0), -2, 't0 与 t2 转入同一账户 → 同层补齐');
});

test('★★ 累加不够就继续追：-1 不够 → -2 → -3', () => {
  const txs = [
    { id: 't0', from_id: 'a', to_id: 'b', amount: 20 },   // -3
    { id: 't1', from_id: 'b', to_id: 'c', amount: 30 },   // -2
    { id: 't2', from_id: 'c', to_id: 'z', amount: 40 },   // -1，只有 40
    { id: 't3', from_id: 'z', to_id: 'w', amount: 100 },  // 选中
  ];
  const r = traceFlowPath(txs, 3);
  assert.equal(r.steps.get(3), 0);
  assert.equal(r.steps.get(2), -1, '40 < 100，继续');
  assert.equal(r.steps.get(1), -2, '累计 70 < 100，继续');
  assert.equal(r.steps.get(0), -3, '累计 90，链到底');
});

test('★ 凑够就停：-1 一层就够，不再往下', () => {
  const txs = [
    { id: 't0', from_id: 'a', to_id: 'b', amount: 20 },
    { id: 't1', from_id: 'b', to_id: 'z', amount: 100 },   // -1，一层就够
    { id: 't2', from_id: 'z', to_id: 'w', amount: 100 },   // 选中
  ];
  const r = traceFlowPath(txs, 2);
  assert.equal(r.steps.get(1), -1);
  assert.equal(r.steps.has(0), false, '已经凑够，不再往下追');
});

test('★ 同层补齐的金额也计入累计', () => {
  const txs = [
    { id: 't0', from_id: 'a', to_id: 'z', amount: 60 },   // -1 同层
    { id: 't1', from_id: 'b', to_id: 'z', amount: 50 },   // -1 代表
    { id: 't2', from_id: 'z', to_id: 'w', amount: 100 },  // 选中
  ];
  const r = traceFlowPath(txs, 2);
  assert.equal(r.steps.get(1), -1);
  assert.equal(r.steps.get(0), -1, '50 + 60 = 110 ≥ 100，这一层就够');
});

test('向前单线：只认第一次作为转出节点的那一笔', () => {
  const txs = [
    { id: 'a', from_id: 's', to_id: 'b', amount: 100 },   // 选中
    { id: 'b', from_id: 'b', to_id: 'f', amount: 30 },    // 第一次转出：1
    { id: 'c', from_id: 'b', to_id: 'g', amount: 30 },    // 第二次转出：不收
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
