import { test } from 'node:test';
import assert from 'node:assert/strict';

import { saveThemeSettings, loadMergedSettings, loadUserSettings, loadThemeSettings } from '../js/ui/debug-themes.js';

/** 最小 ctx：只要 getState / setState，就是 app.js 里那两个 */
function makeCtx() {
  const state = { settings: {} };
  return {
    getState: () => state,
    setState: (patch) => Object.assign(state, patch),
  };
}

test('环图外圈线厚/间距跨主题统一：最后一次设置对所有主题生效', () => {
  const ctx = makeCtx();
  saveThemeSettings(ctx, 'dark', { 外圈线厚比例: 0.12, 外圈线间距比例: 0.06 }, 'user');
  saveThemeSettings(ctx, 'light', { 外圈线厚比例: 0.06, 外圈线间距比例: 0.03 }, 'user');

  for (const theme of ['light', 'dark', 'alt1', 'alt2']) {
    const m = loadMergedSettings(ctx, theme);
    assert.equal(m['外圈线厚比例'], 0.06, `${theme} 的线厚应统一成最后一次设置`);
    assert.equal(m['外圈线间距比例'], 0.03, `${theme} 的间距应统一成最后一次设置`);
  }
});

test('没设过时这两个键不混进主题设置（normalize 落回默认 0.1 / 0.05）', () => {
  const ctx = makeCtx();
  saveThemeSettings(ctx, 'dark', { 环厚: 90, 外圈线厚比例: 0.2 }, 'user');

  // 主题层只留自己的键（环厚），两个全局键不进主题层
  assert.equal(loadUserSettings(ctx, 'dark')['环厚'], 90);
  assert.ok(!('外圈线间距比例' in loadThemeSettings(ctx, 'light')));

  const light = loadMergedSettings(ctx, 'light');
  assert.equal(light['环厚'], undefined, '另一个主题不该拿到 dark 的环厚');
  assert.equal(light['外圈线厚比例'], 0.2, '全局值对所有主题生效');
  assert.ok(!('外圈线间距比例' in light), '没设过的全局键不该出现在合并结果里');
});

test('其它参数仍然按主题各存各的', () => {
  const ctx = makeCtx();
  saveThemeSettings(ctx, 'dark', { 环厚: 90 }, 'defaults');
  saveThemeSettings(ctx, 'light', { 环厚: 70 }, 'defaults');
  assert.equal(loadMergedSettings(ctx, 'dark')['环厚'], 90);
  assert.equal(loadMergedSettings(ctx, 'light')['环厚'], 70);
});
