import test from 'node:test';
import assert from 'node:assert/strict';
import { labelLayout } from '../js/ui/bubble-ink.js';
import { normalize } from '../js/core/settings.js';

function meas(text, px) {
  return String(text).length * px * 0.55;
}

const same = {
  fontLock: '1',
  nameK: 0.32, amtK: 0.32,
  nameMin: 8, amtMin: 8,
  nameMax: 18, amtMax: 18,
};

test('默认同步时名称和金额字号相同，不再把金额单独缩小', () => {
  const lay = labelLayout(60, 1, same, '储蓄卡', '1,780.00', meas);
  assert.equal(lay.namePx, lay.amtPx);
  assert.equal(lay.namePx, 18);
});

test('超宽时两行共用一次缩放', () => {
  const longName = '招商银行储蓄卡账户';
  const longAmt = '12,345,678.90';
  const lay = labelLayout(36, 1, { ...same, nameMin: 1, amtMin: 1, nameMax: 40, amtMax: 40, nameK: 0.6, amtK: 0.2 }, longName, longAmt, meas);
  assert.equal(lay.namePx, lay.amtPx);
  assert.ok(lay.namePx < 36 * 0.6);
  assert.ok(meas(longAmt, lay.amtPx) <= 36 * 1.55 + 0.5);
});

test('关闭同步后金额可以用自己的字号', () => {
  const lay = labelLayout(80, 1, { ...same, fontLock: '关', amtK: 0.16, amtMin: 8, amtMax: 18 }, '储蓄卡', '800.00', meas);
  assert.ok(lay.amtPx < lay.namePx);
  assert.ok(Math.abs(lay.amtPx - 80 * 0.16) < 0.01);
});

test('旧的共用字号和自发光会抄到两套新参数，再归一化不会再乘一次', () => {
  const once = normalize({
    脉络字占比: 0.44,
    脉络最小字号: 11,
    脉络最大字号: 22,
    脉络自发光: 0.2,
  }, 'dark');
  assert.equal(once['脉络名称占比'], 0.44);
  assert.equal(once['脉络金额占比'], 0.44);
  assert.equal(once['脉络名称最小字号'], 11);
  assert.equal(once['脉络金额最小字号'], 11);
  assert.equal(once['脉络名称最大字号'], 22);
  assert.equal(once['脉络金额最大字号'], 22);
  assert.equal(once['脉络内发光'], 0.2);
  assert.equal(once['脉络外晕'], 0.2);
  assert.equal(once['脉络字号同步'], '开');
  const twice = normalize(once, 'dark');
  assert.equal(twice['脉络名称占比'], 0.44);
  assert.equal(twice['脉络外晕'], 0.2);
  const custom = normalize({ ...once, 脉络金额占比: 0.2, 脉络外晕: 0 }, 'dark');
  assert.equal(custom['脉络名称占比'], 0.44);
  assert.equal(custom['脉络金额占比'], 0.2);
  assert.equal(custom['脉络内发光'], 0.2);
  assert.equal(custom['脉络外晕'], 0);
});
