/**
 * 统计与查询的核心纯函数测试。
 *
 * 锁死三件容易写错的事：
 *   ① 余额方向（资产/费用 = 入增加；其余 = 出增加）
 *   ② 区间三列口径（当前结余不随区间变；区间/历史互斥且互补）
 *   ③ 分类聚合的合计必须等于逐账户相加
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  accountSummary,
  categoryGroups,
  accountRows,
  summariesForAccounts,
  STAT_TYPE_ORDER,
} from '../js/core/ledger-stats.js';
import { filterTransactions, queryTotals, matchAccount } from '../js/core/query-engine.js';

const ACC = {
  bank: { id: 'a1', code: 'ZHC', name: '招行储', type: '资产类', category: '储蓄' },
  food: { id: 'a2', code: 'CY', name: '餐饮', type: '费用类', category: '餐饮' },
  card: { id: 'a3', code: 'XY', name: '信卡', type: '负债类', category: '信用' },
  salary: { id: 'a4', code: 'GZ', name: '工资', type: '收入类', category: '工资' },
  opening: { id: '__OPENING__', name: '期初余额', type: '权益类', category: '', isHidden: true },
};

const TX = [
  { from_id: '__OPENING__', to_id: 'a1', amount: 1000, date: '2000-01-01', opening: true },
  { from_id: 'a4', to_id: 'a1', amount: 800, date: '2026-01-05' },
  { from_id: 'a1', to_id: 'a2', amount: 200, date: '2026-02-10' },
  { from_id: 'a1', to_id: 'a3', amount: 300, date: '2026-02-20' },
];

const FEB = { start: '2026-02-01', end: '2026-02-28' };

test('余额方向：资产类 = 转入 − 转出，费用类同向', () => {
  const bank = accountSummary(ACC.bank, TX);
  assert.equal(bank.balance, 1300, '资产：1800 进 − 500 出 = 1300');
  assert.equal(bank.periodIn, 1800);
  assert.equal(bank.periodOut, 500);
  assert.equal(bank.opening, 1000, '期初流水应被识别出来');

  const food = accountSummary(ACC.food, TX);
  assert.equal(food.balance, 200);
});

test('余额方向：负债类 = 转出 − 转入（还款让欠款变负）', () => {
  const card = accountSummary(ACC.card, TX);
  assert.equal(card.balance, -300, '负债收到还款 300，余额 −300');
});

test('区间口径：当前结余不随区间变，转出/转入与历史互补', () => {
  const all = accountSummary(ACC.bank, TX);
  const feb = accountSummary(ACC.bank, TX, FEB);

  assert.equal(feb.balance, all.balance, '当前结余永远是「现在」的余额');
  assert.equal(feb.periodOut, 500);
  assert.equal(feb.periodIn, 0, '2 月没有转入');
  assert.equal(feb.historyIn, 1800, '2 月之前的转入：期初 1000 + 工资 800');
  assert.equal(feb.historyOut, 0);

  // 互补：区间 + 历史 = 全部
  assert.equal(feb.periodOut + feb.historyOut, all.periodOut);
  assert.equal(feb.periodIn + feb.historyIn, all.periodIn);
});

/* ---------- 历史结余（汇总表 / 分类统计的最后一列） ---------- */

test('历史结余 = 区间起点那一刻的余额（资产类 = 历史入 − 历史出）', () => {
  const feb = accountSummary(ACC.bank, TX, FEB);
  // 2 月之前：期初 1000 + 工资 800 = 1800 进，0 出
  assert.equal(feb.historyBalance, 1800);

  // 负债类方向相反：2 月之前没有流水 → 0
  assert.equal(accountSummary(ACC.card, TX, FEB).historyBalance, 0);
});

test('历史结余 + 区间净额 = 当前余额（口径自洽）', () => {
  const feb = accountSummary(ACC.bank, TX, FEB);
  const periodNet = feb.periodIn - feb.periodOut;   // 资产类方向
  assert.equal(feb.historyBalance + periodNet, feb.balance);

  const food = accountSummary(ACC.food, TX, FEB);
  assert.equal(food.historyBalance + (food.periodIn - food.periodOut), food.balance);
});

test('全部区间（无 start）时历史结余为 0 —— 「之前」是空的', () => {
  const all = accountSummary(ACC.bank, TX);
  assert.equal(all.historyBalance, 0);
  assert.equal(all.historyOut, 0);
  assert.equal(all.historyIn, 0);
});

test('分类聚合也带历史结余，且合计 = 各账户相加', () => {
  const groups = categoryGroups(Object.values(ACC), TX, FEB);
  const sumGroups = groups.reduce((n, g) => n + g.total.historyBalance, 0);
  const sumRows = accountRows(Object.values(ACC), TX, FEB)
    .reduce((n, r) => n + r.s.historyBalance, 0);
  assert.equal(sumGroups, sumRows);
});

test('隐藏账户不参与统计，但期初流水仍算进对手账户', () => {
  const rows = summariesForAccounts(Object.values(ACC), TX);
  const ids = rows.map((r) => r.acc.id);
  assert.ok(!ids.includes('__OPENING__'), '期初虚拟账户不该出现在统计里');
  assert.equal(rows.length, 4);
});

test('分类视图：每个分类的合计 = 它下面账户逐笔相加；每类型合计 = 分类相加', () => {
  const groups = categoryGroups(Object.values(ACC), TX);

  const asset = groups.find((g) => g.type === '资产类');
  assert.ok(asset, '应有资产类分组');
  assert.equal(asset.categories.length, 1);
  assert.equal(asset.categories[0].category, '储蓄');
  assert.equal(asset.categories[0].balance, 1300);
  assert.equal(asset.total.balance, 1300);

  const expense = groups.find((g) => g.type === '费用类');
  assert.equal(expense.total.balance, 200);

  // 所有分组合计相加 = 全部可见账户余额相加
  const sumGroups = groups.reduce((n, g) => n + g.total.balance, 0);
  const sumRows = accountRows(Object.values(ACC), TX)
    .reduce((n, r) => n + r.s.balance, 0);
  assert.equal(sumGroups, sumRows, '分类合计与账户合计必须一致');
});

test('汇总视图：按 资产 → 负债 → 收入 → 权益 → 费用 排序', () => {
  const rows = accountRows(Object.values(ACC), TX);
  const types = rows.map((r) => r.acc.type);
  const idx = types.map((t) => STAT_TYPE_ORDER.indexOf(t));
  for (let i = 1; i < idx.length; i += 1) {
    assert.ok(idx[i - 1] <= idx[i], `类型顺序错了：${types.join(' / ')}`);
  }
  assert.equal(types[0], '资产类');
});

/* ---------- 查询 ---------- */

const labelOf = (id) => {
  const a = Object.values(ACC).find((x) => x.id === id);
  return a ? a.name : '';
};

test('查询：空条件返回全部，条件之间是「与」', () => {
  assert.equal(filterTransactions(TX, {}, labelOf).length, 4);

  const byMonth = filterTransactions(TX, { dateFrom: '2026-02-01', dateTo: '2026-02-28' }, labelOf);
  assert.equal(byMonth.length, 2);

  const byAmount = filterTransactions(TX, { amount: '200' }, labelOf);
  assert.equal(byAmount.length, 1);
  assert.equal(byAmount[0].note, undefined);

  const byFrom = filterTransactions(TX, { from: '招行' }, labelOf);
  assert.equal(byFrom.length, 2, '转出方是招行储的两笔');

  const byNote = filterTransactions(TX, { note: '不存在' }, labelOf);
  assert.equal(byNote.length, 0);
});

test('查询小计：笔数与金额', () => {
  const hits = filterTransactions(TX, { dateFrom: '2026-02-01', dateTo: '2026-02-28' }, labelOf);
  const t = queryTotals(hits);
  assert.equal(t.count, 2);
  assert.equal(t.sum, 500);
});

/* ---------- 账户筛选：简码也要认 ---------- */

test('matchAccount：全名包含 / 简码相等 / 简码包含都算命中', () => {
  const acc = { name: '招行储7912', code: 'ZHC' };
  assert.equal(matchAccount(acc, '招行'), true, '全名片段');
  assert.equal(matchAccount(acc, 'ZHC'), true, '简码原样');
  assert.equal(matchAccount(acc, 'zhc'), true, '简码不区分大小写');
  assert.equal(matchAccount(acc, 'ZH'), true, '简码前缀');
  assert.equal(matchAccount(acc, 'XJ'), false, '别的简码不该命中');
  assert.equal(matchAccount(null, 'ZHC'), false);
  assert.equal(matchAccount(acc, ''), true, '空条件不过滤');
});

test('filterTransactions：传账户对象时能用简码筛（查询页就是这么用的）', () => {
  const accs = {
    a1: { name: '招行储', code: 'ZHC' },
    a2: { name: '餐饮', code: 'CY' },
    a3: { name: '信卡', code: 'XY' },
    a4: { name: '工资', code: 'GZ' },
  };
  const accOf = (id) => accs[id] || null;

  const byCode = filterTransactions(TX, { from: 'ZHC' }, accOf);
  assert.equal(byCode.length, 2, '招行储作为转出的两笔');

  const byName = filterTransactions(TX, { from: '招行' }, accOf);
  assert.equal(byName.length, 2, '全名片段也要能用');

  const none = filterTransactions(TX, { from: 'XJ' }, accOf);
  assert.equal(none.length, 0);
});
