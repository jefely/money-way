// 导入解析测试
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findBillHeader, detectBill, billRowsToItems, parseBillAmount,
  parseBillDate, billFingerprint, BILL_PRESETS,
} from '../js/core/bill-parse.js';
import {
  analyzeTable, findGenericHeader, genericRowsToItems,
} from '../js/core/import-table.js';

const ALIPAY = [
  ['支付宝交易记录明细查询'],
  ['账号', 'abc@example.com'],
  ['起始日期', '2026-08-01'],
  [],
  ['交易时间', '交易分类', '交易对方', '商品说明', '收/支', '金额', '收/付款方式', '交易订单号', '备注'],
  ['2026-08-01 12:30:00', '餐饮', '某某餐厅', '午饭', '支出', '35.00', '余额宝', '20260801001', ''],
  ['2026-08-02 09:00:00', '转账', '张三', '还款', '收入', '200.00', '余额', '20260802001', ''],
];

const WECHAT = [
  ['微信支付账单明细'],
  [],
  ['交易时间', '交易类型', '交易对方', '商品', '收/支', '金额(元)', '支付方式', '交易单号', '备注'],
  ['2026-08-03 18:20:00', '商户消费', '超市', '日用', '支出', '¥120.50', '零钱', '4200001', ''],
];

const GENERIC = [
  ['日期', '转出', '转入', '金额', '备注'],
  ['2026-08-05', '工资', '招行储', '8000', '八月工资'],
  ['2026-08-06', '招行储', '现金', '500', '取现'],
];

test('BILL_PRESETS 有三家', () => {
  assert.equal(BILL_PRESETS.length, 3);
  assert.deepEqual(BILL_PRESETS.map((p) => p.id), ['alipay', 'wechat', 'cmb']);
});

test('findBillHeader 认出支付宝表头', () => {
  const alipay = BILL_PRESETS[0];
  const r = findBillHeader(ALIPAY, alipay);
  assert.equal(r.idx, 4);
  assert.equal(r.map.date, 0);
  assert.equal(r.map.amount, 5);
});

test('detectBill 自动认出支付宝', () => {
  const r = detectBill(ALIPAY);
  assert.equal(r.preset.id, 'alipay');
  assert.equal(r.idx, 4);
});

test('detectBill 自动认出微信', () => {
  const r = detectBill(WECHAT);
  assert.equal(r.preset.id, 'wechat');
});

test('billRowsToItems 跳过非数据行', () => {
  const hit = detectBill(ALIPAY);
  const items = billRowsToItems(ALIPAY, hit);
  assert.equal(items.length, 2);
  assert.equal(items[0].date, '2026-08-01');
  assert.equal(items[0].amount, 35);
  assert.equal(items[0].dir, '支出');
  assert.equal(items[0].party, '某某餐厅');
  assert.equal(items[0].tradeNo, '20260801001');
});

test('parseBillAmount 处理各种写法', () => {
  assert.equal(parseBillAmount('35.00'), 35);
  assert.equal(parseBillAmount('¥120.50'), 120.5);
  assert.equal(parseBillAmount('￥1,234.56'), 1234.56);
  assert.equal(parseBillAmount('-50'), -50);
  assert.equal(parseBillAmount('(80)'), -80);
  assert.equal(parseBillAmount(''), null);
  assert.equal(parseBillAmount('abc'), null);
});

test('parseBillDate 处理各种写法', () => {
  assert.equal(parseBillDate('2026-08-01'), '2026-08-01');
  assert.equal(parseBillDate('2026/08/01'), '2026-08-01');
  assert.equal(parseBillDate('2026年8月1日'), '2026-08-01');
  assert.equal(parseBillDate('2026-08-01 12:30:00'), '2026-08-01');
  assert.equal(parseBillDate(''), null);
});

test('billFingerprint 优先用单号', () => {
  assert.equal(billFingerprint({ tradeNo: 'X1', date: 'd', amount: 1 }), 'no:X1');
  assert.ok(billFingerprint({ date: 'd', amount: 1, party: 'p', note: '' }).startsWith('fp|'));
});

test('findGenericHeader 认出通用表头', () => {
  const g = findGenericHeader(GENERIC);
  assert.equal(g.idx, 0);
  assert.equal(g.map.date, 0);
  assert.equal(g.map.from, 1);
  assert.equal(g.map.to, 2);
  assert.equal(g.map.amount, 3);
});

test('genericRowsToItems 转成条目', () => {
  const g = findGenericHeader(GENERIC);
  const items = genericRowsToItems(GENERIC, g);
  assert.equal(items.length, 2);
  assert.equal(items[0].date, '2026-08-05');
  assert.equal(items[0].amount, 8000);
  assert.equal(items[0].from, '工资');
  assert.equal(items[0].to, '招行储');
});

test('analyzeTable 认出账单', () => {
  const r = analyzeTable(ALIPAY);
  assert.equal(r.kind, 'bill');
  assert.equal(r.presetName, '支付宝');
  assert.equal(r.items.length, 2);
});

test('analyzeTable 认出通用表', () => {
  const r = analyzeTable(GENERIC);
  assert.equal(r.kind, 'generic');
  assert.equal(r.items.length, 2);
});

test('analyzeTable 认不出时给 unknown', () => {
  const r = analyzeTable([['a', 'b'], ['c', 'd']]);
  assert.equal(r.kind, 'unknown');
  assert.equal(r.items.length, 0);
});

test('parseBillDate 认 Excel 日期序列号', () => {
  // 46296 = 2026-10-24（单文件版导出的流水表里就是这个格式）
  assert.equal(parseBillDate('46296'), '2026-10-01');
  assert.equal(parseBillDate(45000), '2023-03-15');
  // 4 位以内的数字不当序列号（可能是别的含义）
  assert.equal(parseBillDate('1234'), null);
});

test('genericRowsToItems 能吃 Excel 序列号日期', () => {
  const rows = [
    ['序', '日期', '转出账户', '转入账户', '金额', '备注', '时间'],
    ['1', '46296', '招行储', '地铁', '3', '测试', '09:00'],
    ['2', '46297', '地铁', '食堂', '18', '午饭', '12:30'],
  ];
  const g = findGenericHeader(rows);
  assert.equal(g.idx, 0);
  const items = genericRowsToItems(rows, g);
  assert.equal(items.length, 2);
  assert.equal(items[0].date, '2026-10-01');
  assert.equal(items[0].amount, 3);
  assert.equal(items[0].from, '招行储');
});

test('analyzeTable 认得单文件版导出的流水表结构', () => {
  // 前两行是标题和说明，表头在第 3 行
  const rows = [
    ['流水记录'],
    ['格式：日期写 YYMMDD（如 261022）；账户可写简码或全名；金额填数字。'],
    ['序', '日期', '转出账户', '转入账户', '金额', '备注', '时间'],
    ['1', '46296', '招行储', '地铁', '3', '测试', '09:00'],
  ];
  const r = analyzeTable(rows);
  assert.equal(r.kind, 'generic');
  assert.equal(r.headerIdx, 2);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].date, '2026-10-01');
});

test('parseBillDate 认 YYMMDD（6 位）', () => {
  assert.equal(parseBillDate('261024'), '2026-10-24');
  assert.equal(parseBillDate('260801'), '2026-08-01');
  assert.equal(parseBillDate('991231'), '1999-12-31');
  // 月份/日期越界的不能瞎认
  assert.equal(parseBillDate('261399'), null);
});
