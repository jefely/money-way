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
  calcLinkStyle, categoryColor, WEIGHT_MAP, UNIT_WIDTH_RATIO,
  unitDegree as unitDegreeFromPath, chordGeometry, OPACITY, linkOpacity,
} from '../js/graph/mw-path-calculator.js';
import {
  traceUpstream, traceByAccount, extractLeverageLinks, hasCycle,
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
  assert.equal(toFood.strokeWidth, 32, '10 × 0.8 × 4 = 32');

  const toBank = calcLinkStyle({ from_id: 'a_salary', to_id: 'a_bank' }, ctx, unitArc);
  assert.equal(toBank.weight, 3, '转入是资产类 → 3 倍');
  assert.equal(toBank.strokeWidth, 24);

  const toCard = calcLinkStyle({ from_id: 'a_bank', to_id: 'a_card' }, ctx, unitArc);
  assert.equal(toCard.weight, 2, '转入是负债类 → 2 倍');
  assert.equal(toCard.strokeWidth, 16);

  assert.equal(UNIT_WIDTH_RATIO, 0.8);
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
