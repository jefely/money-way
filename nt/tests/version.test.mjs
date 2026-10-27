/**
 * 版本与更新判定测试。
 *
 * 版本号是本项目最容易写歪的一处：sw.js 与 JS 各有一份，
 * 比较规则错了会「明明有新版却说已最新」。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  APP_VER, parseVer, isNewer, pickBigger, normalizeVer,
  versionFromSwText, versionFromHtmlText, decideUpdate,
} from '../js/core/version.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const NT = join(HERE, '..');

test('APP_VER 形如 nt-vX.YY', () => {
  assert.match(APP_VER, /^nt-v\d+\.\d+/, APP_VER);
});

test('parseVer：主×1000 + 次', () => {
  assert.equal(parseVer('nt-v0.04'), 4);
  assert.equal(parseVer('v13.66'), 13066);   // 13×1000 + 66
  assert.equal(parseVer('0.02'), 2);
  assert.equal(parseVer('乱写'), -1);
});

test('isNewer 基本判断', () => {
  assert.equal(isNewer('nt-v0.05', 'nt-v0.04'), true);
  assert.equal(isNewer('nt-v0.04', 'nt-v0.05'), false);
  assert.equal(isNewer('nt-v0.04', 'nt-v0.04'), false, '同版本不算更新');
});

test('跨大版本：v1.00 比 v0.99 新', () => {
  assert.equal(isNewer('nt-v1.00', 'nt-v0.99'), true);
});

test('pickBigger 取较大者', () => {
  assert.equal(pickBigger('nt-v0.03', 'nt-v0.04'), 'nt-v0.04');
  assert.equal(pickBigger('nt-v0.04', 'nt-v0.03'), 'nt-v0.04');
});

test('normalizeVer 统一前缀', () => {
  assert.equal(normalizeVer('v0.04'), 'nt-v0.04');
  assert.equal(normalizeVer('0.04'), 'nt-v0.04');
  assert.equal(normalizeVer('nt-v0.04'), 'nt-v0.04');
  assert.equal(normalizeVer('乱写'), '');
});

test('★ 从 sw.js 抠版本：只取前两段', () => {
  const text = "const CACHE_NAME = 'nt-v0.04.01';";
  assert.equal(versionFromSwText(text), 'nt-v0.04');
});

test('从 index.html 抠版本', () => {
  assert.equal(versionFromHtmlText("const APP_VER = 'nt-v0.05';"), 'nt-v0.05');
  assert.equal(versionFromHtmlText('没有版本号'), '');
});

test('★ decideUpdate：远端更新才更新', () => {
  const up = decideUpdate({ local: 'nt-v0.04', remote: 'nt-v0.05' });
  assert.equal(up.update, true);
  assert.equal(up.reason, 'newer');

  const same = decideUpdate({ local: 'nt-v0.04', remote: 'nt-v0.04' });
  assert.equal(same.update, false);
  assert.equal(same.reason, 'up-to-date');

  const none = decideUpdate({ local: 'nt-v0.04', remote: '' });
  assert.equal(none.update, false);
  assert.equal(none.reason, 'no-version');
});

test('★ 本地版本必须在**真实 sw.js 的 CACHE_NAME 里**（发版漏改会在这里暴露）', () => {
  const sw = readFileSync(join(NT, 'sw.js'), 'utf-8');
  const remote = versionFromSwText(sw);
  assert.equal(remote, APP_VER,
    `sw.js 的 CACHE_NAME 是 ${remote}，但 core/version.js 的 APP_VER 是 ${APP_VER} —— 两处必须一起改`);
});

test('★ 标题里的版本由运行时注入（不硬编码，避免两处不同步）', () => {
  const html = readFileSync(join(NT, 'index.html'), 'utf-8');
  const m = html.match(/<title>([^<]*)<\/title>/);
  assert.ok(m, '没有 title');
  // 标题本身不该再写死版本号
  assert.ok(!/v\d+\.\d+/.test(m[1]), '标题里不该硬编码版本：' + m[1]);

  // 但要能证明运行时会填
  const app = readFileSync(join(NT, 'js', 'app.js'), 'utf-8');
  assert.match(app, /document\.title\s*=.*APP_VER/, 'app.js 应在运行时把版本写进标题');
});
