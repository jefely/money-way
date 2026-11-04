// 界面：（无界面）用验过签的载荷解会员模块
/**
 * 密文 = 明文 XOR 由 seal 与功能名派生的密钥流。
 * 打开时还要用签名再派生一个 token：没有真签名就没有这个 token。
 * 只改「是会员」不够，调用方拿不到签名字节。
 */

import { concat, sha256, utf8 } from './sha256.js';

export async function maskBytes(plain, seal, label) {
  const seed = await sha256(concat([seal, utf8(label)]));
  const stream = await keystream(seed, plain.length);
  const out = new Uint8Array(plain.length);
  for (let i = 0; i < plain.length; i++) out[i] = plain[i] ^ stream[i];
  return out;
}

export async function signatureToken(sig, feature) {
  const h = await sha256(concat([sig, utf8(feature)]));
  let out = '';
  for (let i = 0; i < 8; i++) out += h[i].toString(16).padStart(2, '0');
  return out;
}

async function keystream(seed, n) {
  const out = new Uint8Array(n);
  let offset = 0;
  let counter = 0;
  while (offset < n) {
    const ctr = new Uint8Array(4);
    ctr[0] = (counter >>> 24) & 255;
    ctr[1] = (counter >>> 16) & 255;
    ctr[2] = (counter >>> 8) & 255;
    ctr[3] = counter & 255;
    const block = await sha256(concat([seed, ctr]));
    const take = Math.min(32, n - offset);
    for (let i = 0; i < take; i++) out[offset + i] = block[i];
    offset += take;
    counter += 1;
  }
  return out;
}
