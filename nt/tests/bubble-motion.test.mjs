// 脉络气泡：进度、半径、分组相切、倒放同一帧
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  eventProgress, elastic, bubbleRadius, classifyFlow, flowFractions,
  shownBalance, gooAngles, packCluster, packEdge, yOfDay,
  pixelsPerDay, formatAmount, tangentBridge, juiceAt,
} from '../js/core/bubble-motion.js';
import { assembleScene } from '../js/core/bubble-scene.js';
import { buildLifeVein, balanceAt } from '../js/core/lifevein-model.js';

const H = 800;
const PPD = 40;

test('进度：下沿是 0，上沿是 1，正中是 0.5', () => {
  const day = 10;
  const at = (y) => {
    // y = H/2 + (day-scroll)*ppd  ⇒ scroll = day - (y - H/2)/ppd
    const scroll = day - (y - H / 2) / PPD;
    return eventProgress(day, scroll, PPD, H);
  };
  assert.ok(Math.abs(at(H * 0.75) - 0) < 1e-9);
  assert.ok(Math.abs(at(H * 0.25) - 1) < 1e-9);
  assert.ok(Math.abs(at(H * 0.5) - 0.5) < 1e-9);
});

test('上拖（scrollDay 变大）进度增加，下拖则倒回', () => {
  const a = eventProgress(5, 5, PPD, H);
  const b = eventProgress(5, 6, PPD, H);
  const c = eventProgress(5, 4, PPD, H);
  assert.ok(b > a && a > c);
});

test('弹性曲线两端钉死，倒放经过同一进度得到同一值', () => {
  assert.equal(elastic(0), 0);
  assert.equal(elastic(1), 1);
  assert.equal(elastic(0.4), elastic(0.4));
  assert.ok(elastic(0.35) > 0 && elastic(0.35) < 1);
});

test('半径随金额增大，但超大金额被夹住', () => {
  const a = bubbleRadius(20);
  const b = bubbleRadius(8000);
  const c = bubbleRadius(1e8);
  assert.ok(a < b && b < c);
  assert.ok(c <= 52);
  assert.equal(bubbleRadius(0), 2);
});

test('四种流向', () => {
  assert.equal(classifyFlow('收入类', '资产类'), 'inflow');
  assert.equal(classifyFlow('权益类', '资产类'), 'inflow');
  assert.equal(classifyFlow('负债类', '资产类'), 'borrow');
  assert.equal(classifyFlow('资产类', '费用类'), 'spend');
  assert.equal(classifyFlow('负债类', '费用类'), 'charge');
  assert.equal(classifyFlow('资产类', '负债类'), 'repay');
  assert.equal(classifyFlow('资产类', '成本类'), 'spend');
});

test('工资一开始就是满的，借款先从小变大', () => {
  const income = flowFractions('inflow', 0.15);
  const borrow = flowFractions('borrow', 0.12);
  assert.ok(income.fly > 0.9);
  assert.ok(borrow.fly < income.fly);
  assert.equal(flowFractions('inflow', 2).dst, 1);
  assert.equal(flowFractions('inflow', 2).fly, 0);
  assert.equal(flowFractions('spend', 2).marker, 1);
  assert.equal(flowFractions('charge', 0).fly, 0);
});

test('演完之后的存量等于账本余额，还没演到就是 0', () => {
  const state = {
    accounts: [
      { id: 'salary', name: '工资', type: '收入类' },
      { id: 'bank', name: '储蓄卡', type: '资产类' },
      { id: 'card', name: '信用卡', type: '负债类' },
      { id: 'food', name: '早餐', type: '费用类' },
    ],
    transactions: [
      { id: 'a', seq: 1, date: '2026-11-02', from_id: 'salary', to_id: 'bank', amount: 8000 },
      { id: 'b', seq: 2, date: '2026-11-03', from_id: 'card', to_id: 'bank', amount: 500 },
      { id: 'c', seq: 3, date: '2026-11-04', from_id: 'bank', to_id: 'food', amount: 80 },
      { id: 'd', seq: 4, date: '2026-11-05', from_id: 'bank', to_id: 'card', amount: 200 },
    ],
  };
  const m = buildLifeVein(state, '2026-11-06');
  const done = shownBalance(m.events, 'bank', true, 40, PPD, H);
  const debt = shownBalance(m.events, 'card', false, 40, PPD, H);
  assert.equal(done, balanceAt(m, 'bank', m.days - 1));
  assert.equal(debt, balanceAt(m, 'card', m.days - 1));
  assert.equal(shownBalance(m.events, 'bank', true, -20, PPD, H), 0);
  assert.equal(debt, 300); // 500 借入 − 200 还款
});

test('颈：靠近才有，拉开就断，越远越细', () => {
  assert.equal(gooAngles(0, 0, 30, 400, 0, 30), null);
  const near = gooAngles(0, 0, 30, 50, 0, 30);
  const far = gooAngles(0, 0, 30, 80, 0, 30);
  assert.ok(near && far);
  assert.ok(near.ha > far.ha);
  assert.deepEqual(near, gooAngles(0, 0, 30, 50, 0, 30));
});

test('簇内气泡相切不相交，两次结果相同', () => {
  const items = [
    { id: 'a', r: 28, name: '招行' },
    { id: 'b', r: 22, name: '现金' },
    { id: 'c', r: 16, name: '微信' },
  ];
  const limit = { top: 100, bottom: 500 };
  const once = packCluster(items, 200, 300, limit);
  const twice = packCluster(items, 200, 300, limit);
  assert.deepEqual(once, twice);
  for (let i = 0; i < once.length; i += 1) {
    for (let j = i + 1; j < once.length; j += 1) {
      const d = Math.hypot(once[i].x - once[j].x, once[i].y - once[j].y);
      assert.ok(d + 0.6 >= once[i].r + once[j].r, d);
    }
  }
});

test('停放泡的 y 钉在日期线上，重叠只往屏内让', () => {
  const parked = packEdge([
    { id: 'a', y: 100, r: 20, name: '早餐' },
    { id: 'b', y: 100, r: 18, name: '地铁' },
  ], 360, -1);
  assert.equal(parked[0].y, 100);
  assert.equal(parked[1].y, 100);
  assert.ok(Math.abs(parked[0].x - parked[1].x) >= 20 + 18 - 0.5);
});

test('空月被压短，几笔流水的动画窗口也不会缩成一天', () => {
  const state = {
    accounts: [
      { id: 'salary', name: '工资', type: '收入类' },
      { id: 'bank', name: '储蓄卡', type: '资产类' },
    ],
    transactions: [
      { id: 'a', seq: 1, date: '2026-08-01', from_id: 'salary', to_id: 'bank', amount: 1000 },
      { id: 'b', seq: 2, date: '2026-08-20', from_id: 'salary', to_id: 'bank', amount: 1000 },
    ],
  };
  const m = buildLifeVein(state, '2026-11-11');
  const gap = m.events[1].vday - m.events[0].vday;
  assert.ok(gap < 12, '日历隔了 19 天，视觉间隔应压到 12 以内，实际 ' + gap);
  assert.ok(m.days > 90);
  const ppd = pixelsPerDay(m.vspan, 700, 1);
  const horizonDays = (700 * 0.5) / ppd;
  assert.ok(horizonDays >= 2.2);
});

test('金额整数不带小数点，有零头才留一位', () => {
  assert.equal(formatAmount(12), '12');
  assert.equal(formatAmount(12.04), '12');
  assert.equal(formatAmount(12.26), '12.3');
  assert.equal(formatAmount(-8), '8');
});

test('挤压和冲击只由进度决定，两端收回', () => {
  const a = juiceAt(0);
  const b = juiceAt(0.5);
  const c = juiceAt(1);
  assert.ok(Math.abs(a.sx - 1) < 1e-6 && Math.abs(c.sx - 1) < 1e-6);
  assert.ok(b.sx > 1 && b.sy < 1);
  assert.ok(juiceAt(0.84).ripple > juiceAt(0.2).ripple);
  assert.deepEqual(juiceAt(0.4), juiceAt(0.4));
});

test('公切弧：靠近才有，越近弧越大', () => {
  assert.equal(tangentBridge({ x: 0, y: 0, r: 30 }, { x: 400, y: 0, r: 30 }), null);
  const near = tangentBridge({ x: 0, y: 0, r: 30 }, { x: 50, y: 0, r: 28 });
  const far = tangentBridge({ x: 0, y: 0, r: 30 }, { x: 70, y: 0, r: 28 });
  assert.ok(near && far && near.arcs.length === 2);
  assert.ok(near.rho > far.rho);
});

test('不同日期的飞泡不挤在同一条水平中线', () => {
  const state = {
    accounts: [
      { id: 'salary', name: '工资', type: '收入类' },
      { id: 'bank', name: '储蓄卡', type: '资产类' },
      { id: 'food', name: '早餐', type: '费用类' },
    ],
    transactions: [
      { id: 'a', seq: 1, date: '2026-08-02', from_id: 'salary', to_id: 'bank', amount: 800 },
      { id: 'b', seq: 2, date: '2026-08-06', from_id: 'bank', to_id: 'food', amount: 80 },
    ],
  };
  const m = buildLifeVein(state, '2026-08-10');
  const h = 700;
  const view = { scrollDay: m.vspan / 2, ppd: pixelsPerDay(m.vspan, h, 1), width: 390, height: h };
  const scene = assembleScene(m, view);
  if (scene.flies.length >= 2) {
    assert.ok(Math.abs(scene.flies[0].y - scene.flies[1].y) > 8);
  } else {
    assert.ok(scene.flies.length + scene.left.length + scene.right.length >= 1);
  }
});

test('静止泡迎向飞泡，飞走后回到锚点', () => {
  const state = {
    accounts: [
      { id: 'salary', name: '工资', type: '收入类' },
      { id: 'bank', name: '储蓄卡', type: '资产类' },
    ],
    transactions: [
      { id: 'a', seq: 1, date: '2026-08-02', from_id: 'salary', to_id: 'bank', amount: 800 },
    ],
  };
  const m = buildLifeVein(state, '2026-08-10');
  const h = 700;
  const ppd = pixelsPerDay(m.vspan, h, 1);
  const day = m.events[0].vday;
  const scroll = day + (0.15 * h) / ppd;
  const view = { scrollDay: scroll, ppd, width: 390, height: h };
  const scene = assembleScene(m, view);
  const bank = scene.asset.find((a) => a.name === '储蓄卡');
  assert.ok(bank && bank.ax != null);
  if (scene.flies.length) {
    const fly = scene.flies[0];
    const toward = Math.hypot(bank.x - fly.x, bank.y - fly.y);
    const anchor = Math.hypot(bank.ax - fly.x, bank.ay - fly.y);
    assert.ok(toward < anchor - 0.4);
  }
  const later = assembleScene(m, { scrollDay: day + 4, ppd, width: 390, height: h });
  const back = later.asset.find((a) => a.name === '储蓄卡');
  assert.ok(back);
  assert.ok(Math.hypot(back.x - back.ax, back.y - back.ay) < 0.5);
  assert.deepEqual(scene, assembleScene(m, view));
});

test('同一滚动位置组出来的帧完全一样', () => {
  const state = {
    accounts: [
      { id: 'salary', name: '工资', type: '收入类' },
      { id: 'bank', name: '储蓄卡', type: '资产类' },
      { id: 'card', name: '信用卡', type: '负债类' },
      { id: 'food', name: '早餐', type: '费用类' },
    ],
    transactions: [
      { id: 'a', seq: 1, date: '2026-11-02', from_id: 'salary', to_id: 'bank', amount: 8000 },
      { id: 'b', seq: 2, date: '2026-11-04', from_id: 'bank', to_id: 'food', amount: 80 },
    ],
  };
  const m = buildLifeVein(state, '2026-11-06');
  const view = { scrollDay: 2, ppd: PPD, width: 390, height: H };
  assert.deepEqual(assembleScene(m, view), assembleScene(m, view));
  const y = yOfDay(2, 2, PPD, H);
  assert.equal(y, H / 2);
});
