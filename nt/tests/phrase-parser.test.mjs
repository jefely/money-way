/**
 * 一句话解析：日期、账户、金额、备注。不抛。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LEXICON } from '../js/core/lexicon.js';
import { parsePhrase } from '../js/core/phrase-parser.js';

const NOW = new Date(2026, 10, 4);

test('词库大约 150–200 个词，且关键字不重复', () => {
  assert.ok(LEXICON.length >= 150 && LEXICON.length <= 200, '实际 ' + LEXICON.length);
  const keys = LEXICON.map((row) => row.keyword);
  assert.equal(new Set(keys).size, keys.length);
  for (const row of LEXICON) {
    assert.equal(typeof row.accountName, 'string');
    assert.ok(row.type && row.category && row.role);
  }
});

test('咖啡 50：金额 50，备注咖啡，不建账户', () => {
  const r = parsePhrase('咖啡 50', [], LEXICON, NOW);
  assert.equal(r.amount, 50);
  assert.equal(r.note, '咖啡');
  assert.equal(r.fromHint, null);
  assert.equal(r.toHint, null);
  assert.equal(r.confidence, 'partial');
});

test('咖啡50元：金额仍是 50', () => {
  const r = parsePhrase('咖啡50元', [], LEXICON, NOW);
  assert.equal(r.amount, 50);
  assert.equal(r.note, '咖啡');
});

test('昨天用微信买咖啡50：日期、微信、咖啡、50', () => {
  const r = parsePhrase('昨天用微信买咖啡50', [], LEXICON, NOW);
  assert.equal(r.date, '2026-11-03');
  assert.equal(r.amount, 50);
  assert.equal(r.fromHint && r.fromHint.accountName, '微信');
  assert.equal(r.fromHint.role, 'payment');
  assert.equal(r.note, '咖啡');
});

test('11月4日咖啡50：金额是 50，日期不是 11 或 4', () => {
  const r = parsePhrase('11月4日咖啡50', [], LEXICON, NOW);
  assert.equal(r.amount, 50);
  assert.equal(r.date, '2026-11-04');
  assert.equal(r.note, '咖啡');
});

test('ISO 日期不把年份当成金额', () => {
  const r = parsePhrase('2026-11-04咖啡', [], LEXICON, NOW);
  assert.equal(r.amount, null);
  assert.equal(r.date, '2026-11-04');
});

test('微信支付不被微信截断', () => {
  const r = parsePhrase('微信支付', [], LEXICON, NOW);
  assert.equal(r.fromHint && r.fromHint.keyword, '微信支付');
  assert.equal(r.fromHint.accountName, '微信');
  assert.notEqual(r.note, '支付');
  assert.equal(r.note, '');
});

test('用户账户「微信支付」优先于词库里的微信', () => {
  const accounts = [{ id: 'u1', name: '微信支付', type: '资产类', category: '网络账户', isHidden: false }];
  const r = parsePhrase('微信支付50', accounts, LEXICON, NOW);
  assert.equal(r.fromHint && r.fromHint.id, 'u1');
  assert.equal(r.fromHint.accountName, '微信支付');
  assert.equal(r.amount, 50);
  assert.notEqual(r.note, '支付');
});

test('花呗、支付宝、费用不被停用词拆开', () => {
  const hb = parsePhrase('花呗', [], LEXICON, NOW);
  assert.equal(hb.fromHint && hb.fromHint.accountName, '花呗');
  assert.equal(hb.note, '');

  const zfb = parsePhrase('支付宝', [], LEXICON, NOW);
  assert.equal(zfb.fromHint && zfb.fromHint.accountName, '支付宝');
  assert.notEqual(zfb.note, '支宝');

  const fee = parsePhrase('费用', [], LEXICON, NOW);
  assert.equal(fee.note, '费用');
  assert.equal(fee.fromHint, null);
});

test('每个账户名只用一次', () => {
  const r = parsePhrase('微信和微信50', [], LEXICON, NOW);
  assert.equal(r.fromHint && r.fromHint.accountName, '微信');
  assert.equal(r.toHint, null);
  assert.ok(String(r.note).includes('微信'));
});

test('工资到微信：收入在转出，资产在转入', () => {
  const r = parsePhrase('工资到微信8000', [], LEXICON, NOW);
  assert.equal(r.amount, 8000);
  assert.equal(r.fromHint && r.fromHint.accountName, '工资');
  assert.equal(r.fromHint.role, 'income');
  assert.equal(r.toHint && r.toHint.accountName, '微信');
  assert.equal(r.confidence, 'high');
});

test('50块 / ¥50', () => {
  assert.equal(parsePhrase('奶茶50块', [], LEXICON, NOW).amount, 50);
  assert.equal(parsePhrase('奶茶¥50', [], LEXICON, NOW).amount, 50);
});

test('坏输入不抛', () => {
  assert.doesNotThrow(() => parsePhrase(null));
  assert.doesNotThrow(() => parsePhrase(undefined, null, null, 'nope'));
  const r = parsePhrase('', [], null, NOW);
  assert.equal(r.confidence, 'low');
  assert.equal(r.amount, null);
});
