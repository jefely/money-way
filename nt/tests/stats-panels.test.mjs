/**
 * 统计口径：六类 × 4 列（用户《统计功能规划》2026-11）
 *
 * 分类汇总与节点汇总只差第一列，四列数值完全一致，
 * 所以这里既验 categoryStats 也验 nodeStats，且两者必须给出同一组数。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  categoryStats,
  nodeStats,
  statCells,
  STAT_COLS,
  STAT_ORDER,
} from '../js/core/stats-panels.js';

const accounts = [
  { id: 'a', name: '储蓄卡', type: '资产类', category: '储蓄' },
  { id: 'b', name: '微信', type: '资产类', category: '网络账户' },
  { id: 'z', name: '中转', type: '资产类', category: '其他' },
  { id: 'c', name: '电脑', type: '成本类', category: '设备' },
  { id: 'l', name: '信用卡', type: '负债类', category: '信用' },
  { id: 'l2', name: '溢缴卡', type: '负债类', category: '溢缴' },
  { id: 'i', name: '工资', type: '收入类', category: '工资' },
  { id: 'e', name: '餐饮', type: '费用类', category: '餐饮' },
  { id: 'dep', name: '折旧', type: '费用类', category: '折旧' },
];

const tx = (date, from_id, to_id, amount) => ({ date, from_id, to_id, amount });

const transactions = [
  // 储蓄卡：期初 1000，1 月支出 100 → 期初 900；2 月流入 500、流出 200 → 期末 1200
  tx('2026-01-01', 'opening', 'a', 1000),
  tx('2026-01-10', 'a', 'z', 100),
  tx('2026-02-05', 'z', 'a', 500),
  tx('2026-02-06', 'a', 'z', 200),
  // 微信：1 月充 20000、买电脑 10000 → 期初 10000（本期无进出）
  tx('2026-01-20', 'z', 'b', 20000),
  tx('2026-01-21', 'b', 'c', 10000),
  // 电脑（成本）：1 月建仓 10000；2 月折旧 2000 → 期末净值 8000
  tx('2026-02-20', 'c', 'dep', 2000),
  // 负债：1 月欠 1000；2 月新增 200、还 50 → 1150
  tx('2026-01-11', 'l', 'z', 1000),
  tx('2026-02-10', 'l', 'z', 200),
  tx('2026-02-11', 'z', 'l', 50),
  // 另一张负债卡：历史转入 1000、没有转出 —— 按应付口径是 -1000（多还）
  tx('2026-01-15', 'z', 'l2', 1000),
  tx('2026-02-13', 'z', 'l2', 100),
  tx('2026-02-14', 'l2', 'z', 30),
  // 收入：2 月收入 500、退回 20 → 期末累计 480
  tx('2026-02-05', 'i', 'z', 500),
  tx('2026-02-12', 'z', 'i', 20),
  // 费用：1 月花 150、退回 30（都进历史累计）；2 月花 200、退回 10
  tx('2026-01-05', 'z', 'e', 150),
  tx('2026-01-08', 'e', 'z', 30),
  tx('2026-02-06', 'z', 'e', 200),
  tx('2026-02-12', 'e', 'z', 10),
];

const range = { start: '2026-02-01', end: '2026-02-28' };

function row(groups, type, key) {
  const g = groups.find((x) => x.type === type);
  return g && g.rows.find((r) => r.key === key);
}

function group(groups, type) {
  return groups.find((x) => x.type === type);
}

test('收入：期初累计 / 本期收入 / 本期退回 / 期末累计', () => {
  const w = row(categoryStats(accounts, transactions, range), '收入类', '工资');
  assert.deepEqual({ ...w }, { key: '工资', count: 1, c1: 0, c2: 500, c3: 20, c4: 480 });
});

test('负债：期初余额 / 本期新增（转出）/ 本期偿还（转入）/ 期末余额', () => {
  const l = row(categoryStats(accounts, transactions, range), '负债类', '信用');
  assert.equal(l.c1, 1000);
  assert.equal(l.c2, 200);
  assert.equal(l.c3, 50);
  assert.equal(l.c4, 1150);
});

test('负债转入大于转出时余额为负（多还），不硬掰成正欠款', () => {
  const l = row(categoryStats(accounts, transactions, range), '负债类', '溢缴');
  assert.equal(l.c1, -1000);
  assert.equal(l.c2, 30);
  assert.equal(l.c3, 100);
  assert.equal(l.c4, -1070);
});

test('资产：期初余额 / 本期流入 / 本期流出 / 期末余额', () => {
  const a = row(categoryStats(accounts, transactions, range), '资产类', '储蓄');
  assert.equal(a.c1, 900);
  assert.equal(a.c2, 500);
  assert.equal(a.c3, 200);
  assert.equal(a.c4, 1200);
});

test('费用：历史累计 = 到本期开始前的转入 − 转出（历史退回也要扣）', () => {
  const e = row(categoryStats(accounts, transactions, range), '费用类', '餐饮');
  // 1 月花 150、退回 30 → 历史累计 120；2 月的 200/10 只进本期三个数。
  // 如果算到本期结束，这里会是 310 —— 这条断言就是为了钉住「开始前」。
  assert.equal(e.c1, 120);
  assert.equal(e.c2, 200);
  assert.equal(e.c3, 10);
});

test('费用：递推成立 —— 下期历史累计 = 本期历史累计 + 本期净出', () => {
  const feb = row(categoryStats(accounts, transactions, range), '费用类', '餐饮');
  const march = row(
    categoryStats(accounts, transactions, { start: '2026-03-01', end: '2026-03-31' }),
    '费用类',
    '餐饮',
  );
  assert.equal(march.c1, feb.c1 + feb.c4, '3 月累计 = 2 月的 120 + 2 月净出 190');
  assert.equal(march.c1, 310);
});

test('费用：第 4 列是本期净出，不是期末余额', () => {
  const e = row(categoryStats(accounts, transactions, range), '费用类', '餐饮');
  assert.equal(e.c4, 190, '净出 = 本期支出 200 − 本期退回 10');
});

test('成本：期初净值 / 本期新增 / 本期消耗 / 期末净值', () => {
  const c = row(categoryStats(accounts, transactions, range), '成本类', '设备');
  assert.equal(c.c1, 10000, '期初净值 = 1 月建仓 10000');
  assert.equal(c.c2, 0, '本期没有新买入');
  assert.equal(c.c3, 2000, '本期消耗 = 折旧');
  assert.equal(c.c4, 8000);
});

test('六类的顺序固定为 收入 / 负债 / 权益 / 资产 / 费用 / 成本', () => {
  assert.deepEqual(STAT_ORDER, ['收入类', '负债类', '权益类', '资产类', '费用类', '成本类']);
  const got = categoryStats(accounts, transactions, range).map((g) => g.type);
  const expect = STAT_ORDER.filter((t) => got.includes(t));
  assert.deepEqual(got, expect);
  assert.equal(got[0], '收入类');
});

test('每类合计 = 该类各行相加（不另算一套口径）', () => {
  for (const g of categoryStats(accounts, transactions, range)) {
    for (const k of ['c1', 'c2', 'c3', 'c4']) {
      const sum = g.rows.reduce((n, r) => n + r[k], 0);
      assert.ok(Math.abs(g.total[k] - sum) < 0.005, `${g.type} 的 ${k} 合计对不上`);
    }
  }
});

test('全零分类不出表：整类都是 0 时连表都不占一张', () => {
  const onlyAsset = [{ id: 'a', name: '储蓄卡', type: '资产类', category: '储蓄' }];
  assert.equal(categoryStats(onlyAsset, [], range).length, 0, '没有任何流水时一张表都不出');
});

test('同组里有零有非零时，只出非零的那几行', () => {
  const accs = [
    { id: 'a1', name: '甲', type: '资产类', category: '有数' },
    { id: 'a2', name: '乙', type: '资产类', category: '空的' },
  ];
  const txs = [tx('2026-02-05', 'z', 'a1', 100)];
  const g = categoryStats(accs, txs, range).find((x) => x.type === '资产类');
  assert.deepEqual(g.rows.map((r) => r.key), ['有数']);
  assert.equal(g.total.c4, 100, '合计只加有数的那一行');
});

test('节点汇总：第一列是节点名，四列数值与分类口径逐项一致', () => {
  const byNode = nodeStats(accounts, transactions, range);
  const a = row(byNode, '资产类', '储蓄卡');
  const byCat = row(categoryStats(accounts, transactions, range), '资产类', '储蓄');
  for (const k of ['c1', 'c2', 'c3', 'c4']) {
    assert.equal(a[k], byCat[k], `${k} 应一致`);
  }
  assert.equal(a.c4, 1200);
  // 同为「资产类」，网络账户那一行单独成行
  assert.ok(row(byNode, '资产类', '微信'));
});

test('每类 4 列的表头各不相同，且费用没有「期末」', () => {
  assert.deepEqual(STAT_COLS.资产类, ['期初余额', '本期流入', '本期流出', '期末余额']);
  assert.deepEqual(STAT_COLS.费用类, ['历史累计', '本期支出', '本期退回', '本期净出']);
  assert.equal(STAT_COLS.负债类[1], '本期新增');
  assert.equal(STAT_COLS.负债类[2], '本期偿还');
  assert.equal(STAT_COLS.收入类[0], '期初累计');
  assert.equal(STAT_COLS.成本类[3], '期末净值');
  assert.ok(!STAT_COLS.费用类.includes('期末余额'));
});

test('statCells：A 极与 B 极方向相反，费用同 A 极、只差第 4 列', () => {
  const s = { periodIn: 100, periodOut: 30, historyIn: 1000, historyOut: 400 };
  // B 极（负债）：增 = 转出、减 = 转入
  assert.deepEqual(statCells(s, '负债类'), { c1: -600, c2: 30, c3: 100, c4: -670 });
  // A 极（资产）：增 = 转入、减 = 转出，第 4 列 = 期初 + 增 − 减
  assert.deepEqual(statCells(s, '资产类'), { c1: 600, c2: 100, c3: 30, c4: 670 });
  // 费用：前 3 列与资产完全一致，第 4 列只报本期净出（不含历史累计）
  assert.deepEqual(statCells(s, '费用类'), { c1: 600, c2: 100, c3: 30, c4: 70 });
  // 成本与资产同口径
  assert.deepEqual(statCells(s, '成本类'), statCells(s, '资产类'));
});
