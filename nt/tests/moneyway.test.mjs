/**
 * Money Way 环网图测试：单位角公式 / 线宽权重 / 颜色绑定 / 反向溯源 / 环路安全。
 *
 * 用户给的验收例子：
 *   1000 笔 + 20 个分类 → (360 − 20×0.8) ÷ (1000×2) = 0.172°/单位
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACCOUNT_TYPE } from '../js/core/schema.js';
import {
  computeSlots, unitDegree, CAT_ORDER, GAP_DEG,
} from '../js/graph/mw-slot-calculator.js';
import {
  calcLinkStyle, categoryColor, WEIGHT_MAP, UNIT_WIDTH_RATIO, MAX_STROKE_WIDTH, MIN_STROKE_WIDTH,
  unitDegree as unitDegreeFromPath, chordGeometry, OPACITY, linkOpacity,
  traceWidthOf, TRACE_FLOOR, STYLE_UP, STYLE_DOWN, styleOf,
} from '../js/graph/mw-path-calculator.js';
import {
  traceUpstream, traceFromTx, traceByAccount,
  extractLeverageLinks, hasCycle,
} from '../js/graph/path-tracer.js';

/* ---------- 造数据 ---------- */

const ACCOUNTS = [
  { id: 'a_salary', code: 'GZ', name: '工资', type: ACCOUNT_TYPE.INCOME, category: '薪金' },
  { id: 'a_bank', code: 'ZHC', name: '招行储', type: ACCOUNT_TYPE.ASSET, category: '储蓄' },
  { id: 'a_cash', code: 'XJ', name: '现金', type: ACCOUNT_TYPE.ASSET, category: '现金' },
  { id: 'a_card', code: 'ZHC2', name: '招行信', type: ACCOUNT_TYPE.LIABILITY, category: '信用卡' },
  { id: 'a_food', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '餐饮' },
  { id: 'a_traffic', code: 'JT', name: '交通', type: ACCOUNT_TYPE.EXPENSE, category: '交通' },
];

const byId = new Map(ACCOUNTS.map((a) => [a.id, a]));
const accOf = (id) => byId.get(id) || null;

function tx(from, to, amount = 100, date = '2026-08-01') {
  return { from_id: from, to_id: to, amount, date };
}

/* ---------- 单位角公式 ---------- */

test('★ 单位角：用户给的例子 1000 笔 + 20 分类 = 0.172°', () => {
  const deg = unitDegree(20, 1000);
  const expected = (360 - 20 * 0.8) / 2000;
  assert.equal(Math.abs(deg - expected) < 1e-12, true);
  assert.equal(Math.round(deg * 1000) / 1000, 0.172);
});

test('单位角：没有流水时为 0（不除零）', () => {
  assert.equal(unitDegree(5, 0), 0);
});

test('单位角：分类极多时兜底，不会变成负数', () => {
  assert.ok(unitDegree(600, 100) > 0);
});

test('两个模块的单位角公式一致', () => {
  assert.equal(unitDegree(20, 1000), unitDegreeFromPath(20, 1000));
});

test('GAP_DEG 固定 0.8 度', () => {
  assert.equal(GAP_DEG, 0.8);
});

/* ---------- 槽位与弧块 ---------- */

test('槽位数 = 笔数 × 2', () => {
  const txs = [tx('a_bank', 'a_food'), tx('a_cash', 'a_traffic')];
  const r = computeSlots(txs, { accOf, outerRadius: 640 });
  assert.equal(r.slots.length, 4);
  assert.equal(r.units, 4);
});

test('单位弧长 = 单位弧度 × 半径', () => {
  const txs = [tx('a_bank', 'a_food')];
  const r = computeSlots(txs, { accOf, outerRadius: 640 });
  assert.equal(Math.abs(r.unitArcLen - r.unit * 640) < 1e-9, true);
});

test('弧块：同账户的连续槽位合并', () => {
  const txs = [
    tx('a_bank', 'a_food'), tx('a_bank', 'a_food'), tx('a_bank', 'a_traffic'),
  ];
  const r = computeSlots(txs, { accOf, outerRadius: 640 });
  const bankBlock = r.blocks.find((b) => b.acc === 'a_bank');
  assert.ok(bankBlock, '招行储应该有弧块');
  assert.ok(bankBlock.n >= 2, '连续的同账户槽位要合并成一个块');
});

test('排序：类型按 CAT_ORDER（收入在最前，9 点起）', () => {
  const txs = [tx('a_bank', 'a_food')];
  const r = computeSlots(txs, { accOf, outerRadius: 640 });
  const types = r.blocks.map((b) => b.type);
  const ranks = types.map((t) => CAT_ORDER.indexOf(t));
  for (let i = 1; i < ranks.length; i++) {
    assert.ok(ranks[i] >= ranks[i - 1], `块顺序应按 CAT_ORDER：${types.join(' → ')}`);
  }
});

test('扇区：每个分类组给出起止角，供画分界线', () => {
  const txs = [tx('a_bank', 'a_food'), tx('a_cash', 'a_traffic')];
  const r = computeSlots(txs, { accOf, outerRadius: 640 });
  assert.ok(r.sectors.length >= 2);
  for (const s of r.sectors) {
    assert.ok(s.a2 > s.a1, `扇区 ${s.key} 的终角应大于起角`);
  }
});

/* ---------- 线宽权重（核心规则） ---------- */

test('★ 线宽权重：费用 4× / 资产 3× / 负债 2× / 权益 1×', () => {
  assert.equal(WEIGHT_MAP[ACCOUNT_TYPE.EXPENSE], 4.0);
  assert.equal(WEIGHT_MAP[ACCOUNT_TYPE.ASSET], 3.0);
  assert.equal(WEIGHT_MAP[ACCOUNT_TYPE.LIABILITY], 2.0);
  assert.equal(WEIGHT_MAP[ACCOUNT_TYPE.EQUITY], 1.0);
});

test('★ 线宽 = 单位弧长 × 0.8 × 权重', () => {
  const unitArc = 10;   // 1 单位弧长 10px
  const ctx = { byId, groupKeyOf: () => '费用类|餐饮', colorIndex: new Map([['费用类|餐饮', 0]]) };

  const toFood = calcLinkStyle({ from_id: 'a_bank', to_id: 'a_food' }, ctx, unitArc);
  assert.equal(toFood.weight, 4, '转入是费用类 → 4 倍');
  assert.equal(toFood.strokeWidth, 14, '10 × 0.8 × 4 = 32，被上限 14 钳住（见 MAX_STROKE_WIDTH）');

  const toBank = calcLinkStyle({ from_id: 'a_salary', to_id: 'a_bank' }, ctx, unitArc);
  assert.equal(toBank.weight, 3, '转入是资产类 → 3 倍');
  assert.equal(toBank.strokeWidth, 14, '24 也被上限 14 钳住');

  const toCard = calcLinkStyle({ from_id: 'a_bank', to_id: 'a_card' }, ctx, unitArc);
  assert.equal(toCard.weight, 2, '转入是负债类 → 2 倍');
  assert.equal(toCard.strokeWidth, 14, '16 也被上限钳住');

  assert.equal(UNIT_WIDTH_RATIO, 0.8);
});

test('★ 线宽上限：单位很少时不会糊成一片', () => {
  const ctx = { byId, colorKeyOf: () => '餐饮', colorIndex: new Map([['餐饮', 0]]) };
  // 3 笔时单位弧长约 620px → 原始算出来 4×1984px，比画布还粗
  const big = calcLinkStyle({ from_id: 'a_bank', to_id: 'a_food' }, ctx, 620);
  assert.equal(big.strokeWidth, MAX_STROKE_WIDTH, '必须被钳到上限');
  assert.equal(big.clamped, true);

  // 真实数据（几百笔）单位弧长只有几 px，不会触发上限
  const small = calcLinkStyle({ from_id: 'a_bank', to_id: 'a_food' }, ctx, 2);
  assert.equal(small.strokeWidth, 6.4, '2 × 0.8 × 4 = 6.4，不受影响');
  assert.equal(small.clamped, false);
});

test('线宽下限：极小单位也能看见', () => {
  const ctx = { byId, colorKeyOf: () => '餐饮', colorIndex: new Map() };
  const tiny = calcLinkStyle({ from_id: 'a_bank', to_id: 'a_food' }, ctx, 0);
  assert.equal(tiny.strokeWidth, MIN_STROKE_WIDTH);
});

test('线宽：由「转入方」决定，不是转出方', () => {
  const ctx = { byId, groupKeyOf: () => '资产类|储蓄', colorIndex: new Map() };
  // 资产 → 费用：应按费用算（4×），不按转出的资产算（3×）
  const a = calcLinkStyle({ from_id: 'a_bank', to_id: 'a_food' }, ctx, 10);
  assert.equal(a.weight, 4);
  // 费用 → 资产：应按资产算（3×）
  const b = calcLinkStyle({ from_id: 'a_food', to_id: 'a_bank' }, ctx, 10);
  assert.equal(b.weight, 3);
});

/* ---------- 颜色绑定 ---------- */

test('★ 颜色：同一统计分类永远同一色', () => {
  const colorIndex = new Map([['餐饮', 0], ['交通', 1], ['储蓄', 2]]);
  const c1 = categoryColor(colorIndex, '餐饮');
  const c2 = categoryColor(colorIndex, '餐饮');
  const c3 = categoryColor(colorIndex, '交通');
  assert.equal(c1, c2, '同分类必须同色');
  assert.notEqual(c1, c3, '不同分类应该不同色');
});

test('★ 颜色数 = 统计分类数（与账户类型无关）', () => {
  // 同一个统计分类「餐饮」跨了费用类和资产类两种账户类型
  const accs = [
    { id: 'x1', type: ACCOUNT_TYPE.EXPENSE, category: '餐饮' },
    { id: 'x2', type: ACCOUNT_TYPE.ASSET, category: '餐饮' },
    { id: 'x3', type: ACCOUNT_TYPE.EXPENSE, category: '交通' },
  ];
  const map = new Map(accs.map((a) => [a.id, a]));
  const get = (id) => map.get(id);

  // 本模块的槽位计算会给出 colorList
  const r = computeSlots(
    [{ from_id: 'x1', to_id: 'x2', amount: 1, date: '2026-08-01' }, { from_id: 'x2', to_id: 'x3', amount: 1, date: '2026-08-02' }],
    { accOf: get, outerRadius: 640 },
  );

  // 三个账户、两种统计分类 → 颜色只应有 2 种
  assert.deepEqual(r.colorList.slice().sort(), ['交通', '餐饮']);
  // 两个「餐饮」账户共享同一 colorKey
  const foodBlocks = r.blocks.filter((b) => b.colorKey === '餐饮');
  assert.equal(foodBlocks.length >= 1, true);
  assert.equal(r.colorIndex.size, 2, '颜色数 = 分类数，不因类型不同而增加');
});

test('颜色：跟随转入方的统计分类', () => {
  const colorIndex = new Map([['餐饮', 0], ['储蓄', 1]]);
  const ctx = {
    byId,
    colorKeyOf: (id) => (id === 'a_food' ? '餐饮' : '储蓄'),
    colorIndex,
  };

  const toFood = calcLinkStyle({ from_id: 'a_bank', to_id: 'a_food' }, ctx, 5);
  const toBank = calcLinkStyle({ from_id: 'a_food', to_id: 'a_bank' }, ctx, 5);

  assert.notEqual(toFood.strokeColor, toBank.strokeColor, '线色应由转入方的统计分类决定');
  assert.equal(toFood.colorKey, '餐饮');
  assert.equal(toBank.colorKey, '储蓄');
});

/* ---------- 几何 ---------- */

test('几何：坐标全部算好，渲染器不用三角函数', () => {
  const g = chordGeometry(640, 640, 596, -Math.PI / 2, 0);
  assert.equal(g.from.length, 2);
  assert.equal(g.to.length, 2);
  // 9 点方向（-π/2）在环上：x = cx + r·sin(-π/2) = cx - r
  assert.equal(Math.round(g.from[0]), 640 - 596);
  assert.equal(Math.round(g.from[1]), 640);
});

test('透明度：全局 0.2，命中 0.95，无关 0.02', () => {
  assert.equal(linkOpacity({ active: false }), OPACITY.GLOBAL);
  assert.equal(linkOpacity({ active: true, hit: true }), OPACITY.HIT);
  assert.equal(linkOpacity({ active: true, related: true }), OPACITY.RELATED);
  assert.equal(linkOpacity({ active: true }), OPACITY.DIM);
});

/* ---------- 反向溯源（功能一） ---------- */

test('★ 反向溯源：从费用追回源头', () => {
  const links = [
    tx('a_salary', 'a_bank'),   // 0 工资 → 招行储
    tx('a_bank', 'a_food'),     // 1 招行储 → 餐饮
    tx('a_card', 'a_food'),     // 2 招行信 → 餐饮
    tx('a_cash', 'a_traffic'),  // 3 现金 → 交通（无关）
  ];
  const r = traceUpstream(links, 'a_food');

  assert.deepEqual(r.linkIndices.sort((a, b) => a - b), [0, 1, 2], '应包含两条直达 + 一条更上游');
  assert.equal(r.accountIds.includes('a_salary'), true, '要能追到最上游');
  assert.equal(r.accountIds.includes('a_cash'), false, '无关账户不能进来');
});

test('反向溯源：深度记录（离费用端越近越浅）', () => {
  const links = [tx('a_salary', 'a_bank'), tx('a_bank', 'a_food')];
  const r = traceUpstream(links, 'a_food');
  assert.equal(r.depths.get('a_food'), 0);
  assert.equal(r.depths.get('a_bank'), 1);
  assert.equal(r.depths.get('a_salary'), 2);
});

test('反向溯源：环路不会死循环', () => {
  const links = [
    tx('a_bank', 'a_card'),   // A → B
    tx('a_card', 'a_bank'),   // B → A（倒卡）
    tx('a_card', 'a_food'),
  ];
  const r = traceUpstream(links, 'a_food');
  assert.ok(r.linkIndices.length <= links.length, '不能重复计入同一条边');
});

test('按账户取往来（点弧块）', () => {
  const links = [tx('a_bank', 'a_food'), tx('a_food', 'a_bank'), tx('a_cash', 'a_traffic')];
  assert.deepEqual(traceByAccount(links, 'a_bank'), [0, 1]);
});

/* ---------- 追踪链：逆流 / 顺流是画法，链不变 ---------- */

test('★ 侧栏条目：链含这笔本身，能追到源头（方向不参与选链）', () => {
  const links = [tx('a_salary', 'a_bank'), tx('a_bank', 'a_food'), tx('a_card', 'a_food')];
  assert.deepEqual(traceFromTx(links, 1).linkIndices, [0, 1, 2]);
});

test('侧栏条目：单边流水只剩这笔自己', () => {
  const links = [{ from_id: '', to_id: 'a_bank', amount: 1, date: '2026-08-01' }];
  assert.deepEqual(traceFromTx(links, 0).linkIndices, [0]);
});

test('侧栏条目：下标越界 / 非法时返回空链（不抛错）', () => {
  const links = [tx('a_salary', 'a_bank')];
  assert.deepEqual(traceFromTx(links, 9).linkIndices, []);
  assert.deepEqual(traceFromTx(links, -1).linkIndices, []);
  assert.deepEqual(traceFromTx(links, 'x').linkIndices, []);
});

/* ---------- 方向 = 画法：两套完全独立的样式规则 ---------- */

test('★ 两套样式规则各自独立：颜色取哪一端 + 自己的线宽表', () => {
  assert.equal(STYLE_UP.colorBy, 'to', '逆流看转入方');
  assert.equal(STYLE_DOWN.colorBy, 'from', '顺流看转出方');
  assert.equal(styleOf('up'), STYLE_UP);
  assert.equal(styleOf('down'), STYLE_DOWN);

  // 两张表不是同一个对象，也不是同一张表换顺序 —— 各写各的
  assert.notEqual(STYLE_UP.traceWidth, STYLE_DOWN.traceWidth);
  assert.equal(STYLE_UP.traceWidth.费用, 6);
  assert.equal(STYLE_DOWN.traceWidth.费用, 1.2);
  assert.equal(STYLE_UP.traceWidth.收入, 1.2);
  assert.equal(STYLE_DOWN.traceWidth.收入, 6);
});

test('★ 逆流颜色取转入方、顺流颜色取转出方', () => {
  const colorKeyOf = (id) => (byId.get(id) || {}).category || '';
  const colorIndex = new Map([['储蓄', 0], ['日常', 2], ['薪金', 4]]);
  const ctx = { byId, colorKeyOf, colorIndex };
  const link = tx('a_salary', 'a_bank');   // 工资（薪金）→ 招行储（储蓄）

  const up = calcLinkStyle(link, ctx, 10);
  const down = calcLinkStyle(link, ctx, 10, { colorBy: 'from' });
  assert.equal(up.colorKey, '储蓄', '逆流看转入方');
  assert.equal(down.colorKey, '薪金', '顺流看转出方');
  assert.notEqual(up.strokeColor, down.strokeColor, '两条规则必须给出不同颜色');
});

/* ---------- 方向 = 画法：第 4 模式的线宽取哪一端 ---------- */

test('★ 追踪线宽·逆流：看转入方，费用 6 / 资产 3.6 / 负债 2.4 / 收入·权益 1.2', () => {
  assert.equal(traceWidthOf('费用类', 'up'), 6);
  assert.equal(traceWidthOf('资产类', 'up'), 3.6);
  assert.equal(traceWidthOf('负债类', 'up'), 2.4);
  assert.equal(traceWidthOf('收入类', 'up'), 1.2);
  assert.equal(traceWidthOf('权益类', 'up'), 1.2);
});

test('★ 追踪线宽·顺流：看转出方，收入·权益 6 / 负债 4 / 储蓄(资产) 2.4 / 费用 1.2', () => {
  assert.equal(traceWidthOf('收入类', 'down'), 6);
  assert.equal(traceWidthOf('权益类', 'down'), 6);
  assert.equal(traceWidthOf('负债类', 'down'), 4);
  assert.equal(traceWidthOf('资产类', 'down'), 2.4);
  assert.equal(traceWidthOf('费用类', 'down'), 1.2);
});

test('追踪线宽：认不出的类型落到兜底，不返回 undefined', () => {
  assert.equal(traceWidthOf('其它', 'down'), TRACE_FLOOR);
  assert.equal(traceWidthOf('', 'up'), TRACE_FLOOR);
});

/* ---------- 功能二：资产负债腾挪 ---------- */

test('★ 杠杆子图：只保留「资产/负债」两端都在的边', () => {
  const links = [
    tx('a_bank', 'a_card'),    // 资产 → 负债 ✓
    tx('a_card', 'a_bank'),    // 负债 → 资产 ✓
    tx('a_bank', 'a_food'),    // 资产 → 费用 ✗
    tx('a_salary', 'a_bank'),  // 收入 → 资产 ✗
  ];
  assert.deepEqual(extractLeverageLinks(links, byId), [0, 1]);
});

test('环路检测：倒卡是环', () => {
  const cyc = [tx('a_bank', 'a_card'), tx('a_card', 'a_bank')];
  assert.equal(hasCycle(cyc, byId), true);

  const acyclic = [tx('a_bank', 'a_card'), tx('a_card', 'a_food')];
  assert.equal(hasCycle(acyclic, byId), false);
});
