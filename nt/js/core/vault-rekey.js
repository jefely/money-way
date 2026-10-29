// 界面：（无界面）更换主密码：验旧密码 → 换新盐 → 整份重新加密
/**
 * 换主密码
 * 层：第一层 · 数据基座（纯函数，Node 可跑）
 *
 * 为什么单独一个文件：它既不是「首次建库」（createVault）也不是「日常存盘」
 * （saveState），而是两者之间的一次性迁移 —— 一次换钥匙必须同时做到三件事，
 * 少一件都会把账本变成打不开的砖头：
 *
 *   ① 用**旧密码真的解开一次**。不是比对摘要：摘要落盘就等于把零知识降级成
 *      「服务器知道你的密码」。解不开 → 一个字节都不写。
 *   ② 换**新的盐**。盐不变的话，同一个新密码在别的设备上能派生出同一把钥匙，
 *      而且两次换密码的密文可以被横向比对。
 *   ③ 用**新密钥**重新加密，并返回新密钥本身 —— 调用方必须把它交给
 *      auth-manager，否则这一进程还在用旧钥匙，下一次存盘写出去的全是
 *      「新盐 + 旧密钥密文」，刷新后旧密码解不开、新密码也解不开。
 *
 * 三条不变式由 tests/vault-rekey.test.mjs 逐条锁住。
 */

import {
  deriveKey, decryptData, encryptData, randomSalt, bytesToBase64, base64ToBytes,
} from './crypto-engine.js';

export const REKEY_ERROR = {
  noRecord: '还没有保险库，请先设置密码',
  badOld: '当前密码不对',
  emptyNew: '新密码不能为空',
  same: '新密码与当前密码相同',
};

/**
 * @param {{salt?:string, iv?:string, ciphertext?:string, version?:number}} record 盘上记录
 * @param {string} oldPassword 当前密码（用来真的解开一次）
 * @param {string} newPassword 新密码
 * @param {object} [stateObj] 内存里的最新 state。
 *        传了就加密它（把未保存的编辑一并保住），
 *        不传就复用盘上解出来的明文（此时以盘为准）。
 * @returns {Promise<{ok:boolean, error?:string, record?:object, key?:CryptoKey}>}
 */
export async function rekeyVault(record, oldPassword, newPassword, stateObj) {
  if (!record || !record.salt || !record.ciphertext) {
    return { ok: false, error: REKEY_ERROR.noRecord };
  }
  if (!newPassword) return { ok: false, error: REKEY_ERROR.emptyNew };

  /* ① 旧密码必须真的能解开盘上密文 */
  let plain;
  try {
    const oldKey = await deriveKey(oldPassword, base64ToBytes(record.salt));
    plain = await decryptData(oldKey, base64ToBytes(record.iv), base64ToBytes(record.ciphertext));
  } catch (e) {
    return { ok: false, error: REKEY_ERROR.badOld };
  }

  /* ② 新盐 → 新密钥 */
  const salt = randomSalt();
  const key = await deriveKey(newPassword, salt);

  /* ③ 重新加密。stateObj 给了就用它，否则用刚解出来的明文。 */
  const payload = stateObj === undefined ? plain : JSON.stringify(stateObj);
  const { iv, ciphertext } = await encryptData(key, payload);

  return {
    ok: true,
    key,
    record: {
      version: Number(record.version) || 2,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * 新密码的强度/一致性检查（纯字符串逻辑，放进 core 才能被 Node 测）。
 * 只挡「空」和「两次不一致」—— 密码本身多长不设上限，也不做复杂度强制：
 * 这是本地零知识账本，加复杂度规则只会把用户逼去写便签。
 *
 * @returns {string} 空串表示通过，否则是要显示给用户的原因
 */
export function checkNewPassword(pw, pw2) {
  if (!pw) return '新密码不能为空';
  if (String(pw) !== String(pw2)) return '两次输入的新密码不一致';
  return '';
}
