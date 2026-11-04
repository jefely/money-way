// 界面：（无界面）激活码发行公钥（只有公钥；私钥永不进仓库）
/**
 * 32 字节原始公钥的 base64。
 * 全 0 是占位：主人还没换上自己的公钥时，任何激活码都验不过。
 * 写入自己的公钥：node nt/tools/license-keygen.mjs --write-public nt/js/core/license-pubkey.js
 */

export const LICENSE_PUBLIC_KEY_B64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export function decodePublicKey(b64) {
  const text = String(b64 == null ? LICENSE_PUBLIC_KEY_B64 : b64);
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isPlaceholderPublicKey(bytes) {
  if (!bytes || bytes.length !== 32) return true;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}
