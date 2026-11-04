/**
 * 分期月份列：自动收掉空月，删掉的月份不再出现。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spanOf, cellsOf, MAX_MONTHS } from '../js/core/installment-cells.js';

const rows = [{
  inst: {
    cells: {
      '2026-08': { p: 10, i: 1 },
      '2026-10': { p: 10, i: 1 },
    },
  },
}];

test('没有手填范围时，空的未来月不占列，中间月保留', () => {
  assert.deepEqual(spanOf(rows, null, '2026-11'), ['2026-08', '2026-09', '2026-10']);
});

test('点过删除的月份不再出现', () => {
  assert.deepEqual(spanOf(rows, null, '2026-11', ['2026-09']), ['2026-08', '2026-10']);
});

/**
 * 回归（2026-11 用户实测「添加的分期月份全空」）：
 * 旧分期从 2021-11 开始，新加的一条从 2026-11 开始。
 * 旧实现从最早月份数 60 格，正好停在 2026-10，新记录的所有格子落在窗口外
 * —— 表格里只剩名字和金额，月份一列都没有。
 */
test('★ 新加的分期必须在月份窗口里（旧记录开始得早也不许被挤掉）', () => {
  const oldRow = { inst: { periods: 12, firstMonth: '2021-11', principal: 3000, interest: 300 } };
  const newRow = { inst: { periods: 12, firstMonth: '2026-11', principal: 12000, interest: 720 } };

  const span = spanOf([oldRow, newRow], null, '2026-11');
  assert.equal(span.length <= MAX_MONTHS, true);
  assert.ok(span.includes('2026-11'), `窗口末尾必须包含新分期的首月：${span[0]} … ${span.at(-1)}`);
  assert.ok(span.includes('2027-10'), `新分期的最后一期也要在：${span[0]} … ${span.at(-1)}`);

  // 新记录的 12 个月份格里，应全部能在这张表里找到对应列
  const newMonths = Object.keys(cellsOf(newRow));
  assert.equal(newMonths.filter((m) => span.includes(m)).length, 12);
});

test('★ 超过上限时保留最新的一头（否则新记录整条空白）', () => {
  // 用一条 2000-01 的旧记录把窗口起点拉到很早
  const oldRow = { inst: { cells: { '2000-01': { p: 1, i: 0 } } } };
  const newRow = { inst: { periods: 1, firstMonth: '2030-01', principal: 100 } };
  const span = spanOf([oldRow, newRow], null, '2030-01');

  assert.equal(span.length, MAX_MONTHS);
  assert.equal(span.at(-1), '2030-01');
  assert.equal(span[0], '2020-02');   // 120 个月，倒着数到 2030-01
  assert.ok(span.includes('2030-01'));
});

