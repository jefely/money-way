/**
 * 列宽压缩 / 拖动上限的纯计算（core/table-fit.js）
 *
 * 这两条是「节点设置压进一屏」「拖动拖不出横滑」的全部算术，
 * 锁住它们就不用靠截图判断：
 *   ① 够宽时一个像素都不动（否则每次布局都会漂）
 *   ② 压的时候先按 caps（手机够用宽度）封顶，不是一上来就等比缩
 *   ③ caps 都放不下才等比缩，且不低于下限
 *   ④ 拖动上限 = 这一列现在的宽度 + 吃剩余那列的余量
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { fitWidths, maxDragWidth } from '../js/core/table-fit.js';

test('够宽：返回 null（调用方据此摘掉覆盖，回到参数值）', () => {
  assert.equal(fitWidths([64, 44, 72], [40, 24, 46], 300, 28), null);
  assert.equal(fitWidths([], [], 300, 28), null);
  // 恰好等于预算也算够宽
  assert.equal(fitWidths([64, 44, 72], [40, 24, 46], 180, 28), null);
});

test('压的时候按 caps 封顶，不是等比缩', () => {
  // 参数 64/44/72/76/110，手机够用 42/24/46/38/88，预算 240
  const out = fitWidths([64, 44, 72, 76, 110], [42, 24, 46, 38, 88], 240, 28);
  assert.deepEqual(out, [42, 24, 46, 38, 88]);
  assert.equal(out.reduce((s, w) => s + w, 0), 238);
});

test('比 cap 窄的参数不会因为封顶被放大', () => {
  // 预算够：一列都不动，只是返回 null（交给调用方摘覆盖）
  assert.equal(fitWidths([30, 20, 40], [42, 24, 46], 200, 20), null);
  // 预算紧到必须缩：缩的是等比系数，不是把窄列放大到 cap
  const out = fitWidths([30, 44, 72], [42, 24, 46], 90, 20);
  assert.ok(out[0] <= 30, `30 不该被放大：${out[0]}`);
});

test('caps 都放不下时等比缩到刚好', () => {
  const out = fitWidths([64, 44, 72, 76, 110], [42, 24, 46, 38, 88], 200, 20);
  const sum = out.reduce((s, w) => s + w, 0);
  assert.equal(sum, 200, '应该正好压到预算');
  for (const w of out) assert.ok(w >= 20, `不该低于下限：${w}`);
});

test('预算比「全部下限」还小时，下限优先（表会略微溢出，交给横滑）', () => {
  const out = fitWidths([64, 44, 72, 76, 110], [42, 24, 46, 38, 88], 100, 26);
  for (const w of out) assert.ok(w >= 26, `不该低于下限：${w}`);
  assert.ok(out.reduce((s, w) => s + w, 0) > 100, '压不进去就认了，不把列压成看不清');
});

test('拖动上限 = 现状 + 吃剩余列的余量', () => {
  // 期初现在 97，下限 86 → 还能让出 11
  assert.equal(maxDragWidth(38, 97, 86), 49);
  // 已经没有余量就拖不动（等于自己现在的宽度）
  assert.equal(maxDragWidth(38, 86, 86), 38);
  // 传入异常值不产生负数余量
  assert.equal(maxDragWidth(38, 20, 86), 38);
  assert.equal(maxDragWidth(38, 0, 0), 38);
});

test('节点设置 390 屏的真实数：压完刚好铺满', () => {
  const caps = [42, 24, 46, 42, 84];
  const budget = 390 - 32 * 2 - 86; // 容器 - 两个按钮 - 期初下限
  const out = fitWidths([64, 44, 72, 76, 110], caps, budget, 28);
  const sum = out.reduce((s, w) => s + w, 0);
  assert.equal(390 - (sum + 32 * 2), 88, '期初余额应该拿到 88');
});
