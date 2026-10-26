/**
 * ☐14 加密引擎（纯算法，无状态）
 * 层：第一层 · 数据基座（零知识架构的数学内核）
 *
 * 只做四件事：派生密钥、加密、解密、生成盐。
 * **不碰 IndexedDB、不碰 DOM、不存任何状态** —— 所以能在 Node 下直接测试。
 *
 * 算法：PBKDF2(SHA-256, 150000) → AES-GCM-256
 * 每次加密都换一个新 IV（12 字节），IV 和密文一起存盘。
 */

export const PBKDF2_ITERATIONS = 150000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const KEY_BITS = 256;

/** 生成随机盐（每个设备/每个保险库不同）。 */
export function randomSalt(bytes = SALT_BYTES) {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

/** 生成随机 IV（每次加密都要新的）。 */
export function randomIv(bytes = IV_BYTES) {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

/**
 * 用 PBKDF2 把「密码 + 盐」派生成一把 AES-GCM-256 密钥。
 * 密钥不可导出（extractable = false）：JS 拿不到它的原始字节，
 * 也就没法把它写进 localStorage / 发给别人。
 */
export async function deriveKey(password, salt, iterations = PBKDF2_ITERATIONS) {
  if (!password) throw new Error('密码不能为空');
  if (!salt || !salt.byteLength) throw new Error('盐不能为空');

  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(password)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 加密一段字符串。
 * @returns {Promise<{iv:Uint8Array, ciphertext:Uint8Array}>}
 */
export async function encryptData(key, dataStr) {
  const iv = randomIv();
  const enc = new TextEncoder();
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(String(dataStr)));
  return { iv, ciphertext: new Uint8Array(buf) };
}

/**
 * 解密。密码错 / 数据被改 → 这里会抛错（AES-GCM 认证失败），
 * 调用方据此判定「密码不对」，不要自己猜。
 */
export async function decryptData(key, iv, ciphertext) {
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(buf);
}

/* ---------- 字节 ↔ base64（存盘用字符串，便于 JSON / IndexedDB 统一） ---------- */

export function bytesToBase64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function base64ToBytes(str) {
  const bin = atob(String(str || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
