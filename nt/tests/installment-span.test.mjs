/**
 * 分期月份列：自动收掉空月，删掉的月份不再出现。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spanOf } from '../js/core/installment-cells.js';

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
