// 界面：（无界面）完整性清单的验签与哈希比对
/**
 * 清单本身用同一把 Ed25519 公钥签名。
 * 对不上时只应关掉会员功能，不能挡住用户看自己的账。
 */

import { verifyEd25519 } from './ed25519.js';
import { hex, sha256, utf8 } from './sha256.js';

export function canonicalManifest(files) {
  const names = Object.keys(files || {}).sort();
  const list = [];
  for (let i = 0; i < names.length; i++) {
    list.push([names[i], String(files[names[i]]).toLowerCase()]);
  }
  return JSON.stringify({ v: 1, algo: 'SHA-256', files: list });
}

export function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64ToBytes(text) {
  const bin = atob(String(text || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * @param {object} manifest
 * @param {Record<string, Uint8Array>} fileBytes 路径 → 文件字节
 * @param {Uint8Array} publicKey
 * @param {{impl?:string}} [opts]
 */
export async function verifyIntegrityManifest(manifest, fileBytes, publicKey, opts) {
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, dev: true, tampered: false, reason: 'missing' };
  }
  if (manifest.dev || !manifest.sig) {
    return { ok: true, dev: true, tampered: false, reason: 'unsigned' };
  }
  const files = manifest.files || {};
  const canon = canonicalManifest(files);
  let good = false;
  try {
    good = await verifyEd25519(publicKey, utf8(canon), b64ToBytes(manifest.sig), opts);
  } catch (e) {
    good = false;
  }
  if (!good) return { ok: false, dev: false, tampered: true, reason: 'bad-signature' };
  const names = Object.keys(files);
  const bodies = fileBytes || {};
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const body = bodies[name];
    if (!body) return { ok: false, tampered: true, reason: 'missing-file', file: name };
    const got = hex(await sha256(body));
    if (got !== String(files[name]).toLowerCase()) {
      return { ok: false, tampered: true, reason: 'mismatch', file: name };
    }
  }
  return { ok: true, dev: false, tampered: false, reason: 'match' };
}
