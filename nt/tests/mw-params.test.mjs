/**
 * 环图参数（界面设置 → 路径页）的测试
 *
 * 锁五件事：
 *   ① SCHEMA 自洽：30 项、key/field/cssVar 不重名、默认值都在 min/max 内
 *   ② 钳制：填 9999 的环半径被压到 760，填 1 的环厚被抬到 8，非法值落回默认
 *   ③ 通道：写进 CSS 变量的是**基准单位**（640，不是 640px），读回来还是 640
 *   ④ 派生：rOut/thick 换算后 rIn ≥ 1（环厚超过半径不会画出负半径）
 *   ⑤ 规则参数真的生效：分类间隙角改 0 时总跨度满 360°，追踪深度改 1 时只留一跳
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MW_SCHEMA, MW_DEFAULTS, MW_GROUPS, MW_SIZE } from '../js/core/mw-settings.js';
import {
  normalize, toCssList, GROUPS, SCREENS, GROUP_SCREEN, GROUP_SCOPE, SCHEMA,
} from '../js/core/settings.js';
import { chartSize, renderChart, RATIO, BASE_SIZE } from '../js/ui/mw-svg-renderer.js';
import { computeSlots, unitDegree, GAP_DEG } from '../js/graph/mw-slot-calculator.js';
import { traceFromTx } from '../js/graph/path-tracer.js';
import { computeDepths } from '../js/graph/mw-depth.js';
import { ACCOUNT_TYPE } from '../js/core/schema.js';

/* ---------- ① SCHEMA 自洽 ---------- */

test('环图参数共 30 项、四组，key / field / cssVar 都不重名', () => {
  assert.equal(MW_SCHEMA.length, 30);
  assert.equal(MW_GROUPS.length, 4);

  for (const kind of ['key', 'field', 'cssVar']) {
    const set = new Set(MW_SCHEMA.map((s) => s[kind]));
    assert.equal(set.size, MW_SCHEMA.length, `${kind} 有重名`);
  }
  assert.equal(new Set(MW_SCHEMA.map((s) => s.group)).size, 4);
  assert.ok(MW_SCHEMA.every((s) => s.group.startsWith('环图')));
  assert.ok(MW_SCHEMA.every((s) => s.type === 'num'));
});

test('每项默认值都落在自己的 min/max 内（默认值本身不该被钳）', () => {
  for (const s of MW_SCHEMA) {
    assert.ok(Number.isFinite(s.def), `${s.key} 默认值不是数`);
    assert.ok(s.min <= s.def && s.def <= s.max, `${s.key} 默认 ${s.def} 不在 [${s.min}, ${s.max}]`);
  }
});

/* ---------- ② 钳制 ---------- */

test('★ 越界被钳住：环半径 9999 → 760，环厚 1 → 8', () => {
  const n = normalize({ 环半径: 9999, 环厚: 1 }, 'dark');
  assert.equal(n['环半径'], 760);
  assert.equal(n['环厚'], 8);
});

test('钳制也认字符串形式的输入（面板/导入文本都是字符串）', () => {
  const n = normalize({ 环半径: '900', 默认线宽: '  12  ' }, 'dark');
  assert.equal(n['环半径'], 760);
  assert.equal(n['默认线宽'], 12);
});

test('非法值落回默认，不会被当成 0', () => {
  const n = normalize({ 默认线宽: 'abc', 全局透明度: '' }, 'dark');
  assert.equal(n['默认线宽'], MW_DEFAULTS.wMid);
  assert.equal(n['全局透明度'], MW_DEFAULTS.opGlobal);
});

test('没设过的项用默认值（旧存档升级后不会缺参数）', () => {
  const n = normalize({}, 'dark');
  for (const s of MW_SCHEMA) {
    assert.equal(n[s.key], s.def, `${s.key} 缺省不对`);
  }
});

test('★ 面板真的会显示这四组：分组 / 屏幕 / 作用域三处都登记了', () => {
  assert.ok(SCREENS.some((s) => s.id === 'path'), '缺「路径」屏');
  for (const g of MW_GROUPS) {
    assert.ok(GROUPS.includes(g), `${g} 不在 GROUPS`);
    assert.equal(GROUP_SCREEN[g], 'path', `${g} 没归到路径屏`);
    assert.equal(GROUP_SCOPE[g], 'global', `${g} 必须写 :root`);
    assert.ok(SCHEMA.some((s) => s.group === g), `${g} 在 SCHEMA 里没有条目`);
  }
});

/* ---------- ③ 通道：CSS 变量里是基准单位 ---------- */

test('★ 写进 --nt-mw-* 的是基准单位（640），不带 px', () => {
  const n = normalize({ 环半径: 700 }, 'dark');
  const list = toCssList(n, 'dark');
  const mw = list.filter((x) => x.cssVar && x.cssVar.startsWith('--nt-mw-'));

  assert.equal(mw.length, MW_SCHEMA.length);
  assert.ok(mw.every((x) => x.group.startsWith('环图') && !x.attr));

  const byVar = new Map(mw.map((x) => [x.cssVar, x.value]));
  assert.equal(typeof byVar.get('--nt-mw-rout'), 'number');
  assert.equal(byVar.get('--nt-mw-rout'), 700);
  // 读回来还是 700 —— 渲染器再自己去乘 RATIO，中间不经过单位换算
  assert.equal(parseFloat(String(byVar.get('--nt-mw-rout'))), 700);
});

test('默认参数的 CSS 值与 MW_DEFAULTS 一致（两处不会漂）', () => {
  const byVar = new Map(
    toCssList(normalize({}, 'dark'), 'dark')
      .filter((x) => x.cssVar && x.cssVar.startsWith('--nt-mw-'))
      .map((x) => [x.cssVar, x.value]),
  );
  for (const s of MW_SCHEMA) {
    assert.equal(byVar.get(s.cssVar), MW_DEFAULTS[s.field], `${s.key} 的变量值不对`);
  }
});

/* ---------- ④ 派生：尺寸 ---------- */

test('★ 默认参数 → 画布 6000 / 外径 2133 / 内径 1986', () => {
  assert.equal(BASE_SIZE, 1800);
  assert.equal(MW_SIZE, 6000);
  assert.ok(Math.abs(RATIO - 6000 / 1800) < 1e-12);

  const box = chartSize(MW_DEFAULTS);
  assert.deepEqual(box, { size: 6000, rOut: 2133, rIn: 1986 });
});

test('环厚超过环半径时 rIn 兜底为 1，不会出现负半径', () => {
  const box = chartSize({ rOut: 200, thick: 500 });
  assert.equal(box.rOut, 667);
  assert.equal(box.rIn, 1);
});

test('不传参数时 chartSize 走默认值（渲染器自己也能跑）', () => {
  assert.deepEqual(chartSize(), chartSize(MW_DEFAULTS));
});

test('坏参数落回默认，不会把图打成 0 半径', () => {
  assert.deepEqual(chartSize({ rOut: NaN, thick: undefined }), chartSize(MW_DEFAULTS));
  assert.deepEqual(chartSize({ rOut: 'abc' }), chartSize(MW_DEFAULTS));
});

/* ---------- ⑤ 渲染：参数真的进了 SVG ---------- */

const byId = new Map([
  ['a1', { id: 'a1', type: ACCOUNT_TYPE.ASSET, category: '储蓄', name: '招行储' }],
]);
const accOf = (id) => byId.get(id) || null;

const pointAt = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

function chart(params) {
  return renderChart({
    blocks: [{ acc: 'a1', a1: 0, a2: 1.5, colorKey: '储蓄', label: '现金' }],
    chords: [],
    sectors: [],
    pointAt,
    colorOf: () => '#123456',
    params,
  });
}

test('★ 弧块描边宽 = 基准值 × RATIO', () => {
  assert.ok(chart(MW_DEFAULTS).includes('stroke-width="8.0"'));   // 2.4 × 3.33
  assert.ok(chart({ ...MW_DEFAULTS, ringW: 10 }).includes('stroke-width="33.3"'));
});

test('字号上下限改了就立刻变（12/27 → 20/20）', () => {
  const dflt = chart(MW_DEFAULTS);
  const fixed = chart({ ...MW_DEFAULTS, fsMin: 20, fsMax: 20 });
  assert.notEqual(dflt, fixed);
  // 弧够长、字够短，不会被 arcLen 那条上限压住，20 × RATIO = 66.67 → 66.7
  assert.ok(fixed.includes('font-size="66.7"'));
});

test('锥形两档改了会改变标签半径（46/115 → 100/100）', () => {
  // 极窄的块 + 长名字 → 一定走锥形
  const narrow = { acc: 'a1', a1: 0, a2: 0.01, colorKey: '储蓄', label: '招行储蓄卡余额' };
  const base = { blocks: [narrow, { ...narrow, a1: 0.02, a2: 0.03 }], chords: [], sectors: [], pointAt, colorOf: () => '#123456' };
  const a = renderChart({ ...base, params: MW_DEFAULTS });
  const b = renderChart({ ...base, params: { ...MW_DEFAULTS, coneA: 100, coneB: 100 } });
  assert.notEqual(a, b);
});

test('命中带宽度只影响透明命中区，不影响可见线', () => {
  const chord = {
    txIdx: 0, strokeColor: '#fff', strokeWidth: 8, opacity: 0.5,
    path: { from: [0, 0], c1: [1, 1], c2: [2, 2], to: [3, 3] },
  };
  const data = { blocks: [], sectors: [], chords: [chord], pointAt, colorOf: () => '#123456' };
  const a = renderChart({ ...data, params: { ...MW_DEFAULTS, hitBand: 14 } });
  const b = renderChart({ ...data, params: { ...MW_DEFAULTS, hitBand: 40 } });
  assert.ok(a.includes('stroke-width="46.7"') && b.includes('stroke-width="133.3"'));
  assert.ok(a.split('stroke-width="8"').length === b.split('stroke-width="8"').length);
});

test('画布边长固定在 6000（它不进面板，改了只是整体缩放）', () => {
  assert.ok(chart(MW_DEFAULTS).includes('viewBox="0 0 6000 6000"'));
  assert.ok(chart({ ...MW_DEFAULTS, rOut: 760 }).includes('viewBox="0 0 6000 6000"'));
});

/* ---------- ⑥ 规则参数 ---------- */

/** 槽位测试用的小账户表：两个账户 = 两个分类组 */
const SLOT_ACCOUNTS = [
  { id: 'a_salary', type: ACCOUNT_TYPE.INCOME, category: '薪金' },
  { id: 'a_bank', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
  { id: 'a_food', type: ACCOUNT_TYPE.EXPENSE, category: '餐饮' },
];
const slotAccOf = (id) => SLOT_ACCOUNTS.find((a) => a.id === id) || null;

test('★ 分类间隙角 0 时四个单位正好铺满 360°', () => {
  const txs = [
    { from_id: 'a_salary', to_id: 'a_bank' },
    { from_id: 'a_bank', to_id: 'a_food' },
  ];

  const zero = computeSlots(txs, { accOf: slotAccOf, outerRadius: 640, gapDeg: 0 });
  assert.equal(zero.unitDeg, 90);
  assert.equal(zero.gapDeg, 0);
  const span = zero.slots[zero.slots.length - 1].a2 - zero.slots[0].a1;
  assert.ok(Math.abs(span - Math.PI * 2) < 1e-9, '总跨度应为整圆');

  const dflt = computeSlots(txs, { accOf: slotAccOf, outerRadius: 640 });
  assert.equal(dflt.unitDeg, (360 - 3 * GAP_DEG) / 4);
  assert.ok(span - (dflt.slots[dflt.slots.length - 1].a2 - dflt.slots[0].a1) > 0, '有缝隙时总跨度更小');
});

test('单位角改了，单位弧长跟着变（线宽的基准）', () => {
  const txs = [{ from_id: 'a_bank', to_id: 'a_food' }];
  const a = computeSlots(txs, { accOf: slotAccOf, outerRadius: 640, gapDeg: 0 });
  const b = computeSlots(txs, { accOf: slotAccOf, outerRadius: 640, gapDeg: 1 });
  assert.ok(a.unitArcLen > b.unitArcLen);
});

test('间隙角公式的第三参数不影响旧调用的结果', () => {
  assert.equal(unitDegree(20, 1000), unitDegree(20, 1000, GAP_DEG));
  assert.ok(unitDegree(20, 1000, 0) > unitDegree(20, 1000));
});

test('★ 追踪深度 1 只留直接连着的那一笔', () => {
  const links = [
    { from_id: 'A', to_id: 'B' },
    { from_id: 'B', to_id: 'C' },
    { from_id: 'C', to_id: 'D' },
  ];
  assert.equal(traceFromTx(links, 2).linkIndices.length, 3);
  assert.deepEqual(traceFromTx(links, 2, { maxDepth: 1 }).linkIndices, [2]);
  assert.deepEqual(traceFromTx(links, 2, {}).linkIndices, [0, 1, 2]);
});

/* ---------- ⑦ 链路层级（线宽取档的基准） ---------- */

test('链路层级：费用类 0 级，上游逐级 +1，通不到费用端的给最深 +1', () => {
  const txs = [
    { from_id: 'salary', to_id: 'bank' },
    { from_id: 'bank', to_id: 'food' },
    { from_id: 'bank', to_id: 'cash' },
  ];
  const acc = {
    salary: { type: ACCOUNT_TYPE.INCOME },
    bank: { type: ACCOUNT_TYPE.ASSET },
    food: { type: ACCOUNT_TYPE.EXPENSE },
    cash: { type: ACCOUNT_TYPE.ASSET },
  };
  const d = computeDepths(txs, (id) => acc[id] || null);

  assert.equal(d.get('food'), 0, '费用类是 0 级');
  assert.equal(d.get('bank'), 1);
  assert.equal(d.get('salary'), 2);
  // cash 的下游没有费用端（它是 bank 的收款方，不在上游链上）
  assert.equal(d.get('cash'), 3, '通不到费用端的给最深 +1');
});

test('链路层级：倒卡成环也不死循环（A→B→A）', () => {
  const cyc = [
    { from_id: 'x', to_id: 'y' },
    { from_id: 'y', to_id: 'x' },
  ];
  const d = computeDepths(cyc, () => ({ type: ACCOUNT_TYPE.ASSET }));
  assert.equal(d.get('x'), 1);
  assert.equal(d.get('y'), 1);
});

test('链路层级：空输入不炸', () => {
  assert.equal(computeDepths([], () => null).size, 0);
  assert.equal(computeDepths(null, null).size, 0);
});
