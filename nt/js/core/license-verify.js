// 界面：（无界面）激活码验签
/**
 * 每次调用都重新验签，不记住「已经是会员」。
 */

import { verifyEd25519 } from './ed25519.js';
import { decodeCode, finishCode } from './license-codec.js';
import { decodePublicKey, isPlaceholderPublicKey } from './license-pubkey.js';
import { featureAllowed } from './license-policy.js';

function fail(code) {
  return { ok: false, reason: code };
}

/**
 * @param {string} code
 * @param {Uint8Array} [publicKey] 测试注入。缺省用应用内嵌的公钥。
 * @param {{impl?:'auto'|'webcrypto'|'pure'}} [opts]
 */
export async function verifyLicenseCode(code, publicKey, opts) {
  const key = publicKey || decodePublicKey();
  const decoded = decodeCode(code);
  if (!decoded.ok) return decoded;
  if (isPlaceholderPublicKey(key)) return fail('placeholder-key');
  let good = false;
  try {
    good = await verifyEd25519(key, decoded.payloadBytes, decoded.sig, opts);
  } catch (e) {
    good = false;
  }
  if (!good) return fail('signature');
  const payload = decoded.payload;
  const sig = decoded.sig;
  return {
    ok: true,
    code: finishCode(decoded.payloadBytes, sig),
    proof: {
      payload,
      sig,
      allows(feature) {
        return featureAllowed(payload, feature);
      },
    },
  };
}
