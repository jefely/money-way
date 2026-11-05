/**
 * 分期「首月」输入：日期写法的识别口径。
 *
 * 回归：用户输入 261103（2026-11-03），旧实现按 YYYYMM 解成 2611-03；
 * 现在与单文件版一致 —— 前四位像年份才按 YYYYMM，否则按 YYMMDD。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMonthText } from '../js/ui/inst-add.js';

test('★ 261103 按 YYMMDD 解成 2026-11（不是 2611-03）', () => {
  assert.equal(parseMonthText('261103'), '2026-11');
});

test('6 位：YYYYMM 与 YYMMDD 按单文件版的口径区分', () => {
  assert.equal(parseMonthText('202611'), '2026-11');   // 前四位像年份 → YYYYMM
  assert.equal(parseMonthText('261103'), '2026-11');   // 2611 不像年份 → YYMMDD
  assert.equal(parseMonthText('260801'), '2026-08');   // YYMMDD
  assert.equal(parseMonthText('261303'), '');          // 13 月，拒绝
});

test('4 位：2611 → 2026-11；2026 → 2026-01', () => {
  assert.equal(parseMonthText('2611'), '2026-11');
  assert.equal(parseMonthText('2026'), '2026-01');
  assert.equal(parseMonthText('2099'), '2099-01');
});

test('8 位与带分隔符的完整日期', () => {
  assert.equal(parseMonthText('20261103'), '2026-11');
  assert.equal(parseMonthText('2026-11-03'), '2026-11');
  assert.equal(parseMonthText('2026/11/3'), '2026-11');
  assert.equal(parseMonthText('2026.11.03'), '2026-11');
  assert.equal(parseMonthText('26-11-03'), '2026-11');
  assert.equal(parseMonthText('2611-03'), '2026-11');
  assert.equal(parseMonthText('2026年11月3日'), '2026-11');
});

test('日期选择器给的两种值都能解析（month / date 输入）', () => {
  // <input type="month"> 的值
  assert.equal(parseMonthText('2026-11'), '2026-11');
  assert.equal(parseMonthText('2027-02'), '2027-02');
  // <input type="date"> 的值（Safari 不支持 month 时回退）
  assert.equal(parseMonthText('2026-11-01'), '2026-11');
  assert.equal(parseMonthText('2027-02-28'), '2027-02');
});

test('非法输入返回空串（交给调用方回落到当月）', () => {
  assert.equal(parseMonthText(''), '');
  assert.equal(parseMonthText('abc'), '');
  assert.equal(parseMonthText('26'), '');
  assert.equal(parseMonthText('9999-12'), '');
  assert.equal(parseMonthText('2026-13'), '');
});
