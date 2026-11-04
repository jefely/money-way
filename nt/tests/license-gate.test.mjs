/**
 * 到期、时钟回拨、功能门闩、设备名额、签名派生的会员模块。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { assess, has } from '../js/core/entitlements.js';
import { openPremium, renderPremium } from '../js/core/premium-open.js';
import { signatureToken } from '../js/core/premium-mask.js';
import { createState } from '../js/core/state-store.js';
import { isExpired, effectiveNow, seatDecision } from '../js/core/license-policy.js';
import { DEV_SEAL } from '../js/core/license-seal.js';
import { makeKey, issue } from './license-fixtures.mjs';

const NOW = 1700000000 * 1000;

function env(key, code, extra) {
  return Object.assign({
    code,
    publicKey: key.raw,
    nowMs: NOW,
    maxSeen: 0,
    installId: 'phone-a',
    activations: ['phone-a'],
    verifyOpts: { impl: 'pure' },
  }, extra || {});
}

test('过期码打不开功能；没到期的可以', async () => {
  const key = makeKey();
  const dead = issue(key, { expiry: 1600000000 });
  const live = issue(key, { expiry: 1800000000 });
  assert.equal(await has('report.advanced', env(key, dead.code)), false);
  assert.equal((await assess(env(key, dead.code))).reason, 'expired');
  assert.equal(await has('report.advanced', env(key, live.code)), true);
});

test('时钟回拨仍按见过的最大时间判断到期', () => {
  const expiry = 1700000100;
  const seen = expiry * 1000 + 5000;
  const rolled = expiry * 1000 - 86400000;
  assert.equal(effectiveNow(rolled, seen), seen);
  assert.equal(isExpired(expiry, effectiveNow(rolled, seen)), true);
  assert.equal(isExpired(expiry, effectiveNow(rolled, 0)), false);
  assert.equal(isExpired(0, seen), false);
});

test('回拨后的 has() 不会把过期码救活', async () => {
  const key = makeKey();
  const expiry = 1700000100;
  const { code } = issue(key, { expiry });
  const rolled = await has('report.advanced', env(key, code, {
    nowMs: expiry * 1000 - 86400000,
    maxSeen: expiry * 1000 + 1000,
  }));
  assert.equal(rolled, false);
});

test('档位和功能位决定 has()，没有单独的 isPro', async () => {
  const key = makeKey();
  const free = issue(key, { tier: 0, features: 0 });
  const plus = issue(key, { tier: 1, features: 0 });
  const custom = issue(key, { tier: 0, features: 0x0002 });
  assert.equal(await has('report.advanced', env(key, free.code)), false);
  assert.equal(await has('chart.ringExport', env(key, free.code)), false);
  assert.equal(await has('report.advanced', env(key, plus.code)), true);
  assert.equal(await has('chart.ringExport', env(key, plus.code)), false);
  assert.equal(await has('chart.ringExport', env(key, custom.code)), true);
  assert.equal(await has('report.advanced', env(key, custom.code)), false);
  assert.equal(await has('report.advanced', env(key, plus.code, { blocked: true })), false);
});

test('设备名额：超额拒绝，同一安装号不重复占用，0 为不限制', async () => {
  const key = makeKey();
  const { code } = issue(key, { seats: 1 });
  const first = await assess(env(key, code, { activations: [], installId: 'phone-a' }));
  assert.equal(first.ok, true);
  assert.deepEqual(first.record.activations, ['phone-a']);
  const second = await assess(env(key, code, {
    activations: first.record.activations,
    installId: 'phone-b',
  }));
  assert.equal(second.reason, 'seats');
  const again = await assess(env(key, code, {
    activations: first.record.activations,
    installId: 'phone-a',
  }));
  assert.equal(again.ok, true);
  const open = issue(key, { seats: 0 });
  assert.equal(seatDecision({ seats: 0, installId: 'x', activations: [] }).ok, true);
  assert.equal(await has('report.advanced', env(key, open.code, { activations: [], installId: 'new' })), true);
});

test('会员模块要用签名解出来，错误的密封钥解不开', async () => {
  const key = makeKey();
  const good = issue(key, { tier: 2, seal: DEV_SEAL });
  const spec = await openPremium('chart.ringExport', env(key, good.code));
  assert.equal(spec.title, '环图导出');
  assert.equal(spec.token, await signatureToken(good.sig, 'chart.ringExport'));
  assert.match(renderPremium(spec), /绑定 [0-9a-f]{16}/);
  assert.equal(renderPremium({ title: '环图导出', note: 'x' }), '');

  const wrongSeal = new Uint8Array(randomBytes(16));
  const bad = issue(key, { tier: 2, seal: wrongSeal });
  const opened = await openPremium('report.advanced', env(key, bad.code));
  assert.equal(opened, null);
  assert.equal(await has('report.advanced', env(key, bad.code)), true);
});

test('激活记录挂在 state 上，会随整本加密备份一起走', () => {
  const state = createState();
  assert.equal(state.license, null);
  state.license = { code: 'NT1-TEST', activations: ['a'], maxSeen: 5 };
  const copy = JSON.parse(JSON.stringify(state));
  assert.equal(copy.license.code, 'NT1-TEST');
  assert.equal(copy.license.activations[0], 'a');
  const ledger = readFileSync(new URL('../js/core/balance-calculator.js', import.meta.url), 'utf8');
  assert.equal(ledger.includes('entitlements'), false);
  assert.equal(ledger.includes('isPro'), false);
});
