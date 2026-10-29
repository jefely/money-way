/**
 * 换主密码的测试（Node 内置 test runner，真的跑 WebCrypto）
 *
 *   node nt/tests/vault-rekey.test.mjs
 *
 * 三条不变式必须逐条锁住 —— 换密码写错一次，账本就永远打不开：
 *   ① 旧密码不对 → 不返回任何可落盘的记录
 *   ② 新记录只能用新密码解开，旧密码解不开
 *   ③ 新记录的盐必须换掉
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveKey, encryptData, decryptData, randomSalt, bytesToBase64, base64ToBytes,
} from '../js/core/crypto-engine.js';
import { rekeyVault, checkNewPassword, REKEY_ERROR } from '../js/core/vault-rekey.js';

const STATE = { accounts: [{ id: 'a1', name: '现金' }], transactions: [{ id: 't1', amount: 10 }] };

/** 造一条与盘上同形的记录 */
async function makeRecord(password, obj = STATE) {
  const salt = randomSalt();
  const key = await deriveKey(password, salt);
  const { iv, ciphertext } = await encryptData(key, JSON.stringify(obj));
  return {
    version: 2,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
}

/** 用给定密码解一条记录（解不开会 reject） */
async function open(record, password) {
  const key = await deriveKey(password, base64ToBytes(record.salt));
  return decryptData(key, base64ToBytes(record.iv), base64ToBytes(record.ciphertext));
}

test('旧密码错 → 拒绝，且不返回记录', async () => {
  const rec = await makeRecord('old-pass');

  const r = await rekeyVault(rec, 'wrong-pass', 'new-pass');
  assert.equal(r.ok, false);
  assert.equal(r.error, REKEY_ERROR.badOld);
  assert.equal(r.record, undefined, '失败时不许给出任何可落盘的记录');
});

test('换完之后：新密码解得开，旧密码解不开', async () => {
  const rec = await makeRecord('old-pass');
  const r = await rekeyVault(rec, 'old-pass', 'new-pass');

  assert.equal(r.ok, true);
  const plain = await open(r.record, 'new-pass');
  assert.deepEqual(JSON.parse(plain), STATE, '内容必须原样过去');

  await assert.rejects(() => open(r.record, 'old-pass'), '旧密码必须解不开新记录');
});

test('盐必须换掉（否则两次换密码的密文可横向比对）', async () => {
  const rec = await makeRecord('old-pass');
  const r = await rekeyVault(rec, 'old-pass', 'new-pass');
  assert.ok(r.ok);
  assert.notEqual(r.record.salt, rec.salt);
});

test('密文必须换掉（新旧密码相同时也不能复用旧密文）', async () => {
  const rec = await makeRecord('same-pass');
  const r = await rekeyVault(rec, 'same-pass', 'same-pass');
  assert.ok(r.ok);
  assert.notEqual(r.record.salt, rec.salt);
  assert.notEqual(r.record.ciphertext, rec.ciphertext);
  // 同密码同新盐 → 仍解得开，内容是原文
  assert.deepEqual(JSON.parse(await open(r.record, 'same-pass')), STATE);
});

test('传了 stateObj 就加密它（保住未保存的编辑）', async () => {
  const rec = await makeRecord('old-pass');
  const newer = { ...STATE, transactions: [...STATE.transactions, { id: 't2', amount: 20 }] };

  const r = await rekeyVault(rec, 'old-pass', 'new-pass', newer);
  assert.ok(r.ok);
  assert.deepEqual(JSON.parse(await open(r.record, 'new-pass')), newer);
});

test('不传 stateObj 就复用盘上的明文（以盘为准）', async () => {
  const rec = await makeRecord('old-pass');
  const r = await rekeyVault(rec, 'old-pass', 'new-pass');
  assert.ok(r.ok);
  assert.deepEqual(JSON.parse(await open(r.record, 'new-pass')), STATE);
});

test('返回的 key 就是新密钥本身（调用方要接管它）', async () => {
  const rec = await makeRecord('old-pass');
  const r = await rekeyVault(rec, 'old-pass', 'new-pass');
  assert.ok(r.ok);
  assert.ok(r.key instanceof CryptoKey);

  // 用返回的 key 加密 → 用新密码派生出来的 key 必须解得开同一段数据
  const { iv, ciphertext } = await encryptData(r.key, 'hello');
  const again = await deriveKey('new-pass', base64ToBytes(r.record.salt));
  assert.equal(await decryptData(again, iv, ciphertext), 'hello');
});

test('没有保险库 / 新密码为空 → 各自的明确错误', async () => {
  const rec = await makeRecord('old-pass');

  const a = await rekeyVault(null, 'old-pass', 'new-pass');
  assert.equal(a.ok, false);
  assert.equal(a.error, REKEY_ERROR.noRecord);

  const b = await rekeyVault(rec, 'old-pass', '');
  assert.equal(b.ok, false);
  assert.equal(b.error, REKEY_ERROR.emptyNew);
});

test('记录字段形状：version 保留，四段字符串 + updatedAt', async () => {
  const rec = await makeRecord('old-pass');
  rec.version = 7;
  const r = await rekeyVault(rec, 'old-pass', 'new-pass');
  assert.ok(r.ok);
  assert.equal(r.record.version, 7);
  assert.deepEqual(
    Object.keys(r.record).filter((k) => k !== 'updatedAt').sort(),
    ['ciphertext', 'iv', 'salt', 'version'],
  );
  assert.ok(!Number.isNaN(Date.parse(r.record.updatedAt)));
});

test('checkNewPassword：空 / 不一致 / 通过', () => {
  assert.equal(checkNewPassword('', ''), '新密码不能为空');
  assert.equal(checkNewPassword('abc', 'abd'), '两次输入的新密码不一致');
  assert.equal(checkNewPassword('abc', 'abc'), '');
});
