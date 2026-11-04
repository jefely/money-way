// 界面：（无界面）会员功能门闩
/**
 * has() 每次都重新验签、看到期、看名额。
 * 没有 isPro 这种可以改一下就永远为真的字段。
 */

import { verifyLicenseCode } from './license-verify.js';
import {
  effectiveNow, featureAllowed, isExpired, seatDecision,
} from './license-policy.js';

/**
 * @param {string} feature
 * @param {{
 *   code?: string,
 *   publicKey?: Uint8Array,
 *   verifyOpts?: object,
 *   nowMs?: number,
 *   maxSeen?: number,
 *   installId?: string,
 *   activations?: string[],
 *   blocked?: boolean,
 * }} env
 */
export async function has(feature, env) {
  const judged = await assess(env);
  if (!judged.ok) return false;
  return featureAllowed(judged.proof.payload, feature);
}

/**
 * 给界面用：除了能不能用，还带回要写回账本的名额和见过的时间。
 * 核心记账不要调用它。
 */
export async function assess(env) {
  const e = env || {};
  if (e.blocked) return { ok: false, reason: 'tampered' };
  if (!e.code) return { ok: false, reason: 'empty' };
  const verified = await verifyLicenseCode(e.code, e.publicKey, e.verifyOpts);
  if (!verified.ok) return verified;
  const now = effectiveNow(e.nowMs != null ? e.nowMs : Date.now(), e.maxSeen);
  const payload = verified.proof.payload;
  if (isExpired(payload.expiry, now)) {
    return { ok: false, reason: 'expired', proof: verified.proof };
  }
  const seat = seatDecision({
    seats: payload.seats,
    installId: e.installId,
    activations: e.activations,
  });
  if (!seat.ok) return { ok: false, reason: 'seats', proof: verified.proof };
  const prevSeen = Number(e.maxSeen) || 0;
  return {
    ok: true,
    proof: verified.proof,
    code: verified.code,
    record: {
      code: verified.code,
      activations: seat.activations,
      maxSeen: now,
    },
    changed: seat.added || now !== prevSeen || e.code !== verified.code,
  };
}
