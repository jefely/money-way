/**
 * 别名表：说法 → 规范节点名。
 *
 *   node --test nt/tests/alias-table.test.mjs
 *
 * 守的是：
 *   · 同一个说法只留一条（重复归类不会越长越多）
 *   · 说法去掉空白/大小写还能命中
 *   · 表里只存名字、不存节点 id —— 换账本后依然可用
 *   · 待归类项只认「关键字 = 临时节点名 且 有流水」的备注
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aliasKey, aliasGet, aliasPut, aliasPutMany, pendingKeywords,
} from '../js/core/alias-table.js';
import { createState, addAccount, addNote, addTransaction } from '../js/core/state-store.js';

test('aliasGet：命中、大小写与空白不敏感', () => {
  const list = [{ term: '味丰源', target: '早餐' }];
  assert.equal(aliasGet(list, '味丰源'), '早餐');
  assert.equal(aliasGet(list, ' 味丰源 '), '早餐');
  assert.equal(aliasGet(list, '味丰源 早点'), '');
  assert.equal(aliasGet(list, ''), '');
  assert.equal(aliasKey(' 味丰源 '), '味丰源');
});

test('aliasPut：同一个说法只留一条，第二次覆盖', () => {
  let list = [];
  list = aliasPut(list, '味丰源', '早餐');
  list = aliasPut(list, '味丰源', '早点');
  assert.equal(list.length, 1);
  assert.equal(aliasGet(list, '味丰源'), '早点');
  assert.equal(list[0].source, 'local');
});

test('aliasPut：说法与目标相同、空值都不写', () => {
  const list = [];
  assert.equal(aliasPut(list, '早餐', '早餐').length, 0);
  assert.equal(aliasPut(list, '', '早餐').length, 0);
  assert.equal(aliasPut(list, '味丰源', '').length, 0);
});

test('aliasPutMany：一批一次并进去', () => {
  const list = aliasPutMany([], [{ term: '味丰源', target: '早餐' }, { term: '好再来', target: '早餐' }]);
  assert.equal(list.length, 2);
  assert.equal(aliasGet(list, '好再来'), '早餐');
});

test('pendingKeywords：关键字要既是节点名、又有流水指向它', () => {
  let st = createState();
  st = addAccount(st, { id: 'cmb', name: '招行储7912', type: '资产类', category: '储蓄' });
  st = addAccount(st, { id: 'temp', name: '味丰源' });
  st = addAccount(st, { id: 'idle', name: '百度网盘' });
  st = addNote(st, { keyword: '味丰源' });
  st = addNote(st, { keyword: '百度网盘' });   // 没有流水 → 不算待归类
  st = addNote(st, { keyword: '随便写的' });   // 没有对应节点 → 不算
  st = addTransaction(st, { date: '2026-10-01', from_id: 'cmb', to_id: 'temp', amount: 12 });

  const list = pendingKeywords(st);
  assert.equal(list.length, 1);
  assert.equal(list[0].keyword, '味丰源');
  assert.equal(list[0].count, 1);
});
