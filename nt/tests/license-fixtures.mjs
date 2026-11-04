/**
 * 测试用的一次性密钥。私钥只活在内存里，不写盘。
 */

import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { encodePayload, finishCode } from '../js/core/license-codec.js';
import { DEV_SEAL } from '../js/core/license-seal.js';

export function makeKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
  return { privateKey, raw };
}

export function issue(key, fields) {
  const src = fields || {};
  const payload = encodePayload({
    tier: src.tier == null ? 2 : src.tier,
    features: src.features == null ? 0x0003 : src.features,
    seats: src.seats == null ? 3 : src.seats,
    issued: src.issued == null ? 1700000000 : src.issued,
    expiry: src.expiry == null ? 0 : src.expiry,
    licenseId: src.licenseId || new Uint8Array(randomBytes(8)),
    seal: src.seal || DEV_SEAL,
    user: src.user || 'buyer@example.com',
  });
  const sig = new Uint8Array(sign(null, Buffer.from(payload), key.privateKey));
  return { code: finishCode(payload, sig), payload, sig };
}
