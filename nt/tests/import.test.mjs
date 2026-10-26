/**
 * 导入解析器测试。
 *
 * 这是"能不能把真实数据灌进来"的第一道关：解析错一行，账就错一笔。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseImportText, splitCells, normalizeDate, defaultAccountPatch,
} from '../js/core/import-parser.js';

test('分隔符：Tab / 逗号 / 竖线 / 双空格 都能切', () => {
  assert.deepEqual(splitCells('a\tb\tc'), ['a', 'b', 'c']);
  assert.deepEqual(splitCells('a,b,c'), ['a', 'b', 'c']);
  assert.deepEqual(splitCells('a|b|c'), ['a', 'b', 'c']);
  assert.deepEqual(splitCells('a  b  c'), ['a', 'b', 'c']);
});

test('日期：四种写法都能认', () => {
  assert.equal(normalizeDate('2026-08-20'), '2026-08-20');
  assert.equal(normalizeDate('260820'), '2026-08-20');
  assert.equal(normalizeDate('20260820'), '2026-08-20');
  assert.equal(normalizeDate('26-08-20'), '2026-08-20');
});

test('日期：不存在的日子要拒掉', () => {
  assert.equal(normalizeDate('260230'), '', '2 月 30 日不存在');
  assert.equal(normalizeDate('261332'), '', '13 月不存在');
  assert.equal(normalizeDate('乱写'), '');
});

test('★ 基本导入：Tab 分隔三行', () => {
  const txt = [
    '260820\t招行储\t餐饮\t128.50\t午饭',
    '260821\t现金\t餐饮\t36.00\t早饭',
    '260822\t招行储\t现金\t500\t取现',
  ].join('\n');

  const r = parseImportText(txt);
  assert.equal(r.rows.length, 3);
  assert.equal(r.errors.length, 0);
  assert.equal(r.rows[0].date, '2026-08-20');
  assert.equal(r.rows[0].from, '招行储');
  assert.equal(r.rows[0].amount, 128.5);
  assert.equal(r.rows[0].note, '午饭');
});

test('★ 账户汇总：同一个账户出现多次只统计一次', () => {
  const txt = [
    '260820\t招行储\t餐饮\t10',
    '260821\t招行储\t现金\t20',
    '260822\t现金\t餐饮\t30',
  ].join('\n');
  const r = parseImportText(txt);
  const bank = r.accounts.find((a) => a.display === '招行储');
  const food = r.accounts.find((a) => a.display === '餐饮');
  assert.equal(bank.count, 2);
  assert.equal(food.count, 2);
  assert.equal(r.accounts.length, 3, '招行储 / 餐饮 / 现金');
});

test('表头会被跳过（不产生错误行）', () => {
  const txt = [
    '日期\t转出\t转入\t金额\t备注',
    '260820\t招行储\t餐饮\t128.50\t午饭',
  ].join('\n');
  const r = parseImportText(txt);
  assert.equal(r.rows.length, 1);
  assert.equal(r.errors.length, 0);
});

test('空行与 # 注释被忽略', () => {
  const txt = '260820\tA\tB\t10\n\n# 这是注释\n260821\tA\tB\t20\n';
  const r = parseImportText(txt);
  assert.equal(r.rows.length, 2);
  assert.equal(r.errors.length, 0);
});

test('错误行要带行号与原因，且不影响其它行', () => {
  const txt = [
    '260820\tA\tB\t10',        // 行 1 正常
    '2602xx\tA\tB\t20',        // 行 2 日期坏
    '260822\tA\tB\tabc',       // 行 3 金额坏
    '260823\tA\tB\t30',        // 行 4 正常
  ].join('\n');
  const r = parseImportText(txt);
  assert.equal(r.rows.length, 2);
  assert.equal(r.errors.length, 2);
  assert.equal(r.errors[0].line, 2);
  assert.match(r.errors[0].message, /日期/);
  assert.equal(r.errors[1].line, 3);
  assert.match(r.errors[1].message, /金额/);
});

test('金额：带 ¥ 和千分位也能认', () => {
  const r = parseImportText('260820\tA\tB\t¥1,234.56\t');
  assert.equal(r.rows[0].amount, 1234.56);
});

test('单边流水：只有转出也算有效行', () => {
  const r = parseImportText('260820\t招行储\t\t100');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].from, '招行储');
  assert.equal(r.rows[0].to, '');
});

test('两边都空 → 报错', () => {
  const r = parseImportText('260820\t\t\t100');
  assert.equal(r.rows.length, 0);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /不能都为空/);
});

test('备注里带空格不会被切开（CSV 用逗号时）', () => {
  const r = parseImportText('2026-08-20,招行储,餐饮,128.50,中午吃了 一顿饭');
  assert.equal(r.rows[0].note, '中午吃了 一顿饭');
});

test('stats 对得上', () => {
  const txt = '260820\tA\tB\t10\nbad\tC\tD\t20';
  const r = parseImportText(txt);
  assert.equal(r.stats.ok, 1);
  assert.equal(r.stats.bad, 1);
  assert.equal(r.stats.total, 2);
});

test('defaultAccountPatch：没简码时自动造一个', () => {
  const p = defaultAccountPatch('招行储');
  assert.equal(p.name, '招行储');
  assert.equal(p.code.length >= 2, true);
  assert.equal(p.type, '资产类');
  assert.equal(p.category, '未分类');
});

test('纯函数：解析两次结果一致，且不修改输入', () => {
  const txt = '260820\t招行储\t餐饮\t128.50\t午饭';
  const a = parseImportText(txt);
  const b = parseImportText(txt);
  assert.deepEqual(a.rows, b.rows);
  assert.equal(txt, '260820\t招行储\t餐饮\t128.50\t午饭');
});
