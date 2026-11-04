// 界面：（无界面）Ed25519 验签（WebCrypto，缺失时用纯 JS）
/**
 * 应用里只验签，不签发。
 * 新浏览器走 WebCrypto Ed25519；老安卓 / 华为 / 旧 iOS 没有这个算法时，
 * 落到 vendor/tweetnacl-verify.js（公有领域的 TweetNaCl）。
 */

import { detachedVerify } from '../vendor/tweetnacl-verify.js';

let supportPromise = null;

/** 当前环境能不能用 WebCrypto 做 Ed25519。结果会记住。 */
export function ed25519WebCryptoSupported() {
  if (!supportPromise) {
    supportPromise = detectWebCrypto();
  }
  return supportPromise;
}

async function detectWebCrypto() {
  try {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle || !subtle.generateKey) return false;
    await subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * @param {Uint8Array} publicKey 32 字节原始公钥
 * @param {Uint8Array} message
 * @param {Uint8Array} signature 64 字节
 * @param {{impl?:'auto'|'webcrypto'|'pure'}} [opts]
 * @returns {Promise<boolean>}
 */
export async function verifyEd25519(publicKey, message, signature, opts) {
  const impl = (opts && opts.impl) || 'auto';
  if (impl === 'pure') return verifyPure(publicKey, message, signature);
  if (impl === 'webcrypto') return verifyWeb(publicKey, message, signature);
  if (await ed25519WebCryptoSupported()) {
    try {
      return await verifyWeb(publicKey, message, signature);
    } catch (e) {
      /* 探测通过但这次验签失败时，再试纯 JS，避免个别实现抛类型错误 */
    }
  }
  return verifyPure(publicKey, message, signature);
}

async function verifyWeb(publicKey, message, signature) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) return false;
  const key = await subtle.importKey(
    'raw',
    publicKey,
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
  return subtle.verify({ name: 'Ed25519' }, key, signature, message);
}

function verifyPure(publicKey, message, signature) {
  try {
    return detachedVerify(message, signature, publicKey) === true;
  } catch (e) {
    return false;
  }
}
