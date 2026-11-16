// 界面：（无界面）IndexedDB 数据库封装
/**
 * 物理存储（IndexedDB + 加密）
 * 层：browser/（浏览器边界）
 *
 * 只有两个对外的动作：saveState(state) / loadState()。
 * 盘上永远只有 { version, salt, iv, ciphertext, updatedAt } —— 没有明文、没有密码、没有密钥。
 *
 * 密钥来自 core/auth-manager（闭包持有），本文件不生成也不保存密钥。
 */

import { encryptData, decryptData, deriveKey, randomSalt, bytesToBase64, base64ToBytes } from '../core/crypto-engine.js';
import { getKey, createWith, unlock, isUnlocked, adoptKey } from '../core/auth-manager.js';
import { rekeyVault } from '../core/vault-rekey.js';
import { idbGet, idbPut, idbDel, idbCasPut } from './idb.js';
import { SCHEMA_VERSION } from '../core/schema.js';
import { packBackup, unpackBackup } from '../core/backup-file.js';
import {
  toTxtVein, fromTxtVein, packBundle, unpackBundle, packSecure, extractSecure,
} from '../core/txtvein-bridge.js';

export const VAULT_KEY = 'state';

/** 本标签最后一次看见的密文。别的标签写过之后，这里对不上，就拒绝覆盖。 */
let expectedCipher = '';

export function noteCipher(cipher) {
  expectedCipher = cipher ? String(cipher) : '';
}

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
  noteCipher(rec.ciphertext);
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
  noteCipher(rec && rec.ciphertext);
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
  const wrote = await idbCasPut(VAULT_KEY, expectedCipher, rec);
  if (!wrote.ok) {
    throw new Error('另一个窗口已经保存过。这次没有覆盖，请先刷新再改。');
  }
  noteCipher(rec.ciphertext);
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
  noteCipher('');
}

/**
 * 换主密码：验旧密码 → 换新盐 → 用新密钥重新加密整份 state → 落盘 → 接管新密钥。
 *
 * 顺序是关键：**先**写盘，成功了才 adoptKey。反过来做的话，写盘失败会留下
 * 「闭包里是新钥匙、盘上还是旧记录」的状态 —— 这一进程能继续用，刷新就打不开。
 *
 * @param {string} oldPassword
 * @param {string} newPassword
 * @param {object} stateObj 当前内存里的 state（把未保存的编辑一并保住）
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function changeVaultPassword(oldPassword, newPassword, stateObj) {
  const rec = await readVaultRecord();
  const r = await rekeyVault(rec, oldPassword, newPassword, stateObj);
  if (!r.ok) return { ok: false, error: r.error };

  await idbPut(VAULT_KEY, r.record);
  adoptKey(r.key);
  noteCipher(r.record && r.record.ciphertext);
  return { ok: true };
}

/**
 * 用当前内存里的钥匙把整本 state 封成加密备份。
 * 不再跑一遍 PBKDF2，这样手机上点「分享」时还在同一次点击里。
 */
export async function buildEncryptedBackup(stateObj) {
  if (!isUnlocked()) throw new Error('尚未解锁，不能备份');
  const old = (await readVaultRecord()) || {};
  if (!old.salt) throw new Error('还没有保险库');
  const { iv, ciphertext } = await encryptData(getKey(), JSON.stringify(stateObj || {}));
  return packBackup({
    salt: old.salt,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    updatedAt: new Date().toISOString(),
  });
}

/** 用用户输入的密码解开备份，返回 state。不写盘。 */
export async function restoreEncryptedBackup(text, password) {
  const env = unpackBackup(text);
  const key = await deriveKey(password, base64ToBytes(env.salt));
  const plain = await decryptData(key, base64ToBytes(env.iv), base64ToBytes(env.ciphertext));
  return JSON.parse(plain);
}

/**
 * 用当前内存钥匙生成 TxtVein 双文件密文。
 * 加密格式完全按 TxtVein：PBKDF2-SHA256 150000 + AES-GCM-256 + [SECURE_START] 装甲。
 * 返回一个可粘贴的 bundle 和两份独立文件。
 */
export async function buildTxtVeinCipher(stateObj, mode) {
  if (!isUnlocked()) throw new Error('尚未解锁，不能导出密文');
  const old = (await readVaultRecord()) || {};
  if (!old.salt) throw new Error('还没有保险库');
  const built = toTxtVein(stateObj || {});
  const deep = mode !== 'shadow';
  const parts = { vaultId: '', iterations: 150000, salt: old.salt };
  const led = await encryptData(getKey(), built.ledgerText);
  const dic = await encryptData(getKey(), built.dictText);
  const ledgerText = deep
    ? packSecure('ledger', { ...parts, iv: bytesToBase64(led.iv) }, bytesToBase64(led.ciphertext))
    : built.ledgerText;
  const dictText = packSecure('dict', { ...parts, iv: bytesToBase64(dic.iv) }, bytesToBase64(dic.ciphertext));
  const files = [
    { name: deep ? 'ledger.enc' : 'ledger.shadow', text: ledgerText },
    { name: deep ? 'dict.enc' : 'dict.vault', text: dictText },
  ];
  return {
    mode: deep ? 'deep' : 'shadow',
    files,
    bundle: packBundle(files, deep ? 'deep' : 'shadow'),
  };
}

/** 解开 TxtVein 双文件密文 bundle，转成 NT state。 */
export async function restoreTxtVeinCipher(text, password) {
  const b = unpackBundle(text);
  if (!b || !b.files || b.files.length < 2) throw new Error('不是 TxtVein 双文件 bundle');
  const ledger = b.files.find((f) => /ledger/i.test(f.name));
  const dict = b.files.find((f) => /dict|vault/i.test(f.name));
  if (!ledger || !dict) throw new Error('bundle 缺流水或字典');

  async function plainOf(file) {
    if (!/\[SECURE_START/.test(file.text)) return file.text;
    const env = extractSecure(file.text);
    const key = await deriveKey(password, base64ToBytes(env.salt), env.iterations);
    return decryptData(key, base64ToBytes(env.iv), base64ToBytes(env.ciphertext));
  }

  const ledgerText = await plainOf(ledger);
  const dictText = await plainOf(dict);
  const single = ['## 统计', '## 流水', ledgerText,
    '## 行为', '## 备注', '## 字典', dictText].join('\n');
  const r = fromTxtVein(single);
  if (!r.ok) throw new Error((r.errors && r.errors[0] && r.errors[0].message) || 'TxtVein 密文解析失败');
  return r.state;
}
