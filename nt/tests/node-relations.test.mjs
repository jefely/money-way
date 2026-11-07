/**
 * 节点上下级：一棵由用户自己确立的树。
 *
 *   node --test nt/tests/node-relations.test.mjs
 *
 * 守的是：
 *   · 没设上级 = 根节点（不是「未分类」）
 *   · 挂上级之前必须能测出环（A→B→A），否则统计会无限递归
 *   · 后代按层展开，不重复
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parentOf, childrenOf, rootsOf, wouldCycle, descendantsOf,
} from '../js/core/node-relations.js';

const ACC = [
  { id: 'life', name: '生活' },
  { id: 'food', name: '餐饮', parentId: 'life' },
  { id: 'bf', name: '早餐', parentId: 'food' },
  { id: 'wei', name: '味丰源', parentId: 'bf' },
  { id: 'tie', name: '交通' },
];

test('parentOf / childrenOf / rootsOf', () => {
  assert.equal(parentOf(ACC, 'food').id, 'life');
  assert.equal(parentOf(ACC, 'life'), null);
  assert.deepEqual(childrenOf(ACC, 'life').map((a) => a.id), ['food']);
  assert.deepEqual(rootsOf(ACC).map((a) => a.id).sort(), ['life', 'tie']);
});

test('descendantsOf：整棵子树按层展开', () => {
  assert.deepEqual(descendantsOf(ACC, 'life').map((a) => a.id), ['food', 'bf', 'wei']);
  assert.deepEqual(descendantsOf(ACC, 'wei'), []);
});

test('wouldCycle：自己挂自己、以及绕回去都要拦住', () => {
  assert.equal(wouldCycle(ACC, 'life', 'life'), true);
  assert.equal(wouldCycle(ACC, 'life', 'wei'), true);   // 生活挂到自己的后代下面
  assert.equal(wouldCycle(ACC, 'tie', 'life'), false);  // 交通挂到生活下，没问题
});

test('没有 parentId 的节点就是根，不是「未分类」', () => {
  const roots = rootsOf(ACC);
  assert.ok(roots.every((a) => !a.parentId));
  assert.ok(!roots.some((a) => a.name === '未分类'));
});
