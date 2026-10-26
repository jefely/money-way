/**
 * 账本文本测试：两段式格式 + 兼容模式。
 *
 * 用**用户真实给的那段文本**做验收，一字不改。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseLedgerText, normalizeDate, normalizePunct, splitCells,
  trimTrailingEmpty, isHeaderRow, looksLikeSectionHeader,
} from '../js/core/import-parser.js';

/** 用户给的原始样例（中文逗号、行尾多一个逗号） */
const SAMPLE = `账户：
类型，分类，简码，名称，期初，账单日，还款日，
收入类，工资，GZ，工资，
资产类，现金，XJ，现金，200，
资产类，储蓄，GHC，工行储，4567，
负债类，信用，JHX，交行信1，2000，8，3，
负债类，信用，JHX2，交行信2，，8，3，

流水：
日期，转出，转入，金额，备注，
260801，XJ，S，3.5，
260801，JHC，HF，100，
260802，现金，水，3.5，
260802，交行储，话费，100，`;

test('★ 用户样例：账户段解析出 5 个账户', () => {
  const r = parseLedgerText(SAMPLE);
  assert.equal(r.accounts.length, 5, JSON.stringify(r.errors));

  const cash = r.accounts.find((a) => a.name === '现金');
  assert.equal(cash.type, '资产类');
  assert.equal(cash.category, '现金');
  assert.equal(cash.code, 'XJ');
  assert.equal(cash.opening, 200);

  const jhx = r.accounts.find((a) => a.name === '交行信1');
  assert.equal(jhx.type, '负债类');
  assert.equal(jhx.category, '信用');
  assert.equal(jhx.billDay, '8');
  assert.equal(jhx.repayDay, '3');

  const salary = r.accounts.find((a) => a.name === '工资');
  assert.equal(salary.type, '收入类');
  assert.equal(salary.opening, 0, '空期初按 0');
});

test('★ 用户样例：流水段解析出 4 笔', () => {
  const r = parseLedgerText(SAMPLE);
  assert.equal(r.transactions.length, 4, JSON.stringify(r.errors));

  const first = r.transactions[0];
  assert.equal(first.date, '2026-08-01');
  assert.equal(first.from, 'XJ');
  assert.equal(first.to, 'S');
  assert.equal(first.amount, 3.5);

  assert.equal(r.transactions[1].from, 'JHC');
  assert.equal(r.transactions[1].amount, 100);
  assert.equal(r.transactions[3].from, '交行储');
  assert.equal(r.transactions[3].to, '话费', '用户样例里第 5 位其实是转入账户');
});

test('★ 用户样例：没有错误行', () => {
  const r = parseLedgerText(SAMPLE);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 1));
  assert.equal(r.stats.accountOk, 5);
  assert.equal(r.stats.txOk, 4);
});

test('中文逗号会被归一化成半角（这是上一版导不进来的原因）', () => {
  const r = parseLedgerText('流水：\n260801，现金，餐饮，3.5，午饭');
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].date, '2026-08-01');
});

test('半角逗号 / Tab / 竖线 都能用', () => {
  for (const sep of [',', '\t', '|']) {
    const line = ['260801', 'A', 'B', '3.5', 'x'].join(sep);
    const r = parseLedgerText(`流水：\n${line}`);
    assert.equal(r.transactions.length, 1, `分隔符 ${JSON.stringify(sep)} 失败`);
  }
});

test('全角数字也认', () => {
  const r = parseLedgerText('流水：\n２６０８０１，现金，餐饮，３．５');
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].date, '2026-08-01');
  assert.equal(r.transactions[0].amount, 3.5);
});

test('行尾多余的逗号不会造出空列', () => {
  assert.deepEqual(trimTrailingEmpty(['a', 'b', '', '']), ['a', 'b']);
  const r = parseLedgerText('流水：\n260801，现金，餐饮，3.5，，，');
  assert.equal(r.transactions.length, 1, JSON.stringify(r.errors));
});

test('表头的「是日期」检查：表头不会被当流水', () => {
  assert.equal(isHeaderRow(['日期', '转出', '转入', '金额']), true);
  assert.equal(isHeaderRow(['260801', '现金', '餐饮', '3.5']), false);
});

test('段标题识别', () => {
  assert.equal(looksLikeSectionHeader('账户：'), true);
  assert.equal(looksLikeSectionHeader('账户'), true);
  assert.equal(looksLikeSectionHeader('流水:'), true);
  assert.equal(looksLikeSectionHeader('资产类，现金'), false);
});

test('没有段标记 → 整篇按流水解析（兼容旧粘贴）', () => {
  const r = parseLedgerText('260801，现金，餐饮，3.5，午饭\n260802，现金，餐饮，4');
  assert.equal(r.transactions.length, 2);
  assert.equal(r.accounts.length, 0);
});

test('账户类型写错 → 报错但不影响其它行', () => {
  const r = parseLedgerText([
    '账户：',
    '资产类，现金，XJ，现金',
    '乱写类，坏账户，BAD，坏的',
    '负债类，信用，JHX，交行信',
  ].join('\n'));
  assert.equal(r.accounts.length, 2);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /账户类型/);
});

test('账户缺名称 → 报错', () => {
  const r = parseLedgerText('账户：\n资产类，现金，XJ，');
  assert.equal(r.accounts.length, 0);
  assert.match(r.errors[0].message, /缺名称/);
});

test('空行 / # 注释 / BOM 都被忽略', () => {
  const r = parseLedgerText('\uFEFF流水：\n\n# 注释\n260801，A，B，1\n\n');
  assert.equal(r.transactions.length, 1);
  assert.equal(r.errors.length, 0);
});

test('日期四种写法', () => {
  assert.equal(normalizeDate('260801'), '2026-08-01');
  assert.equal(normalizeDate('20260801'), '2026-08-01');
  assert.equal(normalizeDate('2026-08-01'), '2026-08-01');
  assert.equal(normalizeDate('26-08-01'), '2026-08-01');
  assert.equal(normalizeDate('260231'), '', '2 月 31 日不存在');
});

test('金额：¥ 前缀与全角点都认（但逗号永远是分隔符，没有千分位）', () => {
  // 无逗号：正常
  const r1 = parseLedgerText('流水：\n260801，A，B，¥1234.56');
  assert.equal(r1.transactions[0].amount, 1234.56);

  // 全角点
  const r2 = parseLedgerText('流水：\n260801，A，B，3．5');
  assert.equal(r2.transactions[0].amount, 3.5);

  // 带逗号 → 逗号是字段分隔符，金额只取 ¥1，多出来的列进备注
  const r3 = parseLedgerText('流水：\n260801，A，B，¥1,234.56');
  assert.equal(r3.transactions[0].amount, 1, '逗号切开了，金额只有 ¥1');
});

test('备注里带空格不会被切碎（逗号分隔时）', () => {
  const r = parseLedgerText('流水：\n260801，A，B，3.5，中午 吃了 一顿');
  assert.equal(r.transactions[0].note, '中午 吃了 一顿');
});

test('normalizePunct 覆盖常见全角符号', () => {
  assert.equal(normalizePunct('Ａ１，２。３：'), 'A1,2.3:');
});

test('splitCells：单空格不切（保护「交行信 1」这类名字）', () => {
  assert.deepEqual(splitCells('交行信 1'), ['交行信 1']);
});
