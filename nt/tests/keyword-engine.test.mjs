/**
 * 关键字引擎：把一条流水压成手机上看得下的短串。
 *
 *   node --test nt/tests/keyword-engine.test.mjs
 *
 * 断言直接用用户 2026-11-08 给的实例：
 *   原文  餐饮美食：丙怀餐饮，2026-08-08 13:17，丙怀餐饮，交通银行储蓄卡(8380)
 *   ②    餐饮：丙怀，2608081317，交行储8380
 *   ③    丙怀，2608081317
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compactTime, stamp, timeIn, pathOf, shortKey, shortNote, shortestNote,
} from '../js/core/keyword-engine.js';

const STATE = {
  accounts: [
    { id: 'food', name: '餐饮' },
    { id: 'bing', name: '丙怀', parentId: 'food' },
    { id: 'shop', name: '糕点' },
    { id: 'jiahua', name: '嘉华', parentId: 'shop' },
    { id: 'cmb', name: '交行储8380' },
    { id: 'cmb2', name: '招行储7912' },
  ],
  aliases: [
    { term: '丙怀餐饮', target: '丙怀' },
    { term: '云南嘉华食品有限公司', target: '嘉华' },
    { term: '百度顺风车费用', target: '百度打车' },
  ],
};

test('compactTime / stamp：2026-08-08 13:17 → 2608081317', () => {
  assert.equal(stamp('2026-08-08', '13:17'), '2608081317');
  assert.equal(stamp('2026-07-28', '10:23'), '2607281023');
  assert.equal(stamp('2026-10-18', '20:35'), '2610182035');
  assert.equal(compactTime('2026-10-22', '07:22'), '10220722');
});

test('timeIn：从备注原文里抠出 HH:MM', () => {
  assert.equal(timeIn('餐饮美食：丙怀餐饮，2026-08-08 13:17，丙怀餐饮'), '13:17');
  assert.equal(timeIn('没有时间'), '');
});

test('pathOf：沿 parentId 向上，名字用「：」连', () => {
  const byId = Object.fromEntries(STATE.accounts.map((a) => [a.id, a]));
  assert.equal(pathOf(STATE.accounts, byId.bing), '餐饮');
  assert.equal(pathOf(STATE.accounts, byId.food), '');
});

test('shortKey：别名命中就换短名', () => {
  assert.equal(shortKey('丙怀餐饮', STATE.aliases), '丙怀');
  assert.equal(shortKey('没见过的名字', STATE.aliases), '没见过的名字');
});

test('② 层：餐饮：丙怀，2608081317，交行储8380', () => {
  const tx = {
    date: '2026-08-08',
    note: '餐饮美食：丙怀餐饮，2026-08-08 13:17，丙怀餐饮，交通银行储蓄卡(8380)',
    noteKeyword: '丙怀餐饮',
    from_id: 'cmb',
    to_id: 'bing',
  };
  assert.equal(shortNote(STATE, tx), '餐饮：丙怀，2608081317，交行储8380');
});

test('③ 层：丙怀，2608081317', () => {
  const tx = {
    date: '2026-08-08',
    note: '餐饮美食：丙怀餐饮，2026-08-08 13:17，丙怀餐饮',
    noteKeyword: '丙怀餐饮',
    from_id: 'cmb',
    to_id: 'bing',
  };
  assert.equal(shortestNote(STATE, tx), '丙怀，2608081317');
});

test('② 层：糕点：嘉华，2610182035，交行储8380', () => {
  const tx = {
    date: '2026-10-18',
    note: '餐饮美食：云南嘉华食品有限公司，2026-10-18 20:35，二维码支付',
    noteKeyword: '云南嘉华食品有限公司',
    from_id: 'cmb',
    to_id: 'jiahua',
  };
  assert.equal(shortNote(STATE, tx), '糕点：嘉华，2610182035，交行储8380');
});

test('没有上级也没别名：退回分类/原文，不编造', () => {
  const tx = {
    date: '2026-11-01',
    note: '随便写的',
    noteKeyword: '某个商户',
    from_id: 'cmb',
    to_id: 'shop',
  };
  assert.equal(shortNote(STATE, tx), '糕点：某个商户，2611010000，交行储8380');
});
