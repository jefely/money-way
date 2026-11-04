/**
 * 环图提示框位置：在指针上方约 1cm，水平居中，放不下才翻到下方。
 * 回归：用户 2026-11 报「手机上提示窗被手指挡住」。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tipPosition, TIP_GAP } from '../js/ui/chart-tip.js';

test('1cm ≈ 38 CSS px', () => {
  assert.equal(TIP_GAP, 38);
});

test('★ 提示框底边在指针上方 1cm（不是顶边）', () => {
  const p = tipPosition({ x: 200, y: 400, w: 200, h: 60, vw: 390, vh: 844 });
  assert.deepEqual(p, { x: 100, y: 302 });   // 400 - 38 - 60
  assert.equal(p.y + 60, 400 - 38, '底边到指针正好 38px');
});

test('水平以指针为中心，左右夹在视口内', () => {
  assert.deepEqual(
    tipPosition({ x: 20, y: 400, w: 200, h: 60, vw: 390, vh: 844 }),
    { x: 8, y: 302 },
  );
  assert.deepEqual(
    tipPosition({ x: 380, y: 400, w: 200, h: 60, vw: 390, vh: 844 }),
    { x: 182, y: 302 },
  );
});

test('顶部放不下时翻到指针下方（至少 16px）', () => {
  const p = tipPosition({ x: 100, y: 40, w: 160, h: 50, vw: 390, vh: 844 });
  assert.equal(p.y, 56);   // 40 + 16
});

test('超出视口底部时夹回来', () => {
  const p = tipPosition({ x: 200, y: 800, w: 200, h: 60, vw: 390, vh: 300 });
  assert.equal(p.y, 232);  // 300 - 60 - 8
});
