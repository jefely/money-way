import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLifeVein, rulerMarks, vdayAt, calendarDayAt } from '../js/core/lifevein-model.js';
import { bubbleRadius } from '../js/core/bubble-motion.js';
import { assembleScene } from '../js/core/bubble-scene.js';
import { normalize } from '../js/core/settings.js';

function sparse() {
  const accounts = [
    { id: 'a', name: '储蓄', type: '资产类' },
    { id: 'f', name: '餐饮', type: '费用类', category: '日常' },
  ];
  const tx = [14, 22, 31].map((d, i) => ({
    id: 't' + i, seq: i, date: '2026-08-' + String(d).padStart(2, '0'),
    from_id: 'a', to_id: 'f', amount: 10,
  }));
  return buildLifeVein({ accounts, transactions: tx }, '2026-09-05');
}

test('空档压短后仍按日历日标尺，不把 14、22 标成相邻的一天', () => {
  const m = sparse();
  const px = 80;
  const v0 = vdayAt(m, 0);
  const v1 = vdayAt(m, 17);
  const marks = rulerMarks(m, v0 - 0.2, v1 + 0.2, px);
  const labels = marks.map((x) => x.label);
  assert.ok(labels.includes('14'), labels.join(','));
  assert.ok(labels.includes('15'), labels.join(','));
  assert.ok(labels.includes('22'), labels.join(','));
  assert.ok(!labels.includes('14–22') || px < 14);
  const days = marks.filter((x) => !x.span).map((x) => x.label);
  for (let n = 14; n <= 22; n += 1) assert.ok(days.includes(String(n)), '缺 ' + n + ' ' + days.join(','));
});

test('压得比 14px 还密时，标成区间而不是假的逐日刻度', () => {
  const m = sparse();
  const marks = rulerMarks(m, vdayAt(m, 0) - 0.1, vdayAt(m, 17) + 0.1, 2);
  assert.ok(marks.some((x) => x.span && x.label.includes('–')), marks.map((x) => x.label).join(','));
  assert.equal(marks.some((x) => x.label === '15'), false);
});

test('连续有流水的日子，默认间距下一天一个数', () => {
  const accounts = [
    { id: 'a', name: '储蓄', type: '资产类' },
    { id: 'f', name: '餐饮', type: '费用类', category: '日常' },
  ];
  const tx = [];
  for (let d = 1; d <= 10; d += 1) {
    tx.push({ id: 't' + d, seq: d, date: '2026-08-' + String(d).padStart(2, '0'), from_id: 'a', to_id: 'f', amount: 5 });
  }
  const m = buildLifeVein({ accounts, transactions: tx }, '2026-08-12');
  const marks = rulerMarks(m, -0.2, m.vspan + 0.2, 40);
  const labels = marks.map((x) => x.label);
  for (let n = 1; n <= 10; n += 1) assert.ok(labels.includes(String(n)), labels.join(','));
  assert.ok(Math.abs(vdayAt(m, calendarDayAt(m, 3)) - 3) < 0.02);
});

test('旧的倍率 1 升成 100%，已是百分数的不再乘', () => {
  const old = normalize({ 脉络倍率1: 1, 脉络倍率10: 1.5, 脉络倍率100: 100 }, 'dark');
  assert.equal(old['脉络倍率1'], 100);
  assert.equal(old['脉络倍率10'], 150);
  assert.equal(old['脉络倍率100'], 150);
  const again = normalize(old, 'dark');
  assert.equal(again['脉络倍率1'], 100);
  assert.equal(again['脉络倍率10'], 150);
});

test('直径上下限在分档之后，0 元仍然是哨兵半径，余额为 0 不画节点', () => {
  const plain = bubbleRadius(1) * 2;
  const floored = bubbleRadius(1, { dMin: 40 }) * 2;
  assert.ok(floored >= 40 && floored < plain + 40);
  assert.equal(bubbleRadius(0, { dMin: 40 }), 2);
  assert.ok(bubbleRadius(100, { dMin: 10, dMax: 30, dMaxOn: '1' }) * 2 <= 30);
  assert.ok(bubbleRadius(100000) > bubbleRadius(10000));
  const rs = [1, 10, 100, 1000].map((n) => bubbleRadius(n, { mults: [1, 1, 1, 1, 1, 1, 1], dMin: 20, dMax: 80, dMaxOn: '开' }));
  for (let i = 1; i < rs.length; i += 1) assert.ok(rs[i] + 1e-6 >= rs[i - 1]);
  const accounts = [
    { id: 'bank', name: '储蓄卡', type: '资产类' },
    { id: 'food', name: '餐饮', type: '费用类', category: '日常' },
  ];
  const m = buildLifeVein({
    accounts,
    transactions: [{ id: 'z', seq: 1, date: '2026-08-02', from_id: 'bank', to_id: 'food', amount: 50 }],
  }, '2026-08-03');
  const before = assembleScene(m, { scrollDay: -5, ppd: 80, width: 360, height: 700, dMin: 80 });
  assert.equal(before.asset.some((b) => b.id === 'bank'), false);
});

test('最小直径大于最大直径时，打开上限后两者对齐', () => {
  const s = normalize({ 脉络最小直径: 200, 脉络最大直径: 40, 脉络限制最大直径: '开' }, 'dark');
  assert.equal(s['脉络最大直径'], 200);
  assert.ok(s['脉络倍率10万'] >= s['脉络倍率1']);
});
