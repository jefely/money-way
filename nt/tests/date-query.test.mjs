/**
 * 日期筛选框：260801 / 2608 / 26 / 260801-260807
 * 口径照单文件版的 qParseRange（年份按 20YY 展开）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDateRange, expandStart, expandEnd, dateInRange, compactDate, weekOf } from '../js/core/date-query.js';

test('单日：260801 → 当天', () => {
  assert.deepEqual(parseDateRange('260801'), { from: '2026-08-01', to: '2026-08-01' });
});

test('区间：260801-260807（横线、~、— 都认）', () => {
  const want = { from: '2026-08-01', to: '2026-08-07' };
  assert.deepEqual(parseDateRange('260801-260807'), want);
  assert.deepEqual(parseDateRange('260801~260807'), want);
  assert.deepEqual(parseDateRange('260801—260807'), want);
  assert.deepEqual(parseDateRange('260801 到 260807'), want);
});

test('整月 2608 / 整年 26 展开成首末日', () => {
  assert.deepEqual(parseDateRange('2608'), { from: '2026-08-01', to: '2026-08-31' });
  assert.deepEqual(parseDateRange('2602'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(parseDateRange('26'), { from: '2026-01-01', to: '2026-12-31' });
});

test('8 位也认；认不出的返回 null', () => {
  assert.deepEqual(parseDateRange('20260801'), { from: '2026-08-01', to: '2026-08-01' });
  assert.equal(parseDateRange(''), null);
  assert.equal(parseDateRange('abc'), null);
});

test('dateInRange：落在区间内才命中，认不出的条件不过滤', () => {
  assert.equal(dateInRange('2026-08-03', '260801-260807'), true);
  assert.equal(dateInRange('2026-08-08', '260801-260807'), false);
  assert.equal(dateInRange('2026-08-03', '2608'), true);
  assert.equal(dateInRange('2026-09-01', '2608'), false);
  assert.equal(dateInRange('2026-08-03', ''), true);
});

test('expandStart / expandEnd 单独可用', () => {
  assert.equal(expandStart('2608'), '2026-08-01');
  assert.equal(expandEnd('2608'), '2026-08-31');
  assert.equal(expandStart('261231'), '2026-12-31');
});

/* ---------- 查询面板的默认日期（2026-11-07 用户） ----------
   A 今天 / B 本日所在那周（周一~周日）/ C 本月。
   这里锁的是「文本 → 区间」这条链：写法必须能被 parseDateRange 认回来。 */

test('compactDate：ISO → 筛选框短写法', () => {
  assert.equal(compactDate('2026-08-01'), '260801');
  assert.equal(compactDate('2026-11-07'), '261107');
  assert.equal(compactDate('20261107'), '', '不是 ISO 就返回空串');
  assert.equal(compactDate(''), '');
});

test('weekOf：周一为一周之首，跨年也对', () => {
  assert.deepEqual(weekOf('2026-11-07'), { from: '2026-11-02', to: '2026-11-08' });
  // 2026-11-02 本身是周一
  assert.deepEqual(weekOf('2026-11-02'), { from: '2026-11-02', to: '2026-11-08' });
  // 2026-11-08 是周日，仍属同一周
  assert.deepEqual(weekOf('2026-11-08'), { from: '2026-11-02', to: '2026-11-08' });
  // 2027-01-01 是周五 → 2026-12-28 ~ 2027-01-03
  assert.deepEqual(weekOf('2027-01-01'), { from: '2026-12-28', to: '2027-01-03' });
  assert.equal(weekOf('不是日期'), null);
});

test('三段默认日期都能被 parseDateRange 认回来', () => {
  const iso = '2026-11-07';
  const day = parseDateRange(compactDate(iso));
  assert.deepEqual(day, { from: '2026-11-07', to: '2026-11-07' });

  const w = weekOf(iso);
  const weekText = compactDate(w.from) + '-' + compactDate(w.to);
  assert.equal(weekText, '261102-261108');
  assert.deepEqual(parseDateRange(weekText), { from: '2026-11-02', to: '2026-11-08' });

  const monthText = iso.slice(2, 4) + iso.slice(5, 7);
  assert.equal(monthText, '2611');
  assert.deepEqual(parseDateRange(monthText), { from: '2026-11-01', to: '2026-11-30' });
});
