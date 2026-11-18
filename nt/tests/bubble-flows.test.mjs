import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLifeVein } from '../js/core/lifevein-model.js';
import { assembleScene } from '../js/core/bubble-scene.js';
import { shownBalance, pixelsPerDay } from '../js/core/bubble-motion.js';
import { isDebitType } from '../js/core/schema.js';

const accounts = [
  { id: 'salary', name: '工资', type: '收入类', category: '工资' },
  { id: 'bank', name: '储蓄卡', type: '资产类', category: '储蓄' },
  { id: 'bank2', name: '零钱', type: '资产类', category: '储蓄' },
  { id: 'card', name: '信用卡', type: '负债类', category: '信用' },
  { id: 'loan', name: '借款', type: '负债类', category: '借款' },
  { id: 'food', name: '餐饮', type: '费用类', category: '日常' },
  { id: 'snack', name: '零食', type: '费用类', category: '日常' },
  { id: 'interest', name: '利息', type: '费用类', category: '利息' },
  { id: 'open', name: '期初余额', type: '权益类', category: '期初' },
];

const tx = [
  { id: 'o1', seq: 1, date: '2026-08-01', from_id: 'open', to_id: 'bank', amount: 1000, opening: true },
  { id: 'o2', seq: 2, date: '2026-08-01', from_id: 'card', to_id: 'open', amount: 400, opening: true },
  { id: 's', seq: 3, date: '2026-08-03', from_id: 'salary', to_id: 'bank', amount: 800 },
  { id: 'e1', seq: 4, date: '2026-08-05', from_id: 'bank', to_id: 'food', amount: 80 },
  { id: 'e2', seq: 5, date: '2026-08-05', from_id: 'bank', to_id: 'snack', amount: 20 },
  { id: 'c', seq: 6, date: '2026-08-07', from_id: 'card', to_id: 'food', amount: 50 },
  { id: 'i', seq: 7, date: '2026-08-07', from_id: 'card', to_id: 'interest', amount: 10 },
  { id: 'b', seq: 8, date: '2026-08-09', from_id: 'loan', to_id: 'bank', amount: 300 },
  { id: 'r', seq: 9, date: '2026-08-11', from_id: 'bank', to_id: 'card', amount: 120 },
  { id: 't', seq: 10, date: '2026-08-13', from_id: 'bank', to_id: 'bank2', amount: 100 },
  { id: 'z', seq: 11, date: '2026-08-15', from_id: 'bank2', to_id: 'food', amount: 100 },
];

function model() {
  return buildLifeVein({ accounts, transactions: tx }, '2026-08-20');
}

function view(m, scroll, width = 390, height = 780) {
  const ppd = pixelsPerDay(m.vspan, height, 1);
  return { scrollDay: scroll, ppd, width, height, zone: 0.8, windowPx: 640, dayGap: 0.65, fade: 0.18 };
}

function raw(m, id, scroll, width = 390, height = 780) {
  const a = m.accounts.find((x) => x.id === id);
  const ppd = pixelsPerDay(m.vspan, height, 1);
  return shownBalance(m.events, id, isDebitType(a.type), scroll, ppd, height, 0.8, 0.65, 640);
}

test('期末余额：工资进储蓄，刷卡欠款增加，还款和借款方向正确', () => {
  const m = model();
  const end = m.vspan + 30;
  const bank = raw(m, 'bank', end);
  const card = raw(m, 'card', end);
  const loan = raw(m, 'loan', end);
  const cash = raw(m, 'bank2', end);
  // 1000 期初 + 800 工资 − 80 − 20 + 300 借款 − 120 还款 − 100 转出
  assert.ok(Math.abs(bank - 1780) < 1, '储蓄 ' + bank);
  assert.ok(Math.abs(card - (400 + 50 + 10 - 120)) < 1, '欠款 ' + card);
  assert.ok(card > 0, '欠款应为正');
  assert.ok(Math.abs(loan - 300) < 1, '借款 ' + loan);
  assert.ok(Math.abs(cash - 0) < 1, '零钱花光 ' + cash);
  const scene = assembleScene(m, view(m, end));
  assert.ok(scene.asset.some((b) => b.id === 'bank'));
  assert.equal(scene.asset.some((b) => b.id === 'bank2'), false);
  assert.ok(scene.liab.some((b) => b.id === 'card' && b.x < 390 * 0.35));
  const daily = scene.right.filter((b) => b.name === '日常');
  assert.equal(daily.length, 3);
  const sum = daily.reduce((s, b) => s + b.amount, 0);
  assert.ok(Math.abs(sum - (80 + 20 + 50 + 100)) < 1);
});

test('刷卡在途时欠款已增加，分类合计先不含这笔', () => {
  const m = model();
  const cardEv = m.events.find((e) => e.fromId === 'card' && e.amount === 50);
  let hit = null;
  for (let s = cardEv.vday - 1; s < cardEv.vday + 4; s += 0.05) {
    const scene = assembleScene(m, view(m, s));
    const fly = scene.flies.find((f) => f.amount === 50 && f.kind === 'charge');
    if (!fly) continue;
    const debt = raw(m, 'card', s);
    const bag = scene.right.find((b) => b.id === 'R:' + cardEv.day + ':' + cardEv.cat);
    hit = { debt, bag: bag ? bag.amount : 0, fly };
    if (debt > 400 && (!bag || bag.amount < 50)) break;
  }
  assert.ok(hit, '应能看到 50 的刷卡飞泡');
  assert.ok(hit.debt > 400, '飞出时欠款增加 ' + hit.debt);
  assert.ok(hit.bag < 50, '在途不并进合计 ' + hit.bag);
});

test('工资从左下沿抛物线飞向储蓄，倒放是同一条弧', () => {
  const m = model();
  const ev = m.events.find((e) => e.fromId === 'salary');
  let early = null;
  let mid = null;
  for (let s = ev.vday - 2; s < ev.vday + 4; s += 0.03) {
    const scene = assembleScene(m, view(m, s, 360, 780));
    const fly = scene.flies.find((f) => f.amount === 800 && f.kind === 'inflow');
    if (!fly) continue;
    if (!early || fly.t < early.t) early = fly;
    if (!mid && fly.t > 0.35 && fly.t < 0.7) mid = { fly, scene, s };
  }
  assert.ok(early && mid);
  assert.ok(early.x < 140 && early.y > 680, '从左下出现 ' + early.x + ',' + early.y);
  const chord = (early.y + mid.scene.asset.find((b) => b.id === 'bank').y) / 2;
  assert.ok(Math.abs(mid.fly.y - chord) > 8, '中段离开直线');
  const again = assembleScene(m, view(m, mid.s, 360, 780));
  const fly2 = again.flies.find((f) => f.amount === 800);
  assert.equal(fly2.x, mid.fly.x);
  assert.equal(fly2.y, mid.fly.y);
  const bank = mid.scene.asset.find((b) => b.id === 'bank');
  assert.ok(bank);
  for (const o of [...mid.scene.liab, ...mid.scene.asset, ...mid.scene.right]) {
    if (o.id === mid.fly.dstId || o.id === mid.fly.srcId) continue;
    const d = Math.hypot(mid.fly.x - o.x, mid.fly.y - o.y);
    assert.ok(d + 1 >= mid.fly.r + o.r, '飞泡压到了 ' + o.name);
  }
});

test('借款连着负债和资产，还款后两边都变小', () => {
  const m = model();
  const end = m.vspan + 30;
  const before = raw(m, 'bank', m.events.find((e) => e.kind === 'borrow').vday - 0.2);
  const afterBorrow = raw(m, 'bank', m.events.find((e) => e.kind === 'repay').vday - 0.2);
  const afterRepay = raw(m, 'card', end);
  assert.ok(afterBorrow > before);
  assert.ok(afterRepay < 400 + 50 + 10);
  let linked = false;
  const bev = m.events.find((e) => e.kind === 'borrow');
  for (let s = bev.vday; s < bev.vday + 3; s += 0.08) {
    const scene = assembleScene(m, view(m, s, 360, 780));
    const fly = scene.flies.find((f) => f.kind === 'borrow');
    const loan = scene.liab.find((b) => b.id === 'loan');
    const bank = scene.asset.find((b) => b.id === 'bank');
    if (!fly || !loan || !bank) continue;
    const onSegment = fly.x > Math.min(loan.x, bank.x) - 30 && fly.x < Math.max(loan.x, bank.x) + 40;
    if (onSegment) linked = true;
  }
  assert.ok(linked, '借款飞泡应出现在负债和资产之间');
});

test('储蓄花光后节点消失，倒放又出现', () => {
  const m = model();
  const end = m.vspan + 30;
  const gone = assembleScene(m, view(m, end));
  assert.equal(gone.asset.some((b) => b.id === 'bank2'), false);
  const back = assembleScene(m, view(m, m.events.find((e) => e.toId === 'bank2').vday - 1));
  const early = raw(m, 'bank2', m.events.find((e) => e.toId === 'bank2').vday - 1);
  if (early > 1) assert.ok(back.asset.some((b) => b.id === 'bank2'));
  const mid = view(m, 2);
  assert.deepEqual(assembleScene(m, mid), assembleScene(m, mid));
});
