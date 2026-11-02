/**
 * 点弧块时看哪一侧的线（2026-11 用户定，取代原来的「逆流 / 顺流」开关）。
 *
 *   node --test nt/tests/acc-side.test.mjs
 *
 * 规则：
 *   收入类 / 权益类          只看**转出**
 *   资产类 / 负债类 / 成本类  转入与转出**都看**
 *   费用类                   只看**转入**
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACC_SIDE, sideForType, traceByAccount } from '../js/graph/path-tracer.js';
import { ACCOUNT_TYPE } from '../js/core/schema.js';

test('★ 侧向表：收入/权益看转出，费用看转入，其余两头都看', () => {
  assert.equal(sideForType(ACCOUNT_TYPE.INCOME), 'out');
  assert.equal(sideForType(ACCOUNT_TYPE.EQUITY), 'out');
  assert.equal(sideForType(ACCOUNT_TYPE.EXPENSE), 'in');
  for (const t of [ACCOUNT_TYPE.ASSET, ACCOUNT_TYPE.LIABILITY, ACCOUNT_TYPE.COST]) {
    assert.equal(sideForType(t), 'both', t);
  }
});

test('侧向表：六类全登记，认不出的按中转站处理（不漏线）', () => {
  for (const t of Object.values(ACCOUNT_TYPE)) {
    assert.ok(ACC_SIDE[t], `${t} 缺侧向定义`);
  }
  assert.equal(sideForType('不认识的类型'), 'both');
  assert.equal(sideForType(''), 'both');
  assert.equal(sideForType(null), 'both');
});

test('traceByAccount：both 两侧都收，in / out 各只有一侧', () => {
  const txs = [
    { from_id: 'b', to_id: 'f' },   // 银行卡 → 餐饮
    { from_id: 's', to_id: 'b' },   // 工资 → 银行卡
  ];
  assert.deepEqual(traceByAccount(txs, 'b', 'out'), [0]);
  assert.deepEqual(traceByAccount(txs, 'b', 'in'), [1]);
  assert.deepEqual(traceByAccount(txs, 'b', 'both'), [0, 1]);
});

test('traceByAccount：旧写法 up / down 仍然可用（up = 流入、down = 流出）', () => {
  const txs = [
    { from_id: 'b', to_id: 'f' },
    { from_id: 's', to_id: 'b' },
  ];
  assert.deepEqual(traceByAccount(txs, 'b', 'up'), [1]);
  assert.deepEqual(traceByAccount(txs, 'b', 'down'), [0]);
});

test('traceByAccount：单边流水与空输入不炸', () => {
  assert.deepEqual(traceByAccount([{ from_id: 'b', to_id: '' }], 'b', 'both'), [0]);
  assert.deepEqual(traceByAccount([{ from_id: 'b', to_id: '' }], 'b', 'in'), []);
  assert.deepEqual(traceByAccount([], 'b', 'both'), []);
  assert.deepEqual(traceByAccount(null, 'b', 'both'), []);
});
