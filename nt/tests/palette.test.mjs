/**
 * 分类调色板测试：任意两色必须差得够远。
 *
 * 用户的验收原话：「成对的颜色必须颜色差异大，正巧两个绿色是一对，
 * 线也是近乎一样的绿色，就分不清了。」
 *
 * 所以这里不看「色相有没有隔开」（黄金角在色相上隔得很开，照样撞出两个绿），
 * 而是直接算 **CIELAB ΔE76** —— 人眼感知距离。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CATEGORY_PALETTE, categoryColor } from '../js/graph/mw-path-calculator.js';

/* ---------- sRGB / HSL → Lab ---------- */

function hslToRgb(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lig - c / 2;
  return [r + m, g + m, b + m];
}

function rgbToLab(rgb) {
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb.map(lin);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const labOf = ([h, s, l]) => rgbToLab(hslToRgb(h, s, l));

function deltaE(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** 色相差（0~180） */
function hueGap(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/* ---------- 测试 ---------- */

test('调色板有 24 色，且每色都是合法的 HSL 三元组', () => {
  assert.equal(CATEGORY_PALETTE.length, 24);
  for (const [h, s, l] of CATEGORY_PALETTE) {
    assert.ok(h >= 0 && h < 360, '色相 ' + h);
    assert.ok(s > 0 && s <= 100, '饱和度 ' + s);
    assert.ok(l > 0 && l < 100, '亮度 ' + l);
  }
});

/* 色系边界：前 11 个各占一个，保证「分类少的时候不可能出现两个绿」 */
const FAMILY_RANGES = [
  [0, 15, 'red'], [15, 45, 'orange'], [45, 70, 'yellow'], [70, 150, 'green'],
  [150, 185, 'teal'], [185, 205, 'cyan'], [205, 250, 'blue'], [250, 275, 'indigo'],
  [275, 300, 'purple'], [300, 330, 'magenta'], [330, 345, 'pink'], [345, 360, 'red'],
];

function familyOf(h) {
  const x = ((h % 360) + 360) % 360;
  for (const [lo, hi, name] of FAMILY_RANGES) if (x >= lo && x < hi) return name;
  return 'red';
}

test('★ 前 11 个分类各占一个色系 —— 少分类时不会撞出两个绿', () => {
  const fams = CATEGORY_PALETTE.slice(0, 11).map(([h]) => familyOf(h));
  assert.equal(new Set(fams).size, 11, fams.join(','));
  assert.equal(fams.filter((f) => f === 'green').length, 1);
  assert.equal(fams.filter((f) => f === 'teal').length, 1);
});

test('★ 任意两色的 CIELAB ΔE76 ≥ 20（不是只看色相）', () => {
  const labs = CATEGORY_PALETTE.map(labOf);
  let min = Infinity;
  let pair = null;
  for (let i = 0; i < labs.length; i += 1) {
    for (let j = i + 1; j < labs.length; j += 1) {
      const d = deltaE(labs[i], labs[j]);
      if (d < min) { min = d; pair = [i, j]; }
    }
  }
  assert.ok(min >= 20, `最小 ΔE = ${min.toFixed(1)}（第 ${pair} 色）`);
});

test('★ 同一色系（色相接近）必须靠亮度拉开 —— 禁止「两个一样的绿」', () => {
  for (let i = 0; i < CATEGORY_PALETTE.length; i += 1) {
    for (let j = i + 1; j < CATEGORY_PALETTE.length; j += 1) {
      const a = CATEGORY_PALETTE[i];
      const b = CATEGORY_PALETTE[j];
      if (hueGap(a[0], b[0]) >= 20) continue;      // 色相差得够开，靠色相区分
      const dl = Math.abs(a[2] - b[2]);
      assert.ok(dl >= 10, `第 ${i}、${j} 色都在 ${a[0]}°/${b[0]}° 附近，亮度只差 ${dl}`);
    }
  }
});

test('同一分类永远同色；调色板用完后退回黄金角也仍是合法颜色', () => {
  const idx = new Map([['餐饮', 0], ['储蓄', 1], ['工资', 25]]);
  assert.equal(categoryColor(idx, '餐饮'), categoryColor(idx, '餐饮'));
  assert.notEqual(categoryColor(idx, '餐饮'), categoryColor(idx, '储蓄'));
  assert.match(categoryColor(idx, '工资'), /^hsl\([\d.]+, 64%, \d+%\)$/);
});
