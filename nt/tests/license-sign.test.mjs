/**
 * 签名：有效、无效、被改过的载荷。WebCrypto 和纯 JS 都要过。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { finishCode } from '../js/core/license-codec.js';
import { verifyLicenseCode } from '../js/core/license-verify.js';
import { ed25519WebCryptoSupported } from '../js/core/ed25519.js';
import { makeKey, issue } from './license-fixtures.mjs';

test('有效签名：WebCrypto 与纯 JS 都通过', async () => {
  const key = makeKey();
  const { code } = issue(key, { user: 'ok' });
  assert.equal((await verifyLicenseCode(code, key.raw, { impl: 'pure' })).ok, true);
  if (await ed25519WebCryptoSupported()) {
    assert.equal((await verifyLicenseCode(code, key.raw, { impl: 'webcrypto' })).ok, true);
  }
  assert.equal((await verifyLicenseCode(code, key.raw)).ok, true);
});

test('别人的公钥验不过', async () => {
  const key = makeKey();
  const other = makeKey();
  const { code } = issue(key, { user: 'nope' });
  const verdict = await verifyLicenseCode(code, other.raw, { impl: 'pure' });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'signature');
});

test('载荷被改但校验位重算之后，签名仍然失败', async () => {
  const key = makeKey();
  const issued = issue(key, { tier: 1, user: 'tamper' });
  const decoded = await verifyLicenseCode(issued.code, key.raw, { impl: 'pure' });
  const body = Uint8Array.from(issued.payload);
  body[1] = 2;
  const evil = finishCode(body, issued.sig);
  const verdict = await verifyLicenseCode(evil, key.raw, { impl: 'pure' });
  assert.equal(decoded.ok, true);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'signature');
});

test('占位公钥不会把任何码当成有效', async () => {
  const key = makeKey();
  const { code } = issue(key, { user: 'placeholder' });
  const verdict = await verifyLicenseCode(code);
  assert.equal(verdict.reason, 'placeholder-key');
  const typo = await verifyLicenseCode(code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A'));
  assert.equal(typo.reason, 'checksum');
  const src = readFileSync(new URL('../js/core/license-pubkey.js', import.meta.url), 'utf8');
  assert.equal(src.includes('PRIVATE KEY'), false);
  assert.match(src, /AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=/);
});
