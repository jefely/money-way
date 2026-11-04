/**
 * 激活码的编码、分组和抄写校验。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import {
  b32decode, b32encode, crc16, decodeCode, encodePayload, finishCode, normalizeCodeText,
} from '../js/core/license-codec.js';
import { DEV_SEAL } from '../js/core/license-seal.js';
import { makeKey, issue } from './license-fixtures.mjs';

test('CRC16-CCITT-FALSE 对 123456789 得到 0x29B1', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc16(bytes), 0x29b1);
});

test('base32 往返任意字节', () => {
  const raw = new Uint8Array(randomBytes(90));
  assert.deepEqual(b32decode(b32encode(raw)), raw);
  const one = new Uint8Array([0xff]);
  assert.deepEqual(b32decode(b32encode(one)), one);
});

test('载荷编码后能解码出持有人、档位和到期', () => {
  const id = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const payload = encodePayload({
    tier: 1,
    features: 1,
    seats: 2,
    issued: 1700000000,
    expiry: 1800000000,
    licenseId: id,
    seal: DEV_SEAL,
    user: '张三',
  });
  const key = makeKey();
  const code = finishCode(payload, new Uint8Array(64));
  const decoded = decodeCode(code.toLowerCase() + '\n');
  assert.equal(decoded.ok, true);
  assert.equal(decoded.payload.user, '张三');
  assert.equal(decoded.payload.tier, 1);
  assert.equal(decoded.payload.seats, 2);
  assert.equal(decoded.payload.expiry, 1800000000);
  assert.deepEqual(decoded.payload.licenseId, id);
  assert.match(code, /^NT1(-[0-9A-HJKMNP-TV-Z]{1,4})+$/);
});

test('空格、横线和 I/L/O 容错后仍能解码', () => {
  const key = makeKey();
  const { code } = issue(key, { user: 'ada' });
  const messy = code.replace(/1/g, 'I').replace(/0/g, 'O').replace(/-/g, ' ');
  const clean = decodeCode(code);
  const loose = decodeCode(messy);
  assert.equal(loose.ok, true);
  assert.equal(loose.payload.user, clean.payload.user);
  assert.equal(normalizeCodeText('  nt1-abcd  '), 'ABCD');
});

test('改一位在验签之前就被校验位拦住', () => {
  const key = makeKey();
  const { code } = issue(key, { user: 'typo' });
  const chars = code.split('');
  const at = chars.findIndex((ch, i) => i > 4 && ch !== '-');
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  chars[at] = alphabet[(alphabet.indexOf(chars[at]) + 1) % 32];
  const decoded = decodeCode(chars.join(''));
  assert.equal(decoded.ok, false);
  assert.equal(decoded.reason, 'checksum');
});

test('持有人标识过长或为空时拒绝编码', () => {
  const id = new Uint8Array(8);
  const base = { tier: 0, features: 0, seats: 1, issued: 1, expiry: 0, licenseId: id, seal: DEV_SEAL };
  assert.throws(() => encodePayload({ ...base, user: '' }), (e) => e.code === 'user');
  assert.throws(() => encodePayload({ ...base, user: 'x'.repeat(49) }), (e) => e.code === 'user');
});
