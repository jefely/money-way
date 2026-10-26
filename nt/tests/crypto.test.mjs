/**
 * 加密层测试（Node 内置 test runner，真实跑 WebCrypto）。
 *
 *   node --test nt/tests/
 *
 * 覆盖：
 *   · 加解密往返
 *   · 密码错 → 解不开（AES-GCM 认证失败）
 *   · IV 每次不同（同一密码同一条数据，两次密文必须不一样）
 *   · 同一密码 + 同一盐 → 派生结果稳定（能解开旧数据）
 *   · 盐不同 → 同一密码派生出的密钥不同（解不开别人的数据）
 *   · 记录里不含密码 / 不含密钥
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveKey, encryptData, decryptData, randomSalt, randomIv,
  bytesToBase64, base64ToBytes, PBKDF2_ITERATIONS,
} from '../js/core/crypto-engine.js';
import { unlock, createWith, getKey, lock, isUnlocked } from '../js/core/auth-manager.js';

const DATA = JSON.stringify({ accounts: [{ id: 'a1', name: '现金' }], transactions: [] });

/** 造一条盘上记录（与 storage-adapter 的形状一致） */
async function makeRecord(password) {
  const salt = randomSalt();
  const key = await deriveKey(password, salt);
  const { iv, ciphertext } = await encryptData(key, DATA);
  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
}

test('加解密往返：解出来的字节和原文一致', async () => {
  const salt = randomSalt();
  const key = await deriveKey('correct horse', salt);
  const { iv, ciphertext } = await encryptData(key, DATA);
  const back = await decryptData(key, iv, ciphertext);
  assert.equal(back, DATA);
});

test('密码错 → AES-GCM 认证失败，解不开', async () => {
  const salt = randomSalt();
  const right = await deriveKey('right-password', salt);
  const wrong = await deriveKey('wrong-password', salt);
  const { iv, ciphertext } = await encryptData(right, DATA);

  await assert.rejects(() => decryptData(wrong, iv, ciphertext));
});

test('IV 每次不同：同一密码同一数据，两次密文不一样', async () => {
  const salt = randomSalt();
  const key = await deriveKey('pw', salt);
  const a = await encryptData(key, DATA);
  const b = await encryptData(key, DATA);

  assert.notEqual(bytesToBase64(a.iv), bytesToBase64(b.iv), 'IV 必须每次换');
  assert.notEqual(bytesToBase64(a.ciphertext), bytesToBase64(b.ciphertext), '密文因此也不同');
});

test('同一密码 + 同一盐 → 派生稳定（旧数据解得开）', async () => {
  const salt = randomSalt();
  const rec = await makeRecord('my-password');

  // 用记录里的盐重新派生，等价于"用户第二次输同一个密码"
  const key2 = await deriveKey('my-password', base64ToBytes(rec.salt));
  const plain = await decryptData(key2, base64ToBytes(rec.iv), base64ToBytes(rec.ciphertext));
  assert.equal(plain, DATA);
});

test('盐不同 → 同一密码也解不开别人的数据', async () => {
  const rec = await makeRecord('same-password');
  const otherSalt = randomSalt();             // 模拟"别人的设备"
  const key = await deriveKey('same-password', otherSalt);

  await assert.rejects(() => decryptData(key, base64ToBytes(rec.iv), base64ToBytes(rec.ciphertext)));
});

test('auth-manager：unlock 成功 / 失败 / 密钥生命周期', async () => {
  const rec = await makeRecord('pw-123456');

  // 密码错
  const bad = await unlock('wrong', rec);
  assert.equal(bad.ok, false);
  assert.equal(isUnlocked(), false, '失败后不能留下密钥');

  // 密码对
  const good = await unlock('pw-123456', rec);
  assert.equal(good.ok, true);
  assert.equal(good.plaintext, DATA);
  assert.equal(isUnlocked(), true);
  assert.ok(getKey() instanceof CryptoKey);

  // 上锁后不能再取
  lock();
  assert.equal(isUnlocked(), false);
  assert.throws(() => getKey(), /尚未解锁/);
});

test('auth-manager：createWith 后立即可用', async () => {
  const salt = randomSalt();
  await createWith('new-password', salt);
  assert.equal(isUnlocked(), true);
  const key = getKey();
  const { iv, ciphertext } = await encryptData(key, 'hello');
  assert.equal(await decryptData(key, iv, ciphertext), 'hello');
  lock();
});

test('记录里不含密码 / 不含密钥', async () => {
  const rec = await makeRecord('secret-pw-9999');
  const blob = JSON.stringify(rec);
  assert.ok(!blob.includes('secret-pw-9999'), '记录里不许出现明文密码');
  // 记录只有 salt / iv / ciphertext 三段 base64
  assert.deepEqual(Object.keys(rec).sort(), ['ciphertext', 'iv', 'salt']);
});

test('base64 往返：任意字节都能还原', () => {
  const raw = randomIv(32);
  const back = base64ToBytes(bytesToBase64(raw));
  assert.deepEqual(Array.from(back), Array.from(raw));
});

test('迭代次数不低于公约要求（10 万）', () => {
  assert.ok(PBKDF2_ITERATIONS >= 100000, `当前 ${PBKDF2_ITERATIONS}`);
});
