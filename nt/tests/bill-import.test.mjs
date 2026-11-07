/**
 * 账单导入：三家真实导出文件的结构（已脱敏）+ 六元素提取。
 *
 *   node --test nt/tests/bill-import.test.mjs
 *
 * 这一组守的是「用户不用先整理文件」：
 *   · 前面十几行说明文字要能跳过
 *   · 微信的日期是 Excel 序列号（46317.44…），不能读成 4629-07-29
 *   · 支付宝/招行的 CSV 是 GBK
 *   · 招行是合并表头 + 固定列，没有方向列（负号就是支出）
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeTable } from '../js/core/import-table.js';
import { parseBillDate, parseBillAmount } from '../js/core/bill-parse.js';
import { directionOf, planBillImport, collectNewAccounts } from '../js/core/bill-plan.js';
import { applyBillPlan } from '../js/core/bill-apply.js';
import { suggestOtherAccount, matchPayAccount } from '../js/core/bill-match.js';
import { decodeBytes } from '../js/ui/xlsx-read.js';
import { createState, addAccount } from '../js/core/state-store.js';
import { balanceOf } from '../js/core/balance-calculator.js';

/* ============ 微信：说明行 + Excel 序列号日期 ============ */

const WECHAT = [
  ['微信支付账单明细'],
  ['微信昵称：某甲'],
  ['起始时间：[2026-07-23 00:00:00] 终止时间：[2026-10-23 00:50:41]'],
  [],
  ['共3笔记录'],
  ['----------------------微信支付账单明细列表--------------------'],
  ['交易时间', '交易类型', '交易对方', '商品', '收/支', '金额(元)', '支付方式', '当前状态', '交易单号', '商户单号', '备注'],
  ['46317.443981481483', '商户消费', '某米线店', '米线', '支出', '12', '零钱', '支付成功', 'WX0001', '', '/'],
  ['46316.443009259259', '商户消费', '某超市', '日用品', '支出', '35.5', '招商银行储蓄卡(7912)', '支付成功', 'WX0002', '', '/'],
  ['46315.4', '转账-退款', '/', '转账备注:微信转账', '收入', '520', '零钱', '已全额退款', 'WX0003', '', '/'],
];

test('微信：跳过说明行，序列号日期还原正确', () => {
  const r = analyzeTable(WECHAT);
  assert.equal(r.kind, 'bill');
  assert.equal(r.presetId, 'wechat');
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0].date, '2026-10-22');
  assert.equal(r.items[1].date, '2026-10-21');
  assert.equal(r.items[0].amount, 12);
  assert.equal(r.items[0].dir, '支出');
  assert.equal(r.items[0].time, '10:39');
  assert.equal(r.items[2].dir, '收入');
});

test('Excel 序列号：带小数也要认（不读成 4629-07-29）', () => {
  assert.equal(parseBillDate('46317.443981481483'), '2026-10-22');
  assert.equal(parseBillDate('46317'), '2026-10-22');
  assert.equal(parseBillDate('2026-10-22 10:39:20'), '2026-10-22');
  assert.equal(parseBillDate('261024'), '2026-10-24');
  assert.equal(parseBillAmount('-5000'), -5000);
});

/* ============ 招行：合并表头 + 固定列 + 负号方向 ============ */

const CMB = [
  ['招商银行交易流水\nTransaction Statement of China Merchants Bank'],
  ['户  名：某甲\n账户类型：ALL/全币种'],
  ['记账日期     货币        交易金额        联机余额       交易摘要'],
  ['Date         Currency    Transaction     Balance        Tran'],
  ['                                                   Amount'],
  ['2025-10-22 00:00:00', 'CNY', '1400', '', '5800.25', '', '汇入汇款', '', '', '某乙', ''],
  ['2025-10-22 00:00:00', 'CNY', '-5000', '', '800.25', '', '银联代收', '', '', '（特约）某银行（信用卡还款）', ''],
];

test('招行：合并表头也能定位，负号=支出', () => {
  const r = analyzeTable(CMB);
  assert.equal(r.kind, 'bill');
  assert.equal(r.presetId, 'cmb');
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].amount, 1400);
  assert.equal(r.items[1].amount, -5000);
  assert.equal(directionOf(r.items[0], 'cmb'), 'in');
  assert.equal(directionOf(r.items[1], 'cmb'), 'out');
});

/* ============ 支付宝：GBK 的 CSV ============ */

test('GBK 的 CSV：UTF-8 解码失败后自动改用 GBK', () => {
  // "交易时间" 的 GBK 字节；UTF-8 解出来会是替换字符
  const gbk = new Uint8Array([0xBD, 0xBB, 0xD2, 0xD7, 0xCA, 0xB1, 0xBC, 0xE4]);
  const text = decodeBytes(gbk);
  assert.equal(text, '交易时间');

  const utf8 = new TextEncoder().encode('交易时间');
  assert.equal(decodeBytes(utf8), '交易时间');
});

/* ============ 方向：不计收支 / 中性 / 符号 ============ */

test('方向：不计收支先排除，微信 / 是中性，招行看符号', () => {
  assert.equal(directionOf({ dir: '支出', amount: 10 }, 'alipay'), 'out');
  assert.equal(directionOf({ dir: '收入', amount: 10 }, 'alipay'), 'in');
  assert.equal(directionOf({ dir: '不计收支', amount: 10 }, 'alipay'), 'neutral');
  assert.equal(directionOf({ dir: '/', amount: 10 }, 'wechat'), 'neutral');
  assert.equal(directionOf({ dir: '', amount: -5 }, 'cmb'), 'out');
  assert.equal(directionOf({ dir: '', amount: 5 }, 'cmb'), 'in');
});

/* ============ 匹配：我的账户 / 对方节点 ============ */

function book() {
  let s = createState();
  s = addAccount(s, { id: 'wallet', name: '微信钱包', type: '资产类', category: '网络账户' });
  s = addAccount(s, { id: 'cmb', name: '招行储', type: '资产类', category: '储蓄' });
  s = addAccount(s, { id: 'noodle', name: '米线', type: '费用类', category: '餐饮' });
  return s;
}

test('支付方式匹配：零钱 → 微信钱包，招商银行储蓄卡 → 招行储', () => {
  const s = book();
  assert.equal(matchPayAccount(s.accounts, '零钱').id, 'wallet');
  assert.equal(matchPayAccount(s.accounts, '招商银行储蓄卡(7912)').id, 'cmb');
});

test('对方节点建议：支付宝用交易分类，微信退到交易对方', () => {
  const a = suggestOtherAccount('昆明地铁', '地铁票', '交通出行', 'out', 'category');
  assert.equal(a.name, '交通出行');
  assert.equal(a.type, '费用类');
  assert.equal(a.category, '交通出行');

  const w = suggestOtherAccount('某米线店', '米线', '商户消费', 'out', '');
  assert.equal(w.name, '某米线店');
  assert.equal(w.keyword, '某米线店');

  const c = suggestOtherAccount('某乙', '快捷支付', '', 'out', 'item');
  assert.equal(c.name, '快捷支付', '招行没有分类列，用交易摘要建节点');
  assert.equal(c.category, '快捷支付');
});

/* ============ 计划：起始日期过滤 + 六元素 ============ */

test('起始日期：之前的记录整段不导，统计如实报', () => {
  const s = book();
  const r = analyzeTable(WECHAT);
  const plan = planBillImport(r.items, {
    accounts: s.accounts, from: '2026-10-22', presetId: r.presetId,
  });
  assert.equal(plan.stats.total, 3);
  assert.equal(plan.stats.before, 2, '10-21 与 10-15 两笔早于起始日');
  assert.equal(plan.stats.kept, 1);
  assert.equal(plan.rows[0].date, '2026-10-22');
});

test('★ 六元素：转出/转入 / 节点分类 / 节点类型 / 备注分类 / 备注关键字', () => {
  const s = book();
  const r = analyzeTable(WECHAT);
  const plan = planBillImport(r.items, { accounts: s.accounts, presetId: r.presetId });
  const row = plan.rows.find((x) => x.date === '2026-10-22');

  assert.equal(row.dir, 'out');
  assert.equal(row.fromId, 'wallet', '转出节点 = 零钱');
  assert.equal(row.toId, 'noodle', '转入节点：商户名命中了已有的「米线」');
  assert.equal(row.otherType, '费用类', '节点会计类型');
  assert.equal(row.otherCategory, '餐饮', '节点统计分类（取已有账户的）');
  assert.equal(row.noteType, '商户消费', '备注分类');
  // 备注关键字取「最特殊的字段」：某米线店 → 某米线（去掉「店」这个通用后缀）
  assert.equal(row.noteKeyword, '某米线', '备注关键字');
  // 备注格式（用户 2026-11-08）：类型：关键字，日期 时间，内容，内容
  assert.equal(row.note, '商户消费：某米线店，2026-10-22 10:39，米线，零钱');
  assert.equal(row.note.includes('｜'), false, '不再用全角竖线');
});

/* ============ 落库：自动建节点 + 判重 ============ */

test('★ 落库：自动建节点（费用类）、两端齐全、备注两栏写进去', () => {
  let s = book();
  const r = analyzeTable(WECHAT);
  const out = applyBillPlan(s, r, { from: '' });
  s = out.state;

  // 「某超市」在账本里没有对应节点 → 自动建（费用类，分类取账单的交易类型）
  const created = s.accounts.find((a) => a.name === '某超市');
  assert.ok(created, '缺的对方节点自动建');
  assert.equal(created.type, '费用类');
  assert.equal(created.category, '商户消费');

  const tx = s.transactions.find((t) => t.billId === 'WX0002');
  assert.equal(tx.from_id, 'cmb');
  assert.equal(tx.to_id, created.id);
  assert.equal(tx.noteType, '商户消费');
  assert.equal(tx.noteKeyword, '某超市');
  assert.equal(tx.status, undefined, '两端齐全 → 已入账');

  // 命中已有节点的那笔，直接用现成的「米线」
  const noodle = s.transactions.find((t) => t.billId === 'WX0001');
  assert.equal(noodle.to_id, 'noodle');

  // 收入那笔方向相反
  const inc = s.transactions.find((t) => t.billId === 'WX0003');
  assert.equal(inc.to_id, 'wallet');

  assert.equal(balanceOf(s.accounts.find((a) => a.id === 'wallet'), s.transactions).balance, -12 + 520);
});

test('重复导入：第二次全部标红（suspect），但**不跳过**', () => {
  let s = book();
  const r = analyzeTable(WECHAT);
  s = applyBillPlan(s, r, { from: '' }).state;
  const n1 = s.transactions.length;
  const out2 = applyBillPlan(s, r, { from: '' });
  // 用户 2026-11：重复记录标红、由用户逐条删，不再自动跳过
  assert.equal(out2.stats.added, 3);
  assert.equal(out2.stats.dup, 3);
  assert.equal(out2.state.transactions.length, n1 + 3);
  const marked = out2.state.transactions.filter((t) => t.suspect);
  assert.equal(marked.length, 3);
});

test('跨账单重复：同一笔（同日同额同一张卡）出现在两个账单里会被标红', () => {
  let s = book();
  // 先导微信：招行卡付的那笔
  s = applyBillPlan(s, analyzeTable(WECHAT), { from: '' }).state;
  // 再导「银行版」同一笔：同一天、同金额、同转出，但对方节点不同
  const bankRow = {
    date: '2026-10-21',
    time: '11:20',
    amount: 35.5,
    dir: '支出',
    party: '某超市',
    item: '快捷支付',
    method: '',
    category: '',
    tradeNo: '',
    note: '',
  };
  const fake = { kind: 'bill', presetId: 'cmb', items: [bankRow], hints: {} };
  const out = applyBillPlan(s, fake, { myAccountId: 'cmb' });
  const tx = out.state.transactions.find((t) => t.date === '2026-10-21' && t.amount === 35.5 && t.billId !== 'WX0002');
  assert.equal(tx.suspect, true);
  assert.equal(out.stats.dup, 1);
});

test('collectNewAccounts：同名只建一次', () => {
  const s = book();
  const r = analyzeTable(WECHAT);
  const plan = planBillImport(r.items, { accounts: s.accounts, presetId: r.presetId });
  const list = collectNewAccounts(plan);
  const names = list.map((x) => x.name);
  assert.equal(names.length, new Set(names).size);
});
