// 界面：（无界面）激活码策略：档位、到期、设备名额、时钟
/**
 * 不保存 isPro。调用方每次拿验过签的载荷自己算。
 */

import { hex } from './sha256.js';

export const FEATURES = {
  'report.advanced': 0x0001,
  'chart.ringExport': 0x0002,
};

const REASON = {
  empty: '请先粘贴激活码',
  alphabet: '激活码里有无法识别的字符',
  checksum: '激活码校验未通过，多半是抄错了一位',
  version: '不认识的激活码版本',
  length: '激活码长度不对',
  user: '持有人标识无效',
  signature: '签名无效，这枚激活码不是当前公钥签发的',
  expired: '激活码已过期',
  seats: '这枚激活码的设备名额已用完',
  'placeholder-key': '应用里还是占位公钥。请先用 nt/tools/license-keygen.mjs --write-public 写入自己的公钥。',
  tampered: '非官方或被篡改的版本',
  id: '许可证编号必须是 8 字节',
  seal: '密封钥必须是 16 字节',
  sig: '签名长度不对',
};

export function reasonText(code) {
  return REASON[code] || '激活码无法使用';
}

export function tierMask(tier) {
  const t = Number(tier) || 0;
  if (t >= 2) return FEATURES['report.advanced'] | FEATURES['chart.ringExport'];
  if (t >= 1) return FEATURES['report.advanced'];
  return 0;
}

export function tierLabel(tier, features) {
  const t = Number(tier) || 0;
  if (t >= 2) return '专业';
  if (t === 1) return '进阶';
  if (Number(features)) return '自定义';
  return '免费档';
}

/** 功能位或档位自带的功能，二者满足一个即可。 */
export function featureAllowed(payload, feature) {
  const bit = FEATURES[feature];
  if (!bit || !payload) return false;
  const mask = ((Number(payload.features) || 0) | tierMask(payload.tier)) & 0xffff;
  return (mask & bit) === bit;
}

/** 见过的最大时间。时钟往回拨时，仍用更大的那个。 */
export function effectiveNow(nowMs, maxSeenMs) {
  const n = Number(nowMs);
  const m = Number(maxSeenMs);
  const a = Number.isFinite(n) && n > 0 ? n : 0;
  const b = Number.isFinite(m) && m > 0 ? m : 0;
  return Math.max(a, b);
}

/** expiry 为 0 表示不过期。nowMs 请先过 effectiveNow。 */
export function isExpired(expirySec, nowMs) {
  const exp = Number(expirySec) || 0;
  if (!exp) return false;
  return Number(nowMs) >= exp * 1000;
}

/**
 * 软设备绑定。seats = 0 表示不限制。
 * 名额记在本地账本里，清数据可以重来 —— 这是离线方案的上限，不是漏洞被忘掉。
 */
export function seatDecision(input) {
  const src = input || {};
  const seats = Number(src.seats) || 0;
  const installId = String(src.installId || '');
  const raw = Array.isArray(src.activations) ? src.activations : [];
  const list = [];
  for (let i = 0; i < raw.length; i++) {
    const id = String(raw[i] || '');
    if (id && list.indexOf(id) < 0) list.push(id);
  }
  if (!seats) return { ok: true, activations: list, added: false };
  if (!installId) return { ok: false, activations: list, added: false, reason: 'seats' };
  if (list.indexOf(installId) >= 0) return { ok: true, activations: list, added: false };
  if (list.length < seats) {
    return { ok: true, activations: list.concat([installId]), added: true };
  }
  return { ok: false, activations: list, added: false, reason: 'seats' };
}

export function formatUnixDate(sec) {
  const d = new Date(Number(sec) * 1000);
  if (!Number.isFinite(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** 设置页展示用。没有单独的 isPro 字段。 */
export function describePayload(payload) {
  const seats = payload.seats ? String(payload.seats) + ' 台' : '不限制';
  const expiry = payload.expiry ? formatUnixDate(payload.expiry) : '长期有效';
  return [
    ['档位', tierLabel(payload.tier, payload.features)],
    ['持有人', payload.user],
    ['签发', formatUnixDate(payload.issued)],
    ['到期', expiry],
    ['编号', hex(payload.licenseId)],
    ['设备名额', seats],
  ];
}

export function premiumBlocked(input) {
  const src = input || {};
  if (src.integrity && src.integrity.tampered) return true;
  const origin = src.originStatus;
  if (origin && origin.ok === false && !origin.local) return true;
  return false;
}
