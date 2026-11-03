/**
 * 资金路径追踪（2026-11-03 树状版，按用户手绘图确定）。
 *
 *   node --test nt/tests/flow-path.test.mjs
 *
 * 两个方向共用一套树状展开：
 *   一层 = 上一层**每一笔**记录各自展开的一组
 *     -1：所有转入 A 的记录，累计 > A 的金额就停
 *     -2：-1 里每一笔各自的转入记录，累计 > **那一笔**的金额就停
 *     ……
 *   每收一笔就派生下一层的一个分支。每一支**独立累计**，互不影响。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { traceFlowPath } from '../js/graph/path-tracer.js';

test('★ 选中那笔本身永远是 0', () => {
  const txs = [
    { id: 't0', from_id: 's', to_id: 'b', amount: 100 },
    { id: 't1', from_id: 'b', to_id: 'f', amount: 40 },
  ];
  const r = traceFlowPath(txs, 0);
  assert.equal(r.steps.get(0), 0);
});

test('★ 向后树状：-1 收所有转入 A 的，累计到 A 的金额就停', () => {
  const txs = [
    { id: 't0', from_id: 'c', to_id: 'a', amount: 30 },    // 更早
    { id: 't1', from_id: 'd', to_id: 'a', amount: 60 },
    { id: 't2', from_id: 'e', to_id: 'a', amount: 20 },    // 最近
    { id: 't3', from_id: 'a', to_id: 'b', amount: 100 },   // 选中
  ];
  const r = traceFlowPath(txs, 3);
  // 从最近往前：t2(20) → 20；t1(60) → 80；t0(30) 会让 110 > 100 → 停
  assert.equal(r.steps.get(3), 0);
  assert.equal(r.steps.get(2), -1);
  assert.equal(r.steps.get(1), -1);
  assert.equal(r.steps.has(0), false, '再加 30 会超 100');
});

test('★★ 每一支独立累计：上限是**该支代表那一笔**的金额，不是选中金额', () => {
  const txs = [
    { id: 't0', from_id: 'q', to_id: 'e', amount: 30 },
    { id: 't1', from_id: 'p', to_id: 'e', amount: 20 },
    { id: 't2', from_id: 'e', to_id: 'a', amount: 40 },    // -1，E 支
    { id: 't3', from_id: 'd', to_id: 'a', amount: 60 },    // -1，D 支
    { id: 't4', from_id: 'a', to_id: 'b', amount: 100 },   // 选中
  ];
  const r = traceFlowPath(txs, 4);
  assert.equal(r.steps.get(4), 0);
  assert.equal(r.steps.get(3), -1, 'D 支');
  assert.equal(r.steps.get(2), -1, 'E 支');
  // E 支的上限 = 40：t1(20) 收下；t0(30) 会让这一支到 50 > 40 → 不收
  assert.equal(r.steps.get(1), -2, 'E 支的上一层');
  assert.equal(r.steps.has(0), false, 'E 支到 40 就停，不再往上');
});

test('★ 两支互不影响：D 支能继续走，E 支停住', () => {
  const txs = [
    { id: 't0', from_id: 'z', to_id: 'd', amount: 50 },    // D 支的上一层
    { id: 't1', from_id: 'q', to_id: 'e', amount: 99 },    // E 支：一收就超
    { id: 't2', from_id: 'e', to_id: 'a', amount: 40 },
    { id: 't3', from_id: 'd', to_id: 'a', amount: 60 },
    { id: 't4', from_id: 'a', to_id: 'b', amount: 150 },
  ];
  const r = traceFlowPath(txs, 4);
  assert.equal(r.steps.get(0), -2, 'D 支走到第二层');
  assert.equal(r.steps.has(1), false, 'E 支第一笔就 99 > 40，收不了');
});

test('★ 向前树状：B 的每一笔转出各自展开，序号是层号', () => {
  const txs = [
    { id: 't0', from_id: 's', to_id: 'b', amount: 100 },   // 选中
    { id: 't1', from_id: 'b', to_id: 'f', amount: 40 },    // 1
    { id: 't2', from_id: 'b', to_id: 'g', amount: 30 },    // 1
    { id: 't3', from_id: 'f', to_id: 'h', amount: 40 },    // 2（F 支）
    { id: 't4', from_id: 'g', to_id: 'i', amount: 80 },    // G 支：80 > 30，不收
  ];
  const r = traceFlowPath(txs, 0);
  assert.equal(r.steps.get(1), 1);
  assert.equal(r.steps.get(2), 1);
  assert.equal(r.steps.get(3), 2, 'F 支的下一层');
  assert.equal(r.steps.has(4), false, 'G 支上限 30，80 太大');
});

test('向前累计到选中金额就停：多出的转出不收', () => {
  const txs = [
    { id: 't0', from_id: 's', to_id: 'b', amount: 100 },   // 选中
    { id: 't1', from_id: 'b', to_id: 'f', amount: 60 },
    { id: 't2', from_id: 'b', to_id: 'g', amount: 30 },
    { id: 't3', from_id: 'b', to_id: 'h', amount: 30 },    // 60+30+30 > 100
  ];
  const r = traceFlowPath(txs, 0);
  assert.equal(r.steps.get(1), 1);
  assert.equal(r.steps.get(2), 1, '60 + 30 = 90，还够');
  assert.equal(r.steps.has(3), false, '再加 30 超 100');
});

test('★ 同名不同 ID 的账户也算同一个节点（合并/迁移留下的重名）', () => {
  const NAMES = { w1: '微信钱包', w2: '微信钱包', b: '招行储', o: '其它应付' };
  const nameOf = (id) => NAMES[id] || '';
  const txs = [
    { id: 'a', from_id: 'o', to_id: 'w2', amount: 1000 },
    { id: 'b', from_id: 'w1', to_id: 'b', amount: 4995 },
  ];
  const strict = traceFlowPath(txs, 1);
  assert.equal(strict.steps.has(0), false, '严格按 ID 时追不到');
  const loose = traceFlowPath(txs, 1, {
    sameAccount: (x, y) => x === y || (!!nameOf(x) && nameOf(x) === nameOf(y)),
  });
  assert.equal(loose.steps.get(0), -1, '按名字认作同一节点后就能追到');
});

test('成环不死循环（同一账户只展开一次）', () => {
  const txs = [
    { id: 'a', from_id: 'x', to_id: 'y', amount: 100 },
    { id: 'b', from_id: 'y', to_id: 'x', amount: 100 },
  ];
  const r = traceFlowPath(txs, 0, { maxDepth: 20 });
  assert.ok(r.linkIndices.length <= 2);
  assert.equal(r.steps.get(0), 0);
});

test('maxDepth 限制层数', () => {
  const txs = [{ id: 'seed', from_id: 'a0', to_id: 'a1', amount: 1000 }];
  for (let i = 1; i < 10; i += 1) {
    txs.push({ id: 't' + i, from_id: 'a' + i, to_id: 'a' + (i + 1), amount: 1 });
  }
  const r = traceFlowPath(txs, 0, { maxDepth: 3 });
  assert.equal(r.steps.size, 4, '0 和 1/2/3 共四条');
  assert.equal(r.steps.get(3), 3);
  assert.equal(r.steps.has(4), false);
});

test('★ maxDepth = 0 表示**不限**，一路追到底', () => {
  const txs = [{ id: 'seed', from_id: 'a0', to_id: 'a1', amount: 1000 }];
  for (let i = 1; i < 10; i += 1) {
    txs.push({ id: 't' + i, from_id: 'a' + i, to_id: 'a' + (i + 1), amount: 1 });
  }
  const r = traceFlowPath(txs, 0, { maxDepth: 0 });
  assert.equal(r.steps.size, 10, '全部十笔都进链');
  assert.equal(r.steps.get(9), 9);
});

test('空输入 / 越界不炸', () => {
  assert.deepEqual(traceFlowPath([], 0).linkIndices, []);
  assert.deepEqual(traceFlowPath(null, 0).linkIndices, []);
  assert.deepEqual(traceFlowPath([{ id: 'a', from_id: '', to_id: '' }], 0).linkIndices, [0]);
  const TX = [{ id: 'a', from_id: 's', to_id: 'b', amount: 1 }];
  assert.deepEqual(traceFlowPath(TX, 99).linkIndices, []);
  assert.deepEqual(traceFlowPath(TX, -1).linkIndices, []);
});

test('单边流水：缺一端时该方向直接停', () => {
  const txs = [{ id: 'a', from_id: '', to_id: 'b', amount: 1 }];
  const r = traceFlowPath(txs, 0);
  assert.deepEqual(r.linkIndices, [0]);
  assert.equal(r.steps.get(0), 0);
});
