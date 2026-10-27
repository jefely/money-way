/**
 * 日期筛选框：260801 / 2608 / 26 / 260801-260807
 * 口径照单文件版的 qParseRange（年份按 20YY 展开）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDateRange, expandStart, expandEnd, dateInRange } from '../js/core/date-query.js';

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
