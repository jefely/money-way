/**
 * 账单导入：中性交易（「不计收支」）按账户间转账导入。
 *
 *   node --test nt/tests/bill-neutral.test.mjs
 *
 * 守的是三件事：
 *   · 还款 / 提现 / 余额宝来回要认得出方向（两端都是账本里已有的账户）
 *   · 认不出方向就返回 null —— 绝不猜，猜错会把两个账户的余额同时弄错
 *   · 转账不计入「支出 / 收入」总额，否则还款会把统计撑大
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { neutralPlan, planBillImport, previewLine, collectNewAccounts } from '../js/core/bill-plan.js';
import { applyBillPlan } from '../js/core/bill-apply.js';
import { createState, addAccount } from '../js/core/state-store.js';

const ACC = [
  { id: 'a1', name: '招行储7912' },
  { id: 'a2', name: '支付宝余额' },
  { id: 'a3', name: '余额宝' },
  { id: 'a4', name: '花呗' },
  { id: 'a5', name: '借呗' },
];

const ctx = { accounts: ACC };

/** 真实账单里的一行（脱敏后只留判定要用的列） */
const row = (over) => ({
  date: '2026-10-09', time: '', amount: 0, tradeNo: '',
  dir: '不计收支', category: '', party: '', item: '', method: '', ...over,
});

test('还款：花呗自动还款 → 储蓄卡 → 花呗', () => {
  const r = neutralPlan(row({
    amount: 490.82,
    category: '信用借还',
    party: '花呗|信用购',
    item: '自动还款-花呗|信用购2026年10月账单',
    method: '招商银行储蓄卡(7912)',
  }), ctx);
  assert.ok(r);
  assert.equal(r.fromId, 'a1');
  assert.equal(r.toId, 'a4');
  assert.equal(r.fromName, '招行储7912');
});

test('还款：借呗还款，付款方式是「卡&余额宝」时取卡', () => {
  const r = neutralPlan(row({
    amount: 345.6,
    category: '信用借还',
    party: '借呗 | 信用贷',
    item: '借呗 | 信用贷还款',
    method: '招商银行储蓄卡(7912)&余额宝',
  }), ctx);
  assert.ok(r);
  assert.equal(r.fromId, 'a1');
  assert.equal(r.toId, 'a5');
});

test('还款：付款方式空（花呗账单自带的另一条腿）→ 不导，避免同一笔还两次', () => {
  const r = neutralPlan(row({
    amount: 1554.49,
    category: '信用借还',
    party: '花呗|信用购',
    item: '花呗|信用购自动还款',
    method: '',
  }), ctx);
  assert.equal(r, null);
});

test('提现：余额 → 招商银行（银行全名走简称别名）', () => {
  const r = neutralPlan(row({
    amount: 792,
    category: '账户存取',
    party: '招商银行',
    item: '提现-实时提现',
    method: '余额',
  }), ctx);
  assert.ok(r);
  assert.equal(r.fromId, 'a2');
  assert.equal(r.toId, 'a1');
});

test('理财「转出到」：余额宝 → 余额', () => {
  const r = neutralPlan(row({
    amount: 4600,
    category: '投资理财',
    party: '李俊锋',
    item: '余额宝-转出到余额',
    method: '余额',
  }), ctx);
  assert.ok(r);
  assert.equal(r.fromId, 'a3');
  assert.equal(r.toId, 'a2');
});

test('理财「收款到」：余额 → 余额宝', () => {
  const r = neutralPlan(row({
    amount: 10000,
    category: '投资理财',
    party: '余额宝',
    item: '转账收款到余额宝',
    method: '账户余额',
  }), ctx);
  assert.ok(r);
  assert.equal(r.fromId, 'a2');
  assert.equal(r.toId, 'a3');
});

test('理财「工资理财」：储蓄卡 → 余额宝', () => {
  const r = neutralPlan(row({
    amount: 100,
    category: '投资理财',
    party: '余额宝',
    item: '余额宝-工资理财',
    method: '招商银行储蓄卡(7912)',
  }), ctx);
  assert.ok(r);
  assert.equal(r.fromId, 'a1');
  assert.equal(r.toId, 'a3');
});

test('转到银行卡：对方是本人名字，目标账户认不出 → 不猜', () => {
  const r = neutralPlan(row({
    amount: 7007,
    category: '转账红包',
    party: '李俊锋',
    item: '转账到银行卡-转账',
    method: '余额宝',
  }), ctx);
  assert.equal(r, null);
});

test('退款：商户节点不存在 → 跳过（不新建假账户）', () => {
  const r = neutralPlan(row({
    amount: 26.5,
    category: '退款',
    party: '铁路12306',
    item: '退款-火车票',
    method: '交通银行储蓄卡(8380)',
  }), ctx);
  assert.equal(r, null);
});

test('退款：商户节点存在 → 商户 → 退回的卡', () => {
  const withShop = { accounts: [...ACC, { id: 'a9', name: '铁路12306' }] };
  const r = neutralPlan(row({
    amount: 26.5,
    category: '退款',
    party: '铁路12306',
    item: '退款-火车票',
    method: '招商银行储蓄卡(7912)',
  }), withShop);
  assert.ok(r);
  assert.equal(r.fromId, 'a9');
  assert.equal(r.toId, 'a1');
});

test('planBillImport：转账进入 rows 但不计入消费/收入', () => {
  const items = [
    row({ date: '2026-10-09', amount: 490.82, category: '信用借还', party: '花呗|信用购', item: '自动还款-花呗|信用购', method: '招商银行储蓄卡(7912)', tradeNo: 't1' }),
    row({ date: '2026-10-08', amount: 12.5, dir: '支出', category: '餐饮', party: '某米线店', item: '米线', method: '支付宝余额', tradeNo: 't2' }),
    row({ date: '2026-10-03', amount: 7007, category: '转账红包', party: '李俊锋', item: '转账到银行卡-转账', method: '余额宝', tradeNo: 't3' }),
  ];
  const plan = planBillImport(items, { accounts: ACC, presetId: 'alipay' });
  assert.equal(plan.stats.transfer, 1);
  assert.equal(plan.stats.pending, 1);
  assert.equal(plan.stats.kept, 3);
  assert.equal(plan.stats.sumOut, 12.5);
  assert.equal(plan.stats.sumIn, 0);

  const tr = plan.rows.find((x) => x.transfer);
  assert.ok(tr);
  assert.equal(tr.dir, 'transfer');
  assert.match(previewLine(tr), /⇄/);
});

test('planBillImport：认不出两端的资金流转照样落地（只留一端，等用户补）', () => {
  const items = [
    row({ date: '2026-10-03', amount: 7007, category: '转账红包', party: '李俊锋', item: '转账到银行卡-转账', method: '余额宝' }),
  ];
  const plan = planBillImport(items, { accounts: ACC, presetId: 'alipay' });
  assert.equal(plan.stats.transfer, 0);
  assert.equal(plan.stats.pending, 1);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].fromId, 'a3');   // 余额宝：钱从这出去
  assert.equal(plan.rows[0].toId, '');       // 另一端留空，等用户填
  assert.equal(plan.rows[0].noteKeyword, '转账');
});

test('关键字：同一商户出现 3 次才单独成节点，低频的只进备注', () => {
  const mk = (party, cat, i) => row({
    date: '2026-10-' + String(10 + i).padStart(2, '0'),
    amount: 10, dir: '支出', category: cat, party, item: '商品',
    method: '支付宝余额', tradeNo: 'k' + i,
  });
  const items = [
    mk('味丰源', '餐饮美食', 0), mk('味丰源', '餐饮美食', 1), mk('味丰源', '餐饮美食', 2),
    mk('某小店', '餐饮美食', 3), mk('某小店', '餐饮美食', 4),
  ];
  const plan = planBillImport(items, { accounts: ACC, presetId: 'alipay' });
  assert.ok(plan.keywords.includes('味丰源'));
  assert.ok(!plan.keywords.includes('某小店'));

  const wants = collectNewAccounts(plan).map((w) => w.name);
  assert.ok(wants.includes('味丰源'));          // 高频：商户名自成节点
  assert.ok(wants.includes('餐饮美食'));        // 低频：归到交易分类
});

test('资金流转的关键字是「还款 / 提现」，不是商户全名', () => {
  const items = [
    row({ date: '2026-10-09', amount: 490.82, category: '信用借还', party: '花呗|信用购', item: '自动还款-花呗|信用购', method: '招商银行储蓄卡(7912)' }),
    row({ date: '2026-10-06', amount: 792, category: '账户存取', party: '招商银行', item: '提现-实时提现', method: '余额' }),
  ];
  const plan = planBillImport(items, { accounts: ACC, presetId: 'alipay' });
  assert.ok(plan.keywords.includes('还款'));
  assert.ok(plan.keywords.includes('提现'));
  assert.equal(plan.rows[0].noteKeyword, '还款');
  assert.equal(plan.rows[1].noteKeyword, '提现');
});

test('还款：账单给了信用卡尾号 → 建议新建负债节点，名字带尾号', () => {
  const r = neutralPlan(row({
    amount: 3000,
    category: '还款',
    party: '招商银行信用卡',
    item: '信用卡还款 尾号1234',
    method: '招商银行储蓄卡(7912)',
  }), ctx);
  assert.ok(r);
  assert.equal(r.fromId, 'a1');
  assert.equal(r.toId, '');
  assert.equal(r.toSuggest.name, '信用卡(1234)');
  assert.equal(r.toSuggest.type, '负债类');
});

test('还款：信用卡尾号在节点列表里已有 → 直接指过去，不再新建', () => {
  const withCard = { accounts: [...ACC, { id: 'c1', name: '招行信用卡1234' }] };
  const r = neutralPlan(row({
    amount: 3000,
    category: '还款',
    party: '招行信用卡1234',
    item: '还款',
    method: '招商银行储蓄卡(7912)',
  }), withCard);
  assert.ok(r);
  assert.equal(r.toId, 'c1');
  assert.equal(r.toSuggest, undefined);
});

test('applyBillPlan：还款的信用卡节点会被真建出来，流水指向它', () => {
  let st = createState();
  st = addAccount(st, { id: 'cmb', name: '招商银行储蓄卡(7912)', type: '资产类', category: '储蓄' });
  const res = {
    kind: 'bill',
    presetId: 'alipay',
    items: [row({
      date: '2026-10-09', amount: 3000, category: '还款',
      party: '招商银行信用卡', item: '信用卡还款 尾号1234', method: '招商银行储蓄卡(7912)',
    })],
  };
  const out = applyBillPlan(st, res, {});
  const card = out.state.accounts.find((a) => a.name === '信用卡(1234)');
  assert.ok(card, '应该建出信用卡(1234)');
  const t = out.state.transactions[0];
  assert.equal(t.from_id, 'cmb');
  assert.equal(t.to_id, card.id);
});
