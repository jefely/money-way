// 界面：（无界面）打开会员占位功能（高级报表 / 环图导出）
/**
 * 这里会再验一次签，再用签名字节做出 token。
 * 核心记账不引用本文件。
 */

import { has } from './entitlements.js';
import { verifyLicenseCode } from './license-verify.js';
import { maskBytes, signatureToken } from './premium-mask.js';
import { REPORT_SEALED, RING_SEALED } from './premium-sealed.js';

const SEALED = {
  'report.advanced': REPORT_SEALED,
  'chart.ringExport': RING_SEALED,
};

/**
 * @param {'report.advanced'|'chart.ringExport'} feature
 * @param {object} env 与 entitlements.has 相同
 * @returns {Promise<{id:string,title:string,note:string,token:string}|null>}
 */
export async function openPremium(feature, env) {
  const e = env || {};
  const verified = await verifyLicenseCode(e.code, e.publicKey, e.verifyOpts);
  if (!verified.ok || !verified.proof || !verified.proof.allows(feature)) return null;
  const allowed = await has(feature, e);
  if (!allowed) return null;
  const sealed = SEALED[feature];
  if (!sealed) return null;
  const plain = await maskBytes(sealed, verified.proof.payload.seal, feature);
  let spec = null;
  try {
    spec = JSON.parse(new TextDecoder().decode(plain));
  } catch (err) {
    return null;
  }
  if (!spec || spec.id !== feature || !spec.title) return null;
  spec.token = await signatureToken(verified.proof.sig, feature);
  return spec;
}

/** 导出文本里带上签名派生的 token。没有 token 就当没打开。 */
export function renderPremium(spec) {
  if (!spec || !spec.token || String(spec.token).length !== 16) return '';
  return spec.title + '\n' + spec.note + '\n绑定 ' + spec.token;
}
