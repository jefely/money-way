/**
 * 界面参数的归一化（normalize）
 *
 * 重点锁「列宽 / 对齐数组的补位」：这两项是按 COL_KEYS 下标存的逗号串，
 * 而 COL_KEYS 只在末尾追加过（from/to/note/out/iin/fixed/histBalance/up）。
 * 老存档里的短数组如果直接按下标取，缺的列会掉成 64px / 左对齐 ——
 * 升级后看起来就是「转出转入备注变窄、新列表头不居中」。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalize, COL_KEYS, DEFAULT_COL_WIDTHS, DEFAULT_COL_ALIGN,
  parseColWidths, parseAligns,
} from '../js/core/settings.js';

test('旧版 18 项对齐 → 补齐到 26 项，缺位用默认（中），已有值原样保留', () => {
  const legacy = '中,中,中,中,中,中,中,中,中,中,中,中,右,中,右,中,中,中';
  const n = normalize({ 列标行对齐: legacy }, 'dark');
  const arr = n['列标行对齐'].split(',');

  assert.equal(arr.length, COL_KEYS.length);
  assert.equal(arr[12], '右', 'balance 列的右对齐要保留');
  assert.equal(arr[14], '右', 'histOut 列的右对齐要保留');
  // 后 8 个是追加的新列，老存档里没有 → 必须是默认「中」，不能是「左」
  for (let i = 18; i < COL_KEYS.length; i += 1) {
    assert.equal(arr[i], '中', `${COL_KEYS[i]} 的缺位应补默认值`);
  }
});

test('旧版 11 项列宽 → 补齐到 26 项，缺位用默认宽度而不是 64', () => {
  const n = normalize({ 默认列宽: '44,84,72,76,64,100,96,40,64,64,64' }, 'dark');
  const arr = n['默认列宽'].split(',').map(Number);

  assert.equal(arr.length, COL_KEYS.length);
  assert.deepEqual(arr.slice(0, 11), [44, 84, 72, 76, 64, 100, 96, 40, 64, 64, 64]);

  const def = parseColWidths(DEFAULT_COL_WIDTHS);
  for (let i = 11; i < COL_KEYS.length; i += 1) {
    assert.equal(arr[i], def[i], `${COL_KEYS[i]} 的缺位应补默认 ${def[i]}px`);
  }
  // 具体到流水表：转出/转入/备注不能变成 64
  assert.equal(arr[COL_KEYS.indexOf('from')], 112);
  assert.equal(arr[COL_KEYS.indexOf('to')], 112);
  assert.equal(arr[COL_KEYS.indexOf('note')], 116);
});

test('齐全的数组原样保留（补位是幂等的）', () => {
  const full = DEFAULT_COL_WIDTHS;
  const n = normalize({ 默认列宽: full }, 'dark');
  assert.equal(n['默认列宽'], parseColWidths(full).join(','));

  const aligns = DEFAULT_COL_ALIGN;
  const m = normalize({ 列标行对齐: aligns }, 'dark');
  assert.equal(m['列标行对齐'], parseAligns(aligns).join(','));
});

test('空值走主题默认，不因为「没配过」而把列压成 64', () => {
  const n = normalize({}, 'dark');
  assert.equal(n['默认列宽'], parseColWidths(DEFAULT_COL_WIDTHS).join(','));
  assert.equal(n['列标行对齐'], parseAligns(DEFAULT_COL_ALIGN).join(','));
});
