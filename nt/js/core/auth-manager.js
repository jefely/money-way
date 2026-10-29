// 界面：（无界面）主密码校验/修改
/**
 * ☐15 密钥管理器（唯一的密钥持有者）
 * 层：第一层 · 数据基座
 *
 * 整个软件只有这里保存「正在使用的那把 AES 密钥」，而且：
 *   · 只放在模块闭包里，**不挂 window、不导出可写引用**
 *   · 不写 localStorage / IndexedDB（密钥一旦落盘就等于没有加密）
 *   · 页面刷新即消失，必须重新解锁
 *
 * 纯逻辑：只用 crypto-engine 与传入的数据，不碰 DOM / 存储。
 */

import { deriveKey, decryptData, base64ToBytes } from './crypto-engine.js';

/** 闭包持有。模块外部拿不到它，只能通过 getKey() 取到引用（且不可导出）。 */
let _activeKey = null;

/** 解锁失败计数（仅用于 UI 提示，不做硬锁策略）。 */
let _failures = 0;

export function isUnlocked() {
  return _activeKey !== null;
}

/** 取出当前密钥。没解锁就抛错 —— 让调用方显式处理，而不是静默用空密钥。 */
export function getKey() {
  if (!_activeKey) throw new Error('尚未解锁：请先输入密码');
  return _activeKey;
}

/** 上锁：丢弃密钥。 */
export function lock() {
  _activeKey = null;
}

export function failureCount() {
  return _failures;
}

/**
 * 解锁：用「真的把密文解开」来判定密码对不对。
 *
 * 为什么不用「哈希比对」：那等于把密码摘要存下来，摘要可以被离线暴力破解，
 * 等于把零知识降级成"服务器知道你的密码"。这里只有解开 / 解不开两种结果。
 *
 * @param {string} password
 * @param {{salt:string, iv:string, ciphertext:string}} record 盘上的保险库记录（base64）
 * @returns {Promise<{ok:boolean, plaintext?:string, error?:string}>}
 */
export async function unlock(password, record) {
  if (!password) return { ok: false, error: '请输入密码' };
  if (!record || !record.salt || !record.ciphertext) {
    return { ok: false, error: '还没有保险库，请先设置密码' };
  }

  let key;
  try {
    key = await deriveKey(password, base64ToBytes(record.salt));
  } catch (e) {
    return { ok: false, error: '密钥派生失败：' + e.message };
  }

  try {
    const plaintext = await decryptData(key, base64ToBytes(record.iv), base64ToBytes(record.ciphertext));
    // 能解出明文 → 密码正确 → 这时才把密钥留下
    _activeKey = key;
    _failures = 0;
    return { ok: true, plaintext };
  } catch (e) {
    _failures += 1;
    return { ok: false, error: '密码不对，或数据已损坏' };
  }
}

/**
 * 首次设置密码：派生密钥并留下，调用方随即用它加密首次数据。
 * @returns {Promise<CryptoKey>}
 */
export async function createWith(password, salt) {
  if (!password) throw new Error('密码不能为空');
  const key = await deriveKey(password, salt);
  _activeKey = key;
  _failures = 0;
  return key;
}
