// 脉络：分类泡、排队飞行、相切轮廓
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flyLocal, bagShare, bridgeOutline, pixelsPerDay } from '../js/core/bubble-motion.js';
import { assembleScene } from '../js/core/bubble-scene.js';
import { buildLifeVein } from '../js/core/lifevein-model.js';

test('公切轮廓：靠近有四段弧，拉开就没有', () => {
  assert.equal(bridgeOutline({ x: 0, y: 0, r: 30 }, { x: 400, y: 0, r: 30 }), null);
  const outline = bridgeOutline({ x: 0, y: 0, r: 40 }, { x: 70, y: 0, r: 28 });
  assert.equal(outline.length, 4);
  assert.ok(outline[1].r > 4 && outline[1].r < 40);
  assert.deepEqual(outline, bridgeOutline({ x: 0, y: 0, r: 40 }, { x: 70, y: 0, r: 28 }));
});

test('同一天多笔错开，后一笔还没开始飞', () => {
  assert.ok(flyLocal(0.3, 0, 4) > flyLocal(0.3, 3, 4));
  assert.ok(flyLocal(0.3, 3, 4) < 0);
  assert.equal(flyLocal(0.4, 0, 1), 0.4);
  assert.equal(bagShare('spend', 0.2), 0);
  assert.equal(bagShare('spend', 2), 1);
});

test('同一天同一分类并成一颗，每笔仍各自飞', () => {
  const state = {
    accounts: [
      { id: 'bank', name: '储蓄卡', type: '资产类', category: '储蓄' },
      { id: 'food', name: '早餐', type: '费用类', category: '日常' },
      { id: 'snack', name: '零食', type: '费用类', category: '日常' },
      { id: 'metro', name: '地铁', type: '费用类', category: '通勤' },
      { id: 'salary', name: '工资', type: '收入类', category: '工资' },
    ],
    transactions: [
      { id: 'a', seq: 1, date: '2026-08-02', from_id: 'bank', to_id: 'food', amount: 20 },
      { id: 'b', seq: 2, date: '2026-08-02', from_id: 'bank', to_id: 'snack', amount: 15 },
      { id: 'c', seq: 3, date: '2026-08-02', from_id: 'bank', to_id: 'metro', amount: 6 },
      { id: 'd', seq: 4, date: '2026-08-02', from_id: 'salary', to_id: 'bank', amount: 800 },
    ],
  };
  const m = buildLifeVein(state, '2026-08-06');
  assert.equal(m.events.find((e) => e.toId === 'food').cat, '日常');
  assert.equal(m.events.find((e) => e.toId === 'metro').queue, 2);
  assert.equal(m.txCount, 4);
  const h = 700;
  const ppd = pixelsPerDay(m.vspan, h, 1);
  const day = m.events[0].vday;
  const yDone = h * 0.08;
  const done = assembleScene(m, { scrollDay: day - (yDone - h / 2) / ppd, ppd, width: 390, height: h });
  assert.equal(done.flies.length, 0);
  const daily = done.right.find((b) => b.name === '日常');
  const commute = done.right.find((b) => b.name === '通勤');
  assert.ok(daily && Math.round(daily.amount) === 35);
  assert.ok(commute && Math.round(commute.amount) === 6);
  assert.equal(done.right.filter((b) => b.name === '日常').length, 1);
  const pay = done.left.find((b) => b.name === '工资');
  assert.ok(pay && Math.round(pay.amount) === 800);
  const y = h * 0.48;
  const mid = assembleScene(m, { scrollDay: day - (y - h / 2) / ppd, ppd, width: 390, height: h });
  assert.equal(mid.right.filter((b) => b.name === '日常').length, 1);
  assert.equal(mid.flies.length, 0);
  if (mid.right.length >= 2) {
    const d = Math.hypot(mid.right[0].x - mid.right[1].x, mid.right[0].y - mid.right[1].y);
    assert.ok(d + 0.5 >= mid.right[0].r + mid.right[1].r);
  }
  assert.ok(mid.flies.every((f) => f.amount <= 800));
  const names = mid.flies.map((f) => f.name);
  assert.equal(new Set(names).size, names.length);
});
