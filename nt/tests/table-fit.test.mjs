/**
 * 列宽压缩 / 拖动上限的纯计算（core/table-fit.js）
 *
 * 这两条是「节点设置压进一屏」「拖动拖不出横滑」的全部算术，
 * 锁住它们就不用靠截图判断：
 *   ① 够宽时一个像素都不动（用户给的列宽原样生效）
 *   ② 压的时候按原比例缩
 *   ③ 缩到字都放不下时按下限兜底，全到下限还超就认了
 *   ④ 拖动上限 = 这一列现在的宽度 + 吃剩余那列的余量（余量不能是 0，否则拖不动）
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { fitWidths, maxDragWidth } from '../js/core/table-fit.js';

const KEYS = ['code', 'seq', 'type', 'cat', 'name'];
const MINS = { code: 42, seq: 20, type: 46, cat: 38, name: 72 };
/** 用户 2026-11-07 给的默认列宽（简码/序/类型/分类/名称），合计 289 */
const W = [48, 37, 58, 49, 97];

test('够宽：返回 null（调用方据此摘掉覆盖，参数原样生效）', () => {
  assert.equal(fitWidths([48, 37, 58], 300, MINS, KEYS), null);
  assert.equal(fitWidths([], 300, MINS, KEYS), null);
  // 恰好等于预算也算够宽
  assert.equal(fitWidths(W, 289, MINS, KEYS), null);
});

test('按原比例压，并扣到正好等于预算', () => {
  const out = fitWidths(W, 240, MINS, KEYS);
  assert.equal(out.reduce((s, w) => s + w, 0), 240, '应该正好压到预算');
  // 比例保持不变：名称仍然是最宽的一列，简码仍然比序宽
  assert.ok(out[4] > out[2] && out[2] > out[0], `比例应保持：${out}`);
});

test('压到下限以下就兜住（简码不能窄到截断 ZHG）', () => {
  const out = fitWidths(W, 240, MINS, KEYS);
  assert.ok(out[0] >= MINS.code, `简码应该 >= ${MINS.code}，实际 ${out[0]}`);
});

test('预算比「全部下限」还小时，下限优先（表会略微溢出，交给横滑）', () => {
  const out = fitWidths(W, 100, MINS, KEYS);
  KEYS.forEach((k, i) => assert.ok(out[i] >= MINS[k], `${k} 不该低于下限`));
  const floorSum = KEYS.reduce((s, k) => s + MINS[k], 0);
  assert.equal(out.reduce((s, w) => s + w, 0), floorSum);
});

test('拖动上限 = 现状 + 吃剩余列的余量', () => {
  // 期初现在 37，下限 16 → 还能让出 21（不是 0，所以拖得动）
  assert.equal(maxDragWidth(48, 37, 16), 69);
  // 已经没有余量就拖不动（等于自己现在的宽度）
  assert.equal(maxDragWidth(48, 16, 16), 48);
  // 传入异常值不产生负数余量
  assert.equal(maxDragWidth(48, 5, 16), 48);
  assert.equal(maxDragWidth(48, 0, 0), 48);
});

test('节点设置 390 屏：五列原样，期初拿到 37，余量留给拖动', () => {
  const budget = 390 - 32 * 2 - 16; // 容器 - 两个按钮 - 期初下限
  assert.equal(fitWidths(W, budget, MINS, KEYS), null, '390 屏不该压缩用户给的列宽');
  assert.equal(390 - (289 + 64), 37, '期初余额应该是 37');
});

test('节点设置 454 屏：期初正好 101，和用户给的一致', () => {
  const budget = 454 - 32 * 2 - 16;
  assert.equal(fitWidths(W, budget, MINS, KEYS), null);
  assert.equal(454 - (289 + 64), 101);
});

test('节点设置 320 屏：真的放不下时才按比例压', () => {
  const budget = 320 - 32 * 2 - 16; // 240
  const out = fitWidths(W, budget, MINS, KEYS);
  assert.equal(out.reduce((s, w) => s + w, 0), budget);
  assert.equal(320 - (budget + 64), 16, '期初被压到下限 16');
});
