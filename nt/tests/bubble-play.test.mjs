import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLifeVein } from '../js/core/lifevein-model.js';
import { assembleScene, cameraFit } from '../js/core/bubble-scene.js';
import { pixelsPerDay, eventProgress } from '../js/core/bubble-motion.js';
import { playDay, playLayout, rulerFromPlay } from '../js/core/bubble-play.js';

const accounts = [
  { id: 'salary', name: '工资', type: '收入类', category: '工资' },
  { id: 'bank', name: '储蓄卡', type: '资产类', category: '储蓄' },
  { id: 'food', name: '餐饮', type: '费用类', category: '日常' },
  { id: 'card', name: '信用卡', type: '负债类', category: '信用' },
];

function book(txs) {
  return buildLifeVein({
    accounts,
    transactions: txs.map((t, i) => ({ id: 't' + i, seq: i + 1, ...t })),
  }, '2026-08-20');
}

const burst = book([
  { date: '2026-08-01', from_id: 'salary', to_id: 'bank', amount: 1000 },
  { date: '2026-08-02', from_id: 'bank', to_id: 'food', amount: 100 },
  { date: '2026-08-02', from_id: 'salary', to_id: 'bank', amount: 200 },
  { date: '2026-08-02', from_id: 'bank', to_id: 'food', amount: 50 },
  { date: '2026-08-02', from_id: 'card', to_id: 'food', amount: 30 },
]);

function view(m, scroll, width, height) {
  const h = height || 780;
  return {
    scrollDay: scroll, ppd: pixelsPerDay(m.vspan, h, 1), width: width || 390, height: h,
    zone: 0.8, windowPx: 640, dayGap: 0.65,
  };
}

test('同一资产上的飞行窗口互不重叠，别的账户可以同时飞', () => {
  const m = burst;
  const v = view(m, 0);
  const lay = playLayout(m, v.ppd, v.height, v.windowPx);
  const onBank = m.events.filter((e) => e.toId === 'bank' || e.fromId === 'bank');
  for (let i = 1; i < onBank.length; i += 1) {
    const gap = lay.slot.get(onBank[i].key) - lay.slot.get(onBank[i - 1].key);
    assert.ok(gap + 1e-6 >= lay.span, '间隔 ' + gap + ' < ' + lay.span);
  }
  const card = m.events.find((e) => e.fromId === 'card');
  const alongside = onBank.some((e) => Math.abs(lay.slot.get(e.key) - lay.slot.get(card.key)) < lay.span * 0.8);
  assert.ok(alongside, '不碰同一账户的刷卡可以和储蓄的飞行窗口重叠');
});

test('固定滚动是同一帧；往前滚同一笔只完成一次', () => {
  const m = burst;
  const v = view(m, 3);
  assert.deepEqual(assembleScene(m, v), assembleScene(m, v));
  const lay = playLayout(m, v.ppd, v.height, v.windowPx);
  const e = m.events.find((x) => x.amount === 200);
  let prev = -1;
  let crosses = 0;
  for (let s = lay.slot.get(e.key) - 2; s < lay.slot.get(e.key) + lay.span + 2; s += 0.25) {
    const p = eventProgress(lay.slot.get(e.key), s, v.ppd, v.height, 0.8, 640);
    assert.ok(p + 1e-9 >= prev);
    if (prev < 1 && p >= 1) crosses += 1;
    prev = p;
  }
  assert.equal(crosses, 1);
  const day = playDay(lay.marks, lay.slot.get(e.key));
  assert.ok(Math.abs(day - e.day) < 0.6, '拉长后仍是账上的那一天 ' + day);
});

test('在途时标签停在飞之前的余额，飞完才跳到精确的新余额', () => {
  const m = burst;
  const v = view(m, 0);
  const lay = playLayout(m, v.ppd, v.height, v.windowPx);
  const spend = m.events.find((e) => e.amount === 100);
  const slot = lay.slot.get(spend.key);
  const at = (p) => {
    const y = v.height * 0.9 - p * v.windowPx;
    return slot - (y - v.height / 2) / v.ppd;
  };
  const before = assembleScene(m, view(m, at(0.02)));
  const mid = assembleScene(m, view(m, at(0.45)));
  const after = assembleScene(m, view(m, at(1.08)));
  const amt = (scene) => {
    const b = scene.asset.find((x) => x.id === 'bank');
    return b ? b.amount : 0;
  };
  assert.ok(Math.abs(amt(before) - 1000) < 1, '飞之前 ' + amt(before));
  const fly = mid.flies.find((f) => f.amount === 100);
  assert.ok(fly, '在途应有 100 的飞泡');
  assert.ok(Math.abs(amt(mid) - 1000) < 1, '在途标签不滚动 ' + amt(mid));
  assert.ok(Math.abs(fly.amount - 100) < 0.01);
  assert.ok(Math.abs(amt(after) - 900) < 1, '完成后 ' + amt(after));
  const back = assembleScene(m, view(m, at(0.45)));
  assert.ok(Math.abs(amt(back) - 1000) < 1);
  const debtMid = mid.liab.find((x) => x.id === 'card');
  assert.ok(!debtMid || debtMid.amount < 1, '这笔支出不该提前增加欠款');
});

test('刷卡飞完欠款一次跳到精确数，倒回又回到原数', () => {
  const m = burst;
  const v = view(m, 0);
  const lay = playLayout(m, v.ppd, v.height, v.windowPx);
  const charge = m.events.find((e) => e.fromId === 'card');
  const slot = lay.slot.get(charge.key);
  const at = (p) => {
    const y = v.height * 0.9 - p * v.windowPx;
    return slot - (y - v.height / 2) / v.ppd;
  };
  const mid = assembleScene(m, view(m, at(0.4)));
  const done = assembleScene(m, view(m, at(1.08)));
  const debt = (scene) => {
    const b = scene.liab.find((x) => x.id === 'card');
    return b ? b.amount : 0;
  };
  assert.ok(mid.flies.some((f) => f.amount === 30));
  assert.ok(debt(mid) < 1, '在途欠款仍是 0 ' + debt(mid));
  assert.ok(Math.abs(debt(done) - 30) < 1, '完成后欠款 30 ' + debt(done));
  assert.ok(debt(assembleScene(m, view(m, at(0.4)))) < 1);
});

test('宽屏镜头不把左右缘挤到中间', () => {
  const m = book([
    { date: '2026-08-01', from_id: 'salary', to_id: 'bank', amount: 8000 },
    { date: '2026-08-03', from_id: 'bank', to_id: 'food', amount: 260 },
    { date: '2026-08-01', from_id: 'card', to_id: 'food', amount: 400 },
  ]);
  for (const [w, h] of [[1280, 800], [1920, 1080], [390, 780]]) {
    const base = view(m, 0, w, h);
    const lay = playLayout(m, base.ppd, h, base.windowPx);
    const preview = assembleScene(m, { ...base, scrollDay: lay.playSpan, cam: { s: 1, x: 0, y: 0 } });
    const cam = cameraFit(preview, w, h);
    const scene = assembleScene(m, { ...base, cam, scrollDay: lay.playSpan });
    const sx = (x) => w / 2 + (x - w / 2) * cam.s + (cam.x || 0);
    const card = scene.liab.find((b) => b.id === 'card');
    const bank = scene.asset.find((b) => b.id === 'bank');
    assert.ok(card, w + ' 应有负债');
    assert.ok(bank, w + ' 应有资产');
    assert.ok(sx(card.x - card.r) < w * 0.1, w + ' 负债左缘 ' + sx(card.x - card.r));
    assert.ok(Math.abs(sx(bank.x) - w / 2) < w * 0.22, w + ' 资产不在中间 ' + sx(bank.x));
    for (const b of scene.right) {
      assert.ok(sx(b.x + b.r) > w * 0.9, w + ' 费用右缘 ' + sx(b.x + b.r));
    }
  }
});

test('转账只贴真正的一端，不会同时陷进储蓄和零钱', () => {
  const accounts = [
    { id: 'salary', name: '工资', type: '收入类' },
    { id: 'bank', name: '储蓄卡', type: '资产类' },
    { id: 'bank2', name: '零钱', type: '资产类' },
    { id: 'food', name: '餐饮', type: '费用类', category: '日常' },
    { id: 'card', name: '信用卡', type: '负债类' },
  ];
  const model = buildLifeVein({
    accounts,
    transactions: [
      { id: 'a', seq: 1, date: '2026-08-01', from_id: 'salary', to_id: 'bank', amount: 2000 },
      { id: 'b', seq: 2, date: '2026-08-03', from_id: 'bank', to_id: 'bank2', amount: 300 },
    ],
  }, '2026-08-08');
  const v = view(model, 0);
  const lay = playLayout(model, v.ppd, v.height, v.windowPx);
  const ev = model.events.find((e) => e.amount === 300);
  const at = (p) => {
    const y = v.height * 0.9 - p * v.windowPx;
    return lay.slot.get(ev.key) - (y - v.height / 2) / v.ppd;
  };
  let buried = 0;
  for (const p of [0.05, 0.2, 0.45, 0.75, 0.95]) {
    const scene = assembleScene(model, view(model, at(p)));
    const fly = scene.flies.find((f) => f.amount === 300);
    const bank = scene.asset.find((b) => b.id === 'bank');
    const cash = scene.asset.find((b) => b.id === 'bank2');
    if (!fly || !bank) continue;
    const g = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
    if (g(fly, bank) < 0 && cash && g(fly, cash) < 0) buried += 1;
    assert.equal(fly.name, '转账');
    if (p < 0.25) assert.ok(g(fly, bank) < 8, '离开时贴着储蓄');
    if (p > 0.85 && cash && cash.r > 8) assert.ok(g(fly, cash) < 8, '到达时贴着零钱');
  }
  assert.ok(buried <= 1, '不应整段同时陷在两端 ' + buried);
  const again = assembleScene(model, view(model, at(0.45)));
  assert.deepEqual(again, assembleScene(model, view(model, at(0.45))));
});

test('同一天被拉长时标尺仍标这一天，不编出下一天', () => {
  const m = burst;
  const v = view(m, 0, 390, 780);
  const lay = playLayout(m, v.ppd, v.height, v.windowPx);
  const spend = m.events.find((e) => e.amount === 50);
  const at = lay.slot.get(spend.key);
  assert.ok(Math.abs(playDay(lay.marks, at) - spend.day) < 0.6);
  const marks = rulerFromPlay(m, lay.marks, at - 1, at + 1, v.ppd);
  const labels = marks.map((x) => x.label);
  assert.ok(labels.includes('2'), labels.join(','));
  assert.ok(!labels.includes('3') || marks.some((x) => x.span), labels.join(','));
});
