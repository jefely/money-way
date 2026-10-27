/**
 * xlsx 模板（4 张表）的往返：state → 表 → state。
 *
 * 样本是照着用户那份备份的形状手工造的：设置表里有分区行（A 资产/支出）和
 * 类型小计行（资产 + 期初合计），分期表每条占两行（本金 / 利息）——
 * 这两处最容易在解析时被当成账户或流水读进来。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, addAccount, addTransaction } from '../js/core/state-store.js';
import { createScheduled } from '../js/core/schema.js';
import { buildTemplateSheets, buildFlowSheet, buildSettingsSheet } from '../js/core/xlsx-template.js';
import {
  parseSettingsRows, parseFlowRows, parseFixedRows, parseInstRows, stateFromTemplate,
} from '../js/core/xlsx-template-read.js';

const SETTINGS = [
  ['账户设置'],
  ['简码', '序', '类型', '分类', '账户名称', '期初', '账单日', '还款日'],
  ['A 资产/支出', '', '', '', '', '', '', ' 转入增加，转出减少'],
  ['资产', '', '', '', '', 222.94, '', ''],
  ['ZHC', 1, '资产', '储蓄', '招行储7912', 22.94, '', ''],
  ['XJ', 2, '资产', '现金', '现金', 200, '', ''],
  ['费用', '', '', '', '', 0, '', ''],
  ['DT', 30, '费用', '通勤', '地铁', 0, '', ''],
];

const FLOW = [
  ['流水记录'],
  ['序', '日期', '转出账户', '转入账户', '金额', '备注'],
  [1, '2026-08-01', '交行储8380', '地铁', 2, ''],
  [2, '2026-08-01', '招行储7912', '现金', 5.5, ''],
];

const INST = [
  ['分期统计'],
  ['账户名称', '分期金额', '账单日', '还款日', '2026-08', '2026-09'],
  ['招行储7912', 3000, 17, 5, 1000, 1000],
  ['', '', '', '', 100, 100],
];

const FIXED = [
  ['固定收支'],
  ['序', '频率', '日期', '转出账户', '转入账户', '金额', '备注'],
  [1, '每月', 25, '现金', '地铁', 900, '房租'],
];

test('设置表：账户行读出，分区行与类型小计行跳过', () => {
  const rows = parseSettingsRows(SETTINGS);
  assert.equal(rows.length, 3, '只有 3 个真账户');
  assert.equal(rows[0].name, '招行储7912');
  assert.equal(rows[0].type, '资产类', '短名「资产」要还原成「资产类」');
  assert.equal(rows[0].opening, 22.94);
  assert.ok(!rows.some((r) => r.name === '资产' || String(r.name).startsWith('A ')));
});

test('流水表：前两行是标题与表头，日期/金额缺一不可', () => {
  const r = parseFlowRows(FLOW);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].date, '2026-08-01');
  assert.equal(r.items[0].amount, 2);

  const bad = parseFlowRows([
    ['流水记录'], ['序', '日期', '转出账户', '转入账户', '金额', '备注'],
    [1, '', '甲', '乙', 5, ''],
  ]);
  assert.equal(bad.items.length, 0);
  assert.equal(bad.skipped, 1);
});

test('分期表：两行合并成一条，期数/首月/利息从月份列推出来', () => {
  const rows = parseInstRows(INST);
  assert.equal(rows.length, 1, '利息行不能单独成条');
  assert.equal(rows[0].periods, 2);
  assert.equal(rows[0].firstMonth, '2026-08');
  assert.equal(rows[0].principal, 3000);
  assert.equal(rows[0].interest, 200);
  assert.equal(rows[0].billDay, 17);
  assert.equal(rows[0].repayDay, 5);
});

test('固定表：每月/每天、账户与金额', () => {
  const rows = parseFixedRows(FIXED);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].freq, 'monthly');
  assert.equal(rows[0].day, 25);
  assert.equal(rows[0].amount, 900);
});

test('重建 state：账户 + 期初流水 + 流水 + 固定 + 分期', () => {
  const built = stateFromTemplate({
    accounts: parseSettingsRows(SETTINGS),
    flow: parseFlowRows(FLOW),
    fixed: parseFixedRows(FIXED),
    inst: parseInstRows(INST),
  });

  const st = built.state;
  assert.equal(built.stats.accounts, 3);
  assert.equal(built.stats.transactions, 2);
  assert.equal(built.stats.fixed, 1);
  assert.equal(built.stats.inst, 1, '分期账户名这次能对上');

  // 3 个账户 + 期初虚拟账户；2 笔流水 + 2 笔期初流水
  assert.equal(st.accounts.length, 4);
  assert.equal(st.transactions.length, 4);
  assert.equal(st.transactions.filter((t) => t.opening).length, 2);
  assert.equal(st.scheduled.length, 2);
});

test('导出：流水表不含期初行，设置表带分区行与期初合计', () => {
  let s = createState();
  s = addAccount(s, { id: 'a1', code: 'ZHC', name: '现金', type: '资产类', category: '现金' });
  s = addAccount(s, { id: 'a2', code: 'DT', name: '地铁', type: '费用类', category: '通勤' });
  s = addTransaction(s, { date: '2026-08-01', from_id: 'a1', to_id: 'a2', amount: 3 });
  s.transactions.push({
    id: 'op1', date: '2000-01-01', from_id: '__OPENING__', to_id: 'a1',
    amount: 200, note: '期初', opening: true,
  });

  const nameOf = (id) => (s.accounts.find((a) => a.id === id) || {}).name || '';
  const flow = buildFlowSheet(s, nameOf);
  assert.equal(flow.length, 3, '标题 + 表头 + 1 笔；期初不写进流水表');
  assert.equal(flow[2][1], '2026-08-01');

  const settings = buildSettingsSheet(s);
  const labels = settings.map((r) => r[0]);
  assert.ok(labels.includes('A 资产/支出'), '分区行要写');
  assert.equal(settings.find((r) => r[0] === '资产')[5], 200, '类型行写期初合计');
});

test('buildTemplateSheets 出 4 张表，名字与顺序都固定', () => {
  const s = createState();
  const sheets = buildTemplateSheets(s, { nameOf: () => '', nowMonth: '2026-10' });
  assert.deepEqual(sheets.map((x) => x.name), ['流水', '设置', '分期', '固定']);
});
