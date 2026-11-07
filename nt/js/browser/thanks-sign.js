// 数据：感谢墙签名（Ed25519，Web Crypto）
/**
 * 层：第一层 · core（不碰 DOM）
 *
 * 为什么需要签名：thanks.enc.json 是仓库里的静态文件，谁都能替换。
 * 里面的 AES 密钥就写在前端代码里（公开），所以加密只能防「随手看」，
 * 防不住「拿同一把密钥把内容换掉再重新加密」。
 *
 * 做法：
 *   私钥（本地生成，用口令加密后存仓库 `thanks-key.enc.json`）
 *     → 签 { names, qr } 的规范化 JSON
 *   公钥（写死在 thanks-wall.js 里，公开无妨）
 *     → 验证，失败就整块不显示
 *
 * 口令只是用来保护私钥文件，不参与签名本身。
 */

const KDF_ITER = 600000;
const KDF_HASH = 'SHA-256';

/** base64 ↔ ArrayBuffer */
function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(str) {
  const bin = atob(String(str || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** 口令 → 包裹私钥的 AES 密钥 */
async function deriveWrapKey(passphrase, salt) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITER, hash: KDF_HASH },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * 生成 ECDSA P-256 密钥对，并用法口令把私钥包起来。
 *
 * 为什么不是 Ed25519：它在 Chrome 113+ / Safari 17+ 才有，手机上的微信 X5、
 * 老版 Safari/Android WebView 直接抛错 —— 表现就是「电脑上感谢墙正常、手机上没有」。
 * P-256 从 iOS 11 / Android 5 起都支持，签名同样是 64 字节。
 * @param {string} passphrase
 * @returns {Promise<{pubJwk: object, encPriv: {v:number,salt:string,iv:string,ct:string}}>}
 */
export async function generateKeyPair(passphrase) {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveWrapKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, wrapKey,
    new TextEncoder().encode(JSON.stringify(privJwk)));

  return {
    pubJwk,
    encPriv: { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) },
  };
}

/**
 * 用口令解出私钥（只在签名时用，不落盘）。
 * @param {{v:number,salt:string,iv:string,ct:string}} encPriv
 * @param {string} passphrase
 * @returns {Promise<CryptoKey>}
 */
export async function unlockPrivateKey(encPriv, passphrase) {
  const salt = unb64(encPriv.salt);
  const iv = unb64(encPriv.iv);
  const wrapKey = await deriveWrapKey(passphrase, salt);
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, wrapKey, unb64(encPriv.ct));
  const jwk = JSON.parse(new TextDecoder().decode(raw));
  return crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/**
 * 待签名的规范化文本：键按字母序重建。
 *
 * 注意 JSON.stringify 的第二个参数是**属性白名单**，不是排序器 ——
 * 直接传 keys 只会筛字段，输出顺序仍取决于对象自身的属性顺序，
 * 于是签名端和验证端只要字段集不同就永远对不上。
 * 必须真的重建一个按序插入的对象。
 */
export function canonical(payload) {
  const src = payload || {};
  const out = {};
  for (const k of Object.keys(src).sort()) out[k] = src[k];
  return JSON.stringify(out);
}

/**
 * 给载荷签名。
 * @param {CryptoKey} privateKey
 * @param {object} payload  { names: string[], qr: string }
 * @returns {Promise<string>} base64 签名
 */
export async function signPayload(privateKey, payload) {
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey, new TextEncoder().encode(canonical(payload)));
  return b64(sig);
}

/**
 * 校验载荷的签名。
 * @param {object} pubJwk
 * @param {object} payload
 * @param {string} sigB64
 * @returns {Promise<boolean>}
 */
export async function verifyPayload(pubJwk, payload, sigB64) {
  try {
    const key = await crypto.subtle.importKey(
      'jwk', pubJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } }, key, unb64(sigB64),
      new TextEncoder().encode(canonical(payload)));
  } catch (e) {
    return false;
  }
}
