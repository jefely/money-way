/**
 * 六元素槽位提取：转出 / 转入 / 节点类型 / 节点分类 / 备注分类 / 备注关键字。
 * 重点覆盖 2026-11 用户报的两个简码连写、方向词、备注表。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsePhrase } from '../js/core/phrase-parser.js';
import { LEXICON } from '../js/core/lexicon.js';
import { ACCOUNT_TYPE } from '../js/core/schema.js';

const NOW = new Date(2026, 10, 7);
const BANKS = [
  { id: 'a', code: 'ZHC', name: '招行储蓄卡', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
  { id: 'b', code: 'JHC', name: '交行储蓄卡', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
];

const parse = (text, accounts = [], notes = []) => parsePhrase(text, accounts, LEXICON, NOW, { notes });

test('两个简码连写：zhc2000jhc → 招行转出 2000 到交行', () => {
  const r = parse('zhc2000jhc', BANKS);
  assert.equal(r.amount, 2000);
  assert.equal(r.slots.from.name, '招行储蓄卡');
  assert.equal(r.slots.to.name, '交行储蓄卡');
  assert.equal(r.slots.from.type, ACCOUNT_TYPE.ASSET);
  assert.equal(r.slots.from.category, '储蓄');
  assert.equal(r.slots.to.category, '储蓄');
  assert.equal(r.confidence, 'high');
});

test('简码大小写、空格都不影响', () => {
  for (const text of ['ZHC2000JHC', 'zhc 2000 jhc', 'zhc 2000 JHC']) {
    const r = parse(text, BANKS);
    assert.equal(r.slots.from.name, '招行储蓄卡', text);
    assert.equal(r.slots.to.name, '交行储蓄卡', text);
  }
});

test('六元素齐全：用微信买咖啡 50', () => {
  const r = parse('用微信买咖啡50');
  assert.equal(r.amount, 50);
  assert.equal(r.slots.from.name, '微信');
  assert.equal(r.slots.from.type, ACCOUNT_TYPE.ASSET);
  assert.equal(r.slots.from.category, '网络账户');
  assert.equal(r.slots.to.name, '餐饮');
  assert.equal(r.slots.to.type, ACCOUNT_TYPE.EXPENSE);
  assert.equal(r.slots.nodeType, ACCOUNT_TYPE.EXPENSE);
  assert.equal(r.slots.nodeCategory, '餐饮');
  assert.equal(r.slots.note.category, '餐饮');
  assert.equal(r.slots.note.keyword, '咖啡');
  assert.equal(r.slots.note.text, '咖啡');
});

test('方向词「还」：还信用卡 5000 是转入，不是转出', () => {
  const r = parse('还信用卡5000');
  assert.equal(r.amount, 5000);
  assert.equal(r.slots.from, null);
  assert.equal(r.slots.to.name, '信用卡');
  assert.equal(r.slots.to.type, ACCOUNT_TYPE.LIABILITY);
  assert.equal(r.slots.to.category, '信用卡');
});

test('收入在转出：工资到微信 8000', () => {
  const r = parse('工资到微信8000');
  assert.equal(r.slots.from.name, '工资');
  assert.equal(r.slots.from.type, ACCOUNT_TYPE.INCOME);
  assert.equal(r.slots.from.category, '职业收入');
  assert.equal(r.slots.to.name, '微信');
  assert.equal(r.slots.to.type, ACCOUNT_TYPE.ASSET);
});

test('备注表优先：瑞幸 → 备注分类「商家」、关键字「瑞幸」', () => {
  const notes = [{ id: 'n1', code: 'RX', type: '商家', keyword: '瑞幸', text: '咖啡' }];
  const r = parse('瑞幸32', [], notes);
  assert.equal(r.slots.note.type, '商家');
  assert.equal(r.slots.note.keyword, '瑞幸');
  assert.equal(r.slots.to.name, '餐饮');
  assert.equal(r.slots.note.confidence, 'high');
});

test('用户账户优先于词库：微信支付不被截成微信', () => {
  const accounts = [{ id: 'wx', code: 'WX', name: '微信支付', type: ACCOUNT_TYPE.ASSET, category: '网络账户' }];
  const r = parse('微信支付50', accounts);
  assert.equal(r.slots.from.name, '微信支付');
  assert.equal(r.slots.from.id, 'wx');
});

test('物品词没有金额时不补转入，整句留备注', () => {
  const r = parse('今天那个老李还了我上次请他吃饭的钱');
  assert.equal(r.slots.to, null);
  assert.equal(r.confidence, 'low');
});

test('空格分隔的数字简码：2 200 3 → 2 转出 200 到 3', () => {
  const accounts = [
    { id: 'n2', code: '2', name: '招行', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
    { id: 'n3', code: '3', name: '交行', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
  ];
  for (const text of ['2 200 3', '2  200  3', '2 3 200', '200 2 3']) {
    const r = parse(text, accounts);
    assert.equal(r.amount, 200, text);
    assert.equal(r.slots.from.name, '招行', text);
    assert.equal(r.slots.to.name, '交行', text);
  }
});

test('分隔符：2-3 600 / zhc-jhc 500 都按「前者转出、后者转入」', () => {
  const accounts = [
    { id: 'n2', code: '2', name: '招行', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
    { id: 'n3', code: '3', name: '交行', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
    { id: 'a', code: 'ZHC', name: '招行储蓄卡', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
    { id: 'b', code: 'JHC', name: '交行储蓄卡', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
  ];
  const cases = [
    ['2-3 600', 600, '招行', '交行'],
    ['2→3 600', 600, '招行', '交行'],
    ['2->3 600', 600, '招行', '交行'],
    ['zhc-jhc 500', 500, '招行储蓄卡', '交行储蓄卡'],
  ];
  for (const [text, amount, from, to] of cases) {
    const r = parse(text, accounts);
    assert.equal(r.amount, amount, text);
    assert.equal(r.slots.from.name, from, text);
    assert.equal(r.slots.to.name, to, text);
    assert.equal(r.note, '', text);
  }
});

test('退款：方向反转，衣服转出 200 到微信', () => {
  const accounts = [
    { id: 'yf', code: 'yf', name: '衣服', type: ACCOUNT_TYPE.EXPENSE, category: '购物' },
    { id: 'wx', code: 'wx', name: '微信', type: ACCOUNT_TYPE.ASSET, category: '网络账户' },
  ];
  const r = parse('退款 yf-wx 200', accounts);
  assert.equal(r.amount, 200);
  assert.equal(r.refund, true);
  assert.equal(r.slots.from.name, '衣服');
  assert.equal(r.slots.from.type, ACCOUNT_TYPE.EXPENSE);
  assert.equal(r.slots.to.name, '微信');
  assert.equal(r.slots.to.type, ACCOUNT_TYPE.ASSET);
  // 主节点取费用侧：衣服/购物，而不是收款的微信/网络账户
  assert.equal(r.slots.nodeType, ACCOUNT_TYPE.EXPENSE);
  assert.equal(r.slots.nodeCategory, '购物');
});

test('退款单端：退款 wx 200 是转入微信，退款 yf 200 是转出衣服', () => {
  const accounts = [
    { id: 'yf', code: 'yf', name: '衣服', type: ACCOUNT_TYPE.EXPENSE, category: '购物' },
    { id: 'wx', code: 'wx', name: '微信', type: ACCOUNT_TYPE.ASSET, category: '网络账户' },
  ];
  const toWx = parse('退款 wx 200', accounts);
  assert.equal(toWx.slots.from, null);
  assert.equal(toWx.slots.to.name, '微信');

  const fromYf = parse('退款 yf 200', accounts);
  assert.equal(fromYf.slots.from.name, '衣服');
  assert.equal(fromYf.slots.to, null);
});

test('每个节点带 A/B 角色：收入 B、资产 A、费用 A、负债 B', () => {
  const income = parse('工资到微信8000');
  assert.equal(income.slots.from.polarity, 'B');
  assert.equal(income.slots.to.polarity, 'A');

  const spend = parse('用微信买咖啡50');
  assert.equal(spend.slots.from.polarity, 'A');
  assert.equal(spend.slots.to.polarity, 'A');

  const repay = parse('还信用卡5000');
  assert.equal(repay.slots.to.polarity, 'B');
});

test('空输入不抛，slots 仍是完整结构', () => {
  const r = parse('');
  assert.equal(r.amount, null);
  assert.ok(r.slots);
  assert.equal(r.slots.from, null);
  assert.equal(r.slots.to, null);
  assert.equal(r.slots.note.text, '');
});
