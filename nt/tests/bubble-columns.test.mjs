import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLifeVein } from '../js/core/lifevein-model.js';
import { assembleScene, cameraFit } from '../js/core/bubble-scene.js';
import { pixelsPerDay } from '../js/core/bubble-motion.js';
import { LV_GROUPS, LV_SCHEMA } from '../js/core/lv-settings.js';
import { SCREENS, GROUP_SCREEN } from '../js/core/settings.js';

function book(n) {
  const accounts = [
    { id: 'salary', name: '工资', type: '收入类', category: '工资' },
    { id: 'huabei', name: '花呗', type: '负债类' },
    { id: 'yixiang', name: '宜享花', type: '负债类' },
    { id: 'loan58', name: '58贷', type: '负债类' },
    { id: 'citic', name: '中信信5607', type: '资产类' },
    { id: 'food', name: '日常', type: '费用类', category: '日常' },
    { id: 'metro', name: '通勤', type: '费用类', category: '通勤' },
  ];
  const tx = [];
  for (let i = 0; i < n; i += 1) {
    const date = '2026-08-' + String((i % 27) + 1).padStart(2, '0');
    tx.push({ id: 's' + i, seq: i * 3 + 1, date, from_id: 'salary', to_id: 'citic', amount: 80 + (i % 17) * 30 });
    tx.push({ id: 'h' + i, seq: i * 3 + 2, date, from_id: 'huabei', to_id: 'food', amount: 20 + (i % 9) * 15 });
    tx.push({ id: 'm' + i, seq: i * 3 + 3, date, from_id: 'citic', to_id: i % 2 ? 'metro' : 'food', amount: 12 + (i % 5) * 8 });
  }
  return buildLifeVein({ accounts, transactions: tx }, '2026-08-28');
}

function sceneAt(model, width, height) {
  const ppd = pixelsPerDay(model.vspan, height, 1, 0);
  return assembleScene(model, {
    scrollDay: model.vspan, ppd, width, height,
    zone: 0.8, windowPx: 880, dayGap: 0.65,
    xLiab: 35, xAsset: 65, insetL: 8, insetR: 8,
  });
}

test('宽屏四列从左到右：收入、负债、资产、费用，且不裁出屏幕', () => {
  const model = book(8);
  for (const width of [1280, 1920]) {
    const scene = sceneAt(model, width, 800);
    const left = scene.left.find((b) => b.name === '工资');
    const liab = scene.liab.find((b) => b.name === '花呗');
    const asset = scene.asset.find((b) => b.name === '中信信5607');
    const right = scene.right.find((b) => b.name === '日常');
    assert.ok(left && liab && asset && right, '四列都要有泡 ' + width);
    assert.ok(left.x < liab.x && liab.x < asset.x && asset.x < right.x, width + ' 列顺序');
    assert.ok(left.x < width * 0.28, '收入应靠左 ' + left.x);
    assert.ok(liab.x > width * 0.2 && liab.x < width * 0.5, '负债应在中左 ' + liab.x);
    assert.ok(asset.x > width * 0.5 && asset.x < width * 0.82, '资产应在中右 ' + asset.x);
    assert.ok(right.x > width * 0.72, '费用应靠右 ' + right.x);
    const cam = cameraFit(scene, width, 800);
    for (const b of [...scene.left, ...scene.liab, ...scene.asset, ...scene.right]) {
      const x = (b.x - width / 2) * cam.s + width / 2;
      assert.ok(x - b.r * cam.s >= -1 && x + b.r * cam.s <= width + 1, b.name + ' 裁切');
    }
  }
});

test('600 笔时静止泡互不重叠，列也不会堆到右边', () => {
  const model = book(200);
  assert.ok(model.txCount >= 600);
  const width = 1600;
  const scene = sceneAt(model, width, 900);
  const rest = [...scene.left, ...scene.liab, ...scene.asset, ...scene.right];
  for (let i = 0; i < rest.length; i += 1) {
    for (let j = i + 1; j < rest.length; j += 1) {
      const d = Math.hypot(rest[i].x - rest[j].x, rest[i].y - rest[j].y);
      assert.ok(d + 1.5 >= rest[i].r + rest[j].r, rest[i].name + '/' + rest[j].name);
    }
  }
  const rightmost = Math.max(...scene.left.map((b) => b.x), ...scene.liab.map((b) => b.x));
  assert.ok(rightmost < width * 0.62, '收入和负债不该贴到右边 ' + rightmost);
});

test('脉络参数在布局里单独一页，不再挂在主界面', () => {
  assert.ok(SCREENS.some((s) => s.id === 'vein' && s.label === '脉络'));
  assert.deepEqual(LV_GROUPS, ['背景/颗粒', '泡泡外观', '中心渐变', '大小分档', '文字', '动画/时间轴', '物理']);
  for (const g of LV_GROUPS) assert.equal(GROUP_SCREEN[g], 'vein');
  const keys = LV_SCHEMA.map((s) => s.key);
  assert.ok(keys.includes('脉络填充透明') && keys.includes('脉络倍率10万'));
  assert.equal(keys.length, new Set(keys).size);
});
