/**
 * ☐16 保险库适配器（唯一碰 IndexedDB 的地方）
 * 层：browser/（浏览器边界）
 *
 * 职责：把内存里的 state 加密后写盘，或把盘里的密文解密后交给 state。
 *
 * 为什么不放 core/：它要用 IndexedDB —— core/ 必须能在 Node 下跑（公约 3.3），
 * 门禁会直接拦下。所以「纯加解密」在 core/crypto-engine.js，
 * 「密钥生命周期」在 core/auth-manager.js，只有「存储 + 接线」在这层。
 *
 * 盘上只有一块记录：
 *   { salt: b64, iv: b64, ciphertext: b64, version: 1, updatedAt: iso }
 * 里面**不含**密码、不含密码哈希、不含密钥。
 */

import { encryptData, decryptData, randomSalt, bytesToBase64, base64ToBytes } from '../core/crypto-engine.js';
import { getKey, createWith, unlock, isUnlocked } from '../core/auth-manager.js';
import { idbGet, idbPut, idbDel } from './idb.js';

export const VAULT_KEY = 'state';
export const VAULT_VERSION = 1;

/** 盘上有没有保险库？ */
export async function hasVault() {
  const rec = await idbGet(VAULT_KEY);
  return !!(rec && rec.ciphertext);
}

/** 读原始记录（不含解密）。给解锁流程用：需要 salt/iv/ciphertext 来试解。 */
export async function readVaultRecord() {
  return idbGet(VAULT_KEY);
}

/**
 * 首次设置密码：生成盐 → 派生密钥 → 加密初始 state → 落盘。
 * @returns {Promise<object>} 写入的记录（不含明文）
 */
export async function createVault(stateObj, password) {
  const salt = randomSalt();
  const key = await createWith(password, salt);
  const { iv, ciphertext } = await encryptData(key, JSON.stringify(stateObj || {}));
  const rec = {
    version: VAULT_VERSION,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    updatedAt: new Date().toISOString(),
  };
  await idbPut(VAULT_KEY, rec);
  return rec;
}

/**
 * 解锁：拿盘上的记录试解，成功则密钥留在 auth-manager 里。
 * @returns {Promise<{ok:boolean, state?:object, error?:string}>}
 */
export async function unlockVault(password) {
  const rec = await readVaultRecord();
  const res = await unlock(password, rec);
  if (!res.ok) return { ok: false, error: res.error };
  try {
    return { ok: true, state: JSON.parse(res.plaintext) };
  } catch (e) {
    return { ok: false, error: '数据格式异常' };
  }
}

/**
 * 存盘：每次 state 变化都重新加密（新 IV）。
 * 未解锁会抛错 —— 这是刻意的，防止「忘了解锁就静默写明文件」。
 */
export async function saveState(stateObj) {
  if (!isUnlocked()) throw new Error('尚未解锁，拒绝写入');
  const key = getKey();
  const { iv, ciphertext } = await encryptData(key, JSON.stringify(stateObj || {}));
  const old = (await readVaultRecord()) || {};
  const rec = {
    version: VAULT_VERSION,
    salt: old.salt,               // 盐不变：同一个密码永远派生出同一把密钥
    iv: bytesToBase64(iv),        // IV 每次都要换（AES-GCM 的硬要求）
    ciphertext: bytesToBase64(ciphertext),
    updatedAt: new Date().toISOString(),
  };
  await idbPut(VAULT_KEY, rec);
  return rec;
}

/** 载入：解密后返回对象（未解锁会抛错）。 */
export async function loadState() {
  if (!isUnlocked()) throw new Error('尚未解锁，无法读取');
  const rec = await readVaultRecord();
  if (!rec) return null;
  const key = getKey();
  const plain = await decryptData(key, base64ToBytes(rec.iv), base64ToBytes(rec.ciphertext));
  return JSON.parse(plain);
}

/** 销毁保险库（重置账本用；不可恢复）。 */
export async function destroyVault() {
  await idbDel(VAULT_KEY);
}
