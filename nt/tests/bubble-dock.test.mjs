import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLifeVein } from '../js/core/lifevein-model.js';
import { assembleScene, cameraFit } from '../js/core/bubble-scene.js';
import { playLayout, screenDayMarks } from '../js/core/bubble-play.js';
import { eventProgress } from '../js/core/bubble-motion.js';
import { LV_SCHEMA } from '../js/core/lv-settings.js';

const accounts = [
  { id: 'bank', name: '储蓄卡', type: '资产类' },
  { id: 'cash', name: '零钱', type: '资产类' },
  { id: 'fund', name: '理财', type: '资产类' },
  { id: 'card', name: '信用卡', type: '负债类' },
  { id: 'loan', name: '借款', type: '负债类' },
  { id: 'eq', name: '股本', type: '权益类' },
  { id: 'sal', name: '工资', type: '收入类' },
  { id: 'food', name: '餐饮', type: '费用类', category: '日常' },
  { id: 'cost', name: '设备', type: '成本类', category: '设备' },
];

const tx = [
  { id: '1', seq: 1, date: '2026-08-01', from_id: 'eq', to_id: 'bank', amount: 5000 },
  { id: '2', seq: 2, date: '2026-08-01', from_id: 'card', to_id: 'food', amount: 800 },
  { id: '3', seq: 3, date: '2026-08-02', from_id: 'loan', to_id: 'bank', amount: 1200 },
  { id: '4', seq: 4, date: '2026-08-03', from_id: 'sal', to_id: 'cash', amount: 600 },
  { id: '5', seq: 5, date: '2026-08-04', from_id: 'bank', to_id: 'cost', amount: 300 },
  { id: '6', seq: 6, date: '2026-08-04', from_id: 'bank', to_id: 'food', amount: 50 },
  { id: '7', seq: 7, date: '2026-08-02', from_id: 'bank', to_id: 'fund', amount: 700 },
];

function sceneAt(w, h, daysPer) {
  const m = buildLifeVein({ accounts, transactions: tx }, '2026-08-12');
  const ppd = h / daysPer;
  const base = { scrollDay: 4, ppd, width: w, height: h, windowPx: 640, zone: 0.8, daysPer, insetL: 0, insetR: 0 };
  const preview = assembleScene(m, { ...base, cam: { s: 1, x: 0, y: 0 } });
  const cam = cameraFit(preview, w, h);
  const scene = assembleScene(m, { ...base, cam });
  const sx = (x) => w / 2 + (x - w / 2) * cam.s + (cam.x || 0);
  return { m, scene, cam, sx, ppd };
}

test('负债和权益在窗口左缘，资产在中间，费用和成本在右缘', () => {
  for (const [w, h] of [[1920, 1080], [1280, 800], [360, 780], [393, 780]]) {
    const { scene, sx } = sceneAt(w, h, 3);
    assert.ok(scene.liab.length >= 1, w + ' 应有负债');
    assert.ok(scene.equity.some((b) => b.id === 'eq'), w + ' 应有权益');
    assert.ok(scene.asset.some((b) => b.id === 'bank'), w + ' 应有资产');
    const docked = [...scene.liab, ...scene.equity];
    const edges = docked.map((b) => sx(b.x - b.r));
    assert.ok(Math.min(...edges) < w * 0.08, w + ' 第一列应贴左缘 ' + Math.min(...edges));
    for (const b of docked) {
      assert.ok(sx(b.x) < w * 0.42, w + ' ' + b.name + ' 不应进资产区 ' + sx(b.x));
      assert.equal(scene.asset.some((a) => a.id === b.id), false);
    }
    const ax = scene.asset.map((b) => sx(b.x)).sort((a, b) => a - b);
    const bands = ax.filter((x, i) => !i || x - ax[i - 1] > 4);
    assert.ok(bands.length >= 3, w + ' 资产应是三列 ' + ax.join(','));
    for (const b of scene.asset) {
      assert.ok(sx(b.x) > w * 0.22 && sx(b.x) < w * 0.78, w + ' 资产停在中带 ' + b.name + ' ' + sx(b.x));
    }
    const right = scene.right;
    assert.ok(right.some((b) => b.name === '日常'));
    assert.ok(right.some((b) => b.name === '设备'));
    assert.ok(Math.max(...right.map((b) => sx(b.x + b.r))) > w * 0.9, w + ' 右缘应贴边');
    const same = right.filter((b) => b.id.startsWith('R:3:'));
    if (same.length >= 2) {
      const rx = same.map((b) => sx(b.x)).sort((a, b) => a - b);
      assert.ok(rx[rx.length - 1] - rx[0] > 4, w + ' 右缘应错成两列');
    }
    assert.deepEqual(scene.axes, []);
  }
});

test('两列错层：左缘至少能放下两张负债而不叠在同一点', () => {
  const { scene } = sceneAt(1280, 800, 3);
  const a = scene.liab[0];
  const b = scene.liab[1];
  assert.ok(a && b);
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(d + 1 >= a.r + b.r, '负债互相重叠 ' + d);
  assert.ok(Math.abs(a.x - b.x) > 8 || Math.abs(a.y - b.y) > 8);
});

test('一屏天数按日历日铺满画面高度，镜头缩放不改这个比例', () => {
  const m = buildLifeVein({ accounts, transactions: tx }, '2026-08-12');
  for (const days of [0.5, 1, 2, 3, 7]) {
    const h = 780;
    const marks = screenDayMarks(m, 4, days, h / days);
    const px = h / days;
    const top = h / 2 + ((4 - days / 2) - 4) * px;
    const bot = h / 2 + ((4 + days / 2) - 4) * px;
    assert.ok(Math.abs(top) < 1 && Math.abs(bot - h) < 1, days + ' 天没有铺满 ' + top + ',' + bot);
    assert.ok(marks.some((mk) => mk.vday >= 4 - days / 2 - 0.01 && mk.vday <= 4 + days / 2 + 0.01));
  }
});

test('用户这种多张卡在 1024 窗口上仍是左二中三右二，旧镜头和旧内边挤不回中间', () => {
  const accounts = [
    { id: 'jh', name: '交行信5776', type: '负债类' },
    { id: 'zx', name: '中信信5607', type: '负债类' },
    { id: 'zh', name: '招行信1007', type: '负债类' },
    { id: 'gf', name: '广发信', type: '负债类' },
    { id: 'yf', name: '其它应付', type: '负债类' },
    { id: 'd58', name: '58贷', type: '负债类' },
    { id: 'tl', name: '铜联贷', type: '负债类' },
    { id: 'bank', name: '储蓄卡', type: '资产类' },
    { id: 'cash', name: '零钱', type: '资产类' },
    { id: 'fund', name: '理财', type: '资产类' },
    { id: 'food', name: '餐饮', type: '费用类', category: '日常' },
    { id: 'ride', name: '交通', type: '费用类', category: '交通' },
  ];
  const tx = [
    { id: 'a', seq: 1, date: '2026-11-01', from_id: 'bank', to_id: 'cash', amount: 5000 },
    { id: 'b', seq: 2, date: '2026-11-19', from_id: 'jh', to_id: 'food', amount: 48158 },
    { id: 'c', seq: 3, date: '2026-11-19', from_id: 'zx', to_id: 'food', amount: 36855 },
    { id: 'd', seq: 4, date: '2026-11-19', from_id: 'zh', to_id: 'food', amount: 74884 },
    { id: 'e', seq: 5, date: '2026-11-19', from_id: 'gf', to_id: 'ride', amount: 16865 },
    { id: 'f', seq: 6, date: '2026-11-19', from_id: 'yf', to_id: 'food', amount: 27100 },
    { id: 'g', seq: 7, date: '2026-11-19', from_id: 'd58', to_id: 'ride', amount: 7297 },
    { id: 'h', seq: 8, date: '2026-11-19', from_id: 'tl', to_id: 'food', amount: 16759 },
    { id: 'i', seq: 9, date: '2026-11-01', from_id: 'cash', to_id: 'fund', amount: 2000 },
  ];
  const m = buildLifeVein({ accounts, transactions: tx }, '2026-11-20');
  for (const [w, h] of [[1024, 727], [1920, 1080], [360, 780]]) {
    const base = {
      scrollDay: 19, ppd: h / 3, width: w, height: h, windowPx: 880, zone: 0.8,
      daysPer: 3, insetL: 6, insetR: 6, gap: 4, cam: { s: 0.2, x: 0, y: 0 },
    };
    const preview = assembleScene(m, { ...base, cam: { s: 1, x: 0, y: 0 } });
    const fitted = cameraFit(preview, w, h);
    const scene = assembleScene(m, { ...base, cam: fitted });
    const sx = (x) => w / 2 + (x - w / 2) * fitted.s;
    const cols = (list) => {
      const xs = list.map((b) => sx(b.x)).sort((a, b) => a - b);
      return xs.filter((x, i) => !i || x - xs[i - 1] > Math.max(8, w * 0.015));
    };
    assert.equal(fitted.s, 1, '适配镜头不能再缩小整帧');
    assert.ok(scene.liab.length >= 4, '多张负债都要在');
    const liabCols = cols(scene.liab);
    assert.ok(liabCols.length >= 2, w + ' 负债应是两列 ' + liabCols.join(','));
    const leftEdges = scene.liab.map((b) => sx(b.x) - b.r * fitted.s);
    assert.ok(Math.min(...leftEdges) <= w * 0.045, w + ' 第一列应贴左缘 ' + Math.min(...leftEdges));
    for (const b of scene.liab) assert.ok(sx(b.x) < w * 0.32, b.name + ' 不应进中带 ' + sx(b.x));
    const assetCols = cols(scene.asset);
    assert.ok(assetCols.length >= 3, w + ' 资产应是三列 ' + assetCols.join(','));
    for (const b of scene.asset) {
      const x = sx(b.x);
      assert.ok(x > w * 0.32 && x < w * 0.68, b.name + ' 应在中带 ' + x);
    }
    const right = scene.right.filter((b) => b.amount > 0);
    assert.ok(right.some((b) => b.name === '日常') && right.some((b) => b.name === '交通'));
    const rightCols = cols(right);
    assert.ok(rightCols.length >= 2, w + ' 右缘应是两列 ' + rightCols.join(','));
    assert.ok(Math.max(...right.map((b) => sx(b.x + b.r))) >= w * 0.95, w + ' 右缘第一列应贴边');
    for (const b of right) assert.ok(sx(b.x) > w * 0.68, b.name + ' 不应进中带 ' + sx(b.x));
  }
});

test('布局里有一屏天数，轴线参数已撤下', () => {
  const days = LV_SCHEMA.find((s) => s.key === '脉络一屏天数');
  assert.ok(days);
  assert.equal(days.def, 3);
  assert.ok(days.min <= 0.5 && days.max >= 7);
  assert.equal(LV_SCHEMA.some((s) => s.key === '脉络轴线'), false);
  assert.equal(LV_SCHEMA.find((s) => s.field === 'insetL').def, 0);
});

test('一屏天数下同一账户当天多笔只在当天内排开，不拉长日历', () => {
  const many = tx.concat([
    { id: '7', seq: 7, date: '2026-08-04', from_id: 'bank', to_id: 'food', amount: 20 },
    { id: '8', seq: 8, date: '2026-08-04', from_id: 'bank', to_id: 'food', amount: 21 },
    { id: '9', seq: 9, date: '2026-08-04', from_id: 'bank', to_id: 'cost', amount: 22 },
  ]);
  const m = buildLifeVein({ accounts, transactions: many }, '2026-08-12');
  const h = 800;
  const play = playLayout(m, h / 3, h, 880, { lockDay: true });
  const day3 = m.events.filter((e) => e.day === 3 && (e.fromId === 'bank' || e.toId === 'bank'));
  const slots = day3.map((e) => play.slot.get(e.key)).sort((a, b) => a - b);
  for (let i = 1; i < slots.length; i += 1) assert.ok(slots[i] >= slots[i - 1] - 1e-9);
  assert.ok(slots[slots.length - 1] < 4, '排开不应越过次日 ' + slots.join(','));
  const marks = screenDayMarks(m, 4, 3, h / 3);
  const ys = [3, 4, 5].map((d) => 400 + (d - 4) * (h / 3));
  assert.ok(Math.abs(ys[1] - ys[0] - h / 3) < 1);
  assert.ok(marks.every((mk) => Math.abs((400 + (mk.vday - 4) * (h / 3)) - 400) <= h / 2 + h / 3));
});

test('停靠列不因别的节点出现而换列，并入末段不跳', () => {
  const m = buildLifeVein({ accounts, transactions: tx }, '2026-08-12');
  const w = 1280;
  const h = 800;
  const view = { ppd: h / 3, width: w, height: h, windowPx: 640, zone: 0.8, daysPer: 3, insetL: 0, insetR: 0, cam: { s: 1, x: 0, y: 0 } };
  const at = (scroll) => assembleScene(m, { ...view, scrollDay: scroll });
  const early = at(2);
  const late = at(5);
  for (const id of ['bank', 'cash']) {
    const a = early.asset.find((b) => b.id === id);
    const b = late.asset.find((b) => b.id === id);
    if (!a || !b) continue;
    assert.equal(a.slot, b.slot, id + ' 列位变了');
  }
  const ppd = h / 3;
  const anim = Math.min(640, ppd * 0.9);
  const play = playLayout(m, ppd, h, anim, { lockDay: true });
  const ev = m.events.find((e) => e.kind === 'inflow' && e.toId === 'cash');
  const slot = play.slot.get(ev.key);
  const win = play.dur.get(ev.key);
  const bot = h * 0.9;
  const scrollFor = (p) => slot - (bot - h / 2 - p * win) / ppd;
  const ps = [0.9, 0.95, 0.98, 0.99, 1, 1.08];
  const frames = ps.map((p) => ({ p, scene: at(scrollFor(p)) }));
  const hostOf = (scene) => scene.asset.find((b) => b.id === 'cash');
  let prevD = 1e9;
  let prevR = 1e9;
  for (const fr of frames) {
    const fly = fr.scene.flies.find((f) => f.id === 'F' + ev.key);
    const host = hostOf(fr.scene);
    assert.ok(fly, 'p=' + fr.p + ' 收入文字或飞泡不见了');
    assert.equal(fly.amount, 600);
    if (fr.p <= 1) {
      const dist = Math.hypot(fly.x - host.x, fly.y - host.y);
      assert.ok(dist <= prevD + 1, '收尾距离反弹 ' + prevD + '→' + dist);
      assert.ok(fly.r <= prevR + 0.5, '收尾半径反弹 ' + prevR + '→' + fly.r);
      prevD = dist;
      prevR = fly.r;
      assert.ok(fly.fade > 0.98, '并入过程文字不该先淡掉 ' + fly.fade);
    } else {
      assert.ok(fly.ghost && fly.r === 0, '完成后不该再留一颗身体');
      assert.ok(fly.fade < 1 && fly.fade > 0, '完成后文字应在渐隐 ' + fly.fade);
      assert.ok(Math.hypot(fly.x - host.x, fly.y - host.y) < 1);
    }
  }
  assert.ok(prevD < 8, '到 0.99 还没贴上终点 ' + prevD);
  assert.ok(prevR < 6, '到 0.99 半径还没收 ' + prevR);
  const p99 = eventProgress(slot, scrollFor(0.99), ppd, h, 0.8, win);
  assert.ok(Math.abs(p99 - 0.99) < 0.02);
  assert.deepEqual(at(scrollFor(0.95)), at(scrollFor(0.95)));
});
