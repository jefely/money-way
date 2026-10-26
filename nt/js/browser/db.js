/**
 * 物理存储（IndexedDB + 加密）
 * 层：browser/（浏览器边界）
 *
 * 只有两个对外的动作：saveState(state) / loadState()。
 * 盘上永远只有 { version, salt, iv, ciphertext, updatedAt } —— 没有明文、没有密码、没有密钥。
 *
 * 密钥来自 core/auth-manager（闭包持有），本文件不生成也不保存密钥。
 */

import { encryptData, decryptData, randomSalt, bytesToBase64, base64ToBytes } from '../core/crypto-engine.js';
import { getKey, createWith, unlock, isUnlocked } from '../core/auth-manager.js';
import { idbGet, idbPut, idbDel } from './idb.js';
import { SCHEMA_VERSION } from '../core/schema.js';

export const VAULT_KEY = 'state';

/** 盘上有没有保险库 */
export async function hasVault() {
  const rec = await idbGet(VAULT_KEY);
  return !!(rec && rec.ciphertext);
}

/** 原始记录（给解锁流程试解用） */
export async function readVaultRecord() {
  return idbGet(VAULT_KEY);
}

/**
 * 首次建立保险库：生成盐 → 派生密钥 → 加密初始 state → 落盘。
 */
export async function createVault(stateObj, password) {
  const salt = randomSalt();
  const key = await createWith(password, salt);
  const { iv, ciphertext } = await encryptData(key, JSON.stringify(stateObj || {}));
  const rec = {
    version: SCHEMA_VERSION,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    updatedAt: new Date().toISOString(),
  };
  await idbPut(VAULT_KEY, rec);
  return rec;
}

/**
 * 解锁：拿盘上的记录试解。成功则密钥留在 auth-manager 里。
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
 * 存盘：每次 state 变化都重新加密（新 IV，盐不变）。
 * 未解锁直接抛错 —— 防止「忘了解锁就静默写明文」。
 */
export async function saveState(stateObj) {
  if (!isUnlocked()) throw new Error('尚未解锁，拒绝写入');
  const key = getKey();
  const { iv, ciphertext } = await encryptData(key, JSON.stringify(stateObj || {}));
  const old = (await readVaultRecord()) || {};
  const rec = {
    version: SCHEMA_VERSION,
    salt: old.salt,
    iv: bytesToBase64(iv),
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

/** 销毁保险库（重置账本用，不可恢复）。 */
export async function destroyVault() {
  await idbDel(VAULT_KEY);
}
