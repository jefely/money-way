/**
 * 分类统计的分组：任意类型都要成组，从而自动得到一行「XX类合计」
 * （用户 2026-10-30：合计行是自动添加的，格式固定；新出现统计分类也要自动加）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { categoryGroups } from '../js/core/ledger-stats.js';

const RANGE = { start: '2026-10-01', end: '2026-10-31' };

function acc(id, type, category, name) {
  return { id, type, category, name: name || id, code: id, isHidden: false };
}

test('内置类型：按 资产/费用/负债/权益/收入 顺序分组', () => {
  const accounts = [
    acc('a1', '资产类', '现金'),
    acc('b1', '负债类', '信用'),
    acc('e1', '费用类', '日常'),
  ];
  const groups = categoryGroups(accounts, [], RANGE);
  // 顺序跟 STAT_TYPE_ORDER：资产 → 负债 → 收入 → 权益 → 费用（只保留出现的）
  assert.deepEqual(groups.map((g) => g.type), ['资产类', '负债类', '费用类']);
  for (const g of groups) {
    assert.ok(g.total, '每组都要有合计（渲染层据此追加合计行）');
    assert.ok(g.categories.length > 0);
  }
});

test('自定义类型：也要单独成组（新统计分类自动获得合计行）', () => {
  const accounts = [
    acc('a1', '资产类', '现金'),
    acc('c1', '客户', '张三'),
    acc('c2', '客户', '李四'),
  ];
  const groups = categoryGroups(accounts, [], RANGE);
  assert.deepEqual(groups.map((g) => g.type), ['资产类', '客户']);

  const custom = groups.find((g) => g.type === '客户');
  // 分类按中文排序（李 < 张）
  assert.deepEqual(custom.categories.map((c) => c.category), ['李四', '张三']);
  assert.equal(custom.categories.length, 2);
  assert.ok(custom.total, '自定义类型同样要有 total');
});

test('类型为空（未分类账户）也成组，不会丢行', () => {
  const accounts = [acc('u1', '', '')];
  const groups = categoryGroups(accounts, [], RANGE);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].type, '');
  assert.deepEqual(groups[0].categories.map((c) => c.category), ['未分类']);
});
