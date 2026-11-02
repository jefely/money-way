/**
 * 三层套娃 + 变宽线（v4.0 第四部分）。
 *
 *   node --test nt/tests/layers.test.mjs
 *
 * 验三件事：
 *   ① 三层半径是按比例切的，且内层最厚
 *   ② 三层颜色各司其职：类型固定 / 分类同色系 / 节点唯一
 *   ③ 变宽线的宽度真的落在两端，且法线对称
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ringRadii, typeColor, categoryTint, nodeColor, buildArcs, TYPE_HSL,
} from '../js/graph/mw-layers.js';
import { ribbonGeometry, widthAt, widthByAmount, TAPER, TAPER_START } from '../js/graph/mw-chord-shape.js';
import {
  fixedWidthOf, FIXED_WIDTH, FUNNEL_WIDE, FUNNEL_THIN,
  blockWidthOf, BLOCK_WIDTH,
} from '../js/graph/mw-path-calculator.js';
import { ACCOUNT_TYPE } from '../js/core/schema.js';

/* ---------- 固定线宽表（2026-11 用户定稿） ---------- */

test('★ 固定线宽：负债 6 / 资产 4 / 收入·权益·成本 2.4 / 费用 1.2', () => {
  assert.equal(fixedWidthOf(ACCOUNT_TYPE.LIABILITY), 6);
  assert.equal(fixedWidthOf(ACCOUNT_TYPE.ASSET), 4);
  assert.equal(fixedWidthOf(ACCOUNT_TYPE.INCOME), 2.4);
  assert.equal(fixedWidthOf(ACCOUNT_TYPE.EQUITY), 2.4);
  assert.equal(fixedWidthOf(ACCOUNT_TYPE.COST), 2.4);
  assert.equal(fixedWidthOf(ACCOUNT_TYPE.EXPENSE), 1.2);
});

test('固定线宽：六类都在表里，认不出的一律 2.4（不让线消失）', () => {
  for (const t of Object.values(ACCOUNT_TYPE)) {
    assert.ok(Number.isFinite(FIXED_WIDTH[t]), `${t} 缺固定线宽`);
  }
  assert.equal(fixedWidthOf('不存在的类型'), 2.4);
  assert.equal(fixedWidthOf(''), 2.4);
  assert.equal(fixedWidthOf(null), 2.4);
});

test('★ 色块模式线宽：负债 6 / 资产·收入 4.8 / 权益 3.6 / 成本 2.4 / 费用 1.2', () => {
  assert.equal(blockWidthOf(ACCOUNT_TYPE.LIABILITY), 6);
  assert.equal(blockWidthOf(ACCOUNT_TYPE.ASSET), 4.8);
  assert.equal(blockWidthOf(ACCOUNT_TYPE.INCOME), 4.8);
  assert.equal(blockWidthOf(ACCOUNT_TYPE.EQUITY), 3.6);
  assert.equal(blockWidthOf(ACCOUNT_TYPE.COST), 2.4);
  assert.equal(blockWidthOf(ACCOUNT_TYPE.EXPENSE), 1.2);
});

test('色块模式线宽：六类全登记，认不出的 2.4', () => {
  for (const t of Object.values(ACCOUNT_TYPE)) {
    assert.ok(Number.isFinite(BLOCK_WIDTH[t]), `${t} 缺色块线宽`);
  }
  assert.equal(blockWidthOf('不认识'), 2.4);
  assert.equal(blockWidthOf(null), 2.4);
});

test('★ 追踪漏斗：基础宽头 6、细头 1.2，细头在转入端', () => {
  assert.equal(FUNNEL_WIDE, 6);
  assert.equal(FUNNEL_THIN, 1.2);
  assert.ok(FUNNEL_THIN < FUNNEL_WIDE, '细头必须比宽头细');

  // 宽头贴着转出端、细头贴着转入端：把一条 100 长的线画出来看宽度分布
  const g = ribbonGeometry([0, 0], [34, 0], [66, 0], [100, 0], FUNNEL_WIDE, FUNNEL_THIN);
  const n = g.left.length - 1;
  const atFrom = Math.hypot(g.left[0][0] - g.right[0][0], g.left[0][1] - g.right[0][1]);
  const atTo = Math.hypot(g.left[n][0] - g.right[n][0], g.left[n][1] - g.right[n][1]);
  assert.ok(Math.abs(atFrom - FUNNEL_WIDE) < 1e-9, `转出端应是宽头，实际 ${atFrom}`);
  assert.ok(Math.abs(atTo - FUNNEL_THIN) < 1e-9, `转入端应是细头，实际 ${atTo}`);
});

/* ---------- ① 三层半径 ---------- */

test('两层半径：外圈细线 + 内圈节点，取消分类圈', () => {
  // 显式传参测「结构与公式」，不依赖默认值（默认值另有测试钉住）
  const r = ringRadii(2133, 1920, { typeWidth: 0.1, typeGap: 0 });
  assert.equal(r.r3, 2133);
  assert.ok(Math.abs(r.r0 - 1920) < 1e-9, `最内沿应回到 rIn，实际 ${r.r0}`);
  const thick = 2133 - 1920;
  assert.ok(Math.abs(r.typeBand - thick * 0.1) < 1e-9, '外圈占 10%，看上去是一条线');
  assert.equal(r.catBand, 0, '分类圈已取消');
  assert.ok(Math.abs(r.nodeBand - thick * 0.9) < 1e-9, '其余全给节点');
  assert.ok(r.r3 > r.r2 && r.r2 >= r.r1 && r.r1 > r.r0, '半径必须严格递减');
  assert.equal(r.r1, r.r2, '间距为 0 时 r1 与 r2 重合');
});

test('两层半径：环厚为 0 时不产生负半径', () => {
  const r = ringRadii(500, 500);
  assert.ok(r.r0 > 0 && r.r0 <= r.r2 && r.r2 <= r.r3);
  assert.ok(r.nodeBand >= 0);
});

test('★ 外圈细线的粗细与间距可调（面板「环图·几何」）', () => {
  const base = ringRadii(2000, 1800, { typeWidth: 0.1 });   // 环厚 200
  assert.ok(Math.abs(base.typeBand - 20) < 1e-6, '0.1 → 20');

  const thick = ringRadii(2000, 1800, { typeWidth: 0.2 });
  assert.ok(Math.abs(thick.typeBand - 40) < 1e-6, '0.2 → 40');

  const gap = ringRadii(2000, 1800, { typeGap: 0.1 });
  assert.ok(Math.abs(gap.r2 - gap.r1 - 20) < 1e-6, '间距 = 环厚 × 0.1');
  // 间距再大也不能把节点环顶出细线外面去
  const huge = ringRadii(2000, 1800, { typeWidth: 0.5, typeGap: 0.9 });
  assert.ok(huge.r1 <= huge.r2 && huge.r0 >= 0);
});

test('外圈默认值：线厚 0.06 / 间距 0.03（2026-11 用户实测）', () => {
  const r = ringRadii(2000, 1800);   // 环厚 200
  assert.ok(Math.abs(r.typeBand - 12) < 1e-6, '200 × 0.06 = 12');
  assert.ok(Math.abs(r.r2 - r.r1 - 6) < 1e-6, '间距 200 × 0.03 = 6');
});

/* ---------- ② 三层配色 ---------- */

test('外层：每个类型一个固定色，同类永远同色', () => {
  assert.equal(typeColor('费用类'), typeColor('费用类'));
  assert.notEqual(typeColor('费用类'), typeColor('资产类'));
  // 固定色系就是 TYPE_HSL 里那六个
  assert.equal(typeColor('资产类'), 'hsl(214, 85%, 56%)');
  assert.equal(typeColor('不存在的类型'), typeColor('其它'));
});

test('中层：同色系微调 —— 色相锁死在所属类型上，只动明度/饱和度', () => {
  for (const type of Object.keys(TYPE_HSL)) {
    const base = TYPE_HSL[type][0];
    for (let i = 0; i < 6; i++) {
      const m = categoryTint(type, i).match(/^hsl\((\d+), (\d+)%, (\d+)%\)$/);
      assert.ok(m, `色值格式不对：${categoryTint(type, i)}`);
      assert.equal(Number(m[1]), base, `${type} 的第 ${i} 个分类跑出色系了`);
    }
  }
  // 相邻分类的颜色必须不一样，否则中层看不出分段
  assert.notEqual(categoryTint('费用类', 0), categoryTint('费用类', 1));
});

test('内层：同类型 N 个节点的色相均匀铺满一圈', () => {
  for (const n of [3, 4, 6, 8]) {
    const hues = [];
    for (let i = 0; i < n; i++) {
      hues.push(Number(nodeColor(i, n).match(/hsl\((\d+)/)[1]));
    }
    // 任意相邻两项（含首尾）色相差 = 360/n
    for (let i = 0; i < n; i++) {
      const d = Math.abs(hues[(i + 1) % n] - hues[i]);
      const gap = Math.min(d, 360 - d);
      assert.ok(gap >= 360 / n - 2, `n=${n} 第 ${i} 与下一个只差 ${gap}°`);
    }
  }
});

test('★ 同类型任意两个节点色相都必须拉开（资产类互转会交叉）', () => {
  const n = 6;
  const hues = [...Array(n)].map((_, i) => Number(nodeColor(i, n).match(/hsl\((\d+)/)[1]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.abs(hues[i] - hues[j]);
      assert.ok(Math.min(d, 360 - d) >= 55, `n=6 时第 ${i}/${j} 只差 ${d}°`);
    }
  }
  // 明度还要轮转，同一色相附近再分一层
  const lights = [...Array(n)].map((_, i) => nodeColor(i, n).match(/, (\d+)%\)/)[1]);
  assert.ok(new Set(lights).size >= 2, '明度必须分档');
});

test('不同类型用不同色相起点，避免两类共用一组颜色', () => {
  const a = nodeColor(0, 4, 0);
  const b = nodeColor(0, 4, 37);
  assert.notEqual(a, b);
});

/* ---------- ③ 三层聚合 ---------- */

test('buildArcs：外层按类型聚合、中层按类型|分类聚合，角度与内层对齐', () => {
  const slots = [
    { acc: 'a', type: '资产类', category: '储蓄', sortKey: '资产类|储蓄', a1: 0, a2: 1 },
    { acc: 'b', type: '资产类', category: '储蓄', sortKey: '资产类|储蓄', a1: 1, a2: 2 },
    { acc: 'c', type: '资产类', category: '现金', sortKey: '资产类|现金', a1: 2, a2: 3 },
    { acc: 'd', type: '费用类', category: '餐饮', sortKey: '费用类|餐饮', a1: 3, a2: 4 },
  ];
  const { types, cats } = buildArcs(slots);

  assert.deepEqual(types.map((t) => t.type), ['资产类', '费用类']);
  assert.deepEqual(types.map((t) => [t.a1, t.a2]), [[0, 3], [3, 4]]);

  assert.deepEqual(cats.map((c) => c.category), ['储蓄', '现金', '餐饮']);
  assert.deepEqual(cats.map((c) => [c.a1, c.a2]), [[0, 2], [2, 3], [3, 4]]);
});

test('buildArcs：空槽位（断链流水）不进任何一层', () => {
  const { types, cats } = buildArcs([{ acc: null, a1: 0, a2: 1, type: '其它', category: '' }]);
  assert.equal(types.length, 0);
  assert.equal(cats.length, 0);
});

/* ---------- ④ 线宽 = 金额 ---------- */

test('线宽：严格单调，最大金额拿最大宽度，0 金额拿最小', () => {
  const opt = { min: 3, max: 25 };
  assert.equal(widthByAmount(0, 100, opt), 3);
  assert.equal(widthByAmount(100, 100, opt), 25);
  const mid = widthByAmount(25, 100, opt);   // sqrt(0.25) = 0.5
  assert.ok(Math.abs(mid - 14) < 1e-9);
  assert.ok(widthByAmount(10, 100, opt) < widthByAmount(50, 100, opt));
});

test('线宽：没有金额时退回最小值，不产生 0 或 NaN', () => {
  assert.ok(widthByAmount(0, 0, { min: 2, max: 9 }) >= 2);
  assert.ok(Number.isFinite(widthByAmount(NaN, NaN, { min: 2, max: 9 })));
});

/* ---------- ⑤ 变宽线 ---------- */

/** 第 i 个采样点处的线宽 */
function widthAtIdx(g, i) {
  return Math.hypot(g.left[i][0] - g.right[i][0], g.left[i][1] - g.right[i][1]);
}

test('★★ 变宽线：前 70% 等宽，后 30% 才收窄（用户 2026-11 定）', () => {
  const g = ribbonGeometry([0, 0], [30, 0], [70, 0], [100, 0], 10, 4);
  const n = g.left.length - 1;

  assert.ok(Math.abs(widthAtIdx(g, 0) - 10) < 1e-9, `起点宽 ${widthAtIdx(g, 0)}`);
  assert.ok(Math.abs(widthAtIdx(g, n) - 4) < 1e-9, `终点宽 ${widthAtIdx(g, n)}`);

  // 中段必须还是 10 —— 这正是「漏斗中间会变细」要修的地方
  const mid = Math.round(n * 0.5);
  assert.ok(Math.abs(widthAtIdx(g, mid) - 10) < 1e-9, `中点 ${widthAtIdx(g, mid)}`);

  // 前 70% 每一个采样点都等宽
  const taperFrom = Math.floor(n * TAPER_START);
  for (let i = 0; i <= taperFrom; i++) {
    assert.ok(Math.abs(widthAtIdx(g, i) - 10) < 1e-6, `第 ${i} 点就变细了`);
  }
  // 之后单调收窄，绝不反弹
  for (let i = taperFrom + 1; i <= n; i++) {
    assert.ok(widthAtIdx(g, i) <= widthAtIdx(g, i - 1) + 1e-9, `第 ${i} 点反弹了`);
  }
});

test('变宽线：两侧关于中心线对称', () => {
  const g = ribbonGeometry([0, 0], [30, 0], [70, 0], [100, 0], 10, 4);
  for (let i = 0; i < g.left.length; i++) {
    assert.ok(Math.abs(g.left[i][1] + g.right[i][1]) < 1e-9, `第 ${i} 点不对称`);
  }
});

test('widthAt：折点在 70%，之前恒定、之后线性', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(widthAt(0, 6, 1.2), 6));
  assert.ok(near(widthAt(TAPER_START, 6, 1.2), 6));
  assert.ok(near(widthAt(1, 6, 1.2), 1.2));
  const half = widthAt(TAPER_START + (1 - TAPER_START) / 2, 6, 1.2);
  assert.ok(near(half, 3.6), '后半段中点是两端平均');
});

test('变宽线：零长度也不炸（全返回有限坐标）', () => {
  const g = ribbonGeometry([50, 50], [50, 50], [50, 50], [50, 50], 8, 3);
  for (const p of [...g.left, ...g.right]) {
    assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }
});

test('变宽线：终点收缩到 TAPER 比例', () => {
  assert.ok(TAPER > 0 && TAPER < 1);
  const g = ribbonGeometry([0, 0], [30, 0], [70, 0], [100, 0], 20, 20 * TAPER);
  const n = g.left.length - 1;
  assert.ok(Math.abs(widthAtIdx(g, n) - 20 * TAPER) < 1e-9);
});
