/**
 * QR 编码入口（纯函数）
 * 层：第一层 · 数据基座
 *
 * qrEncode(text) -> { version, mask, size, rows }
 *   rows 是 size×size 的 0/1 二维数组，1 表示黑块。
 *   内容装不下时返回 { error }。
 *
 * 由 core/qr-rs.js（纠错）与 core/qr-matrix.js（矩阵）组合而成。
 */

import { qrPickVersion, qrBuildData, qrInterleave, qrCapacityBytes } from './qr-rs.js';
import { qrBuildMatrix, qrApplyMask, qrWriteFormat, qrPenalty } from './qr-matrix.js';

/** 某个版本能装多少字节（UTF-8） */
export function qrCapacity(ver) {
  return qrCapacityBytes(ver);
}

/** 给定字节数，返回最小可用版本；装不下返回 -1 */
export function qrVersionFor(nbytes) {
  return qrPickVersion(nbytes);
}

/**
 * 编码。
 * @param {string} text
 * @returns {{version:number, mask:number, size:number, rows:number[][]} | {error:string}}
 */
export function qrEncode(text) {
  const bytes = new TextEncoder().encode(String(text));
  const ver = qrPickVersion(bytes.length);
  if (ver < 1) return { error: '内容太长，二维码装不下（上限约 2953 字节）' };

  const cw = qrInterleave(qrBuildData(bytes, ver), ver);
  const built = qrBuildMatrix(cw, ver);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const mm = qrApplyMask(built.m, built.fixed, built.size, mask);
    qrWriteFormat(mm, built.size, mask, ver);
    const p = qrPenalty(mm, built.size);
    if (!best || p < best.p) best = { p, m: mm, mask };
  }

  const rows = [];
  for (let r = 0; r < built.size; r++) {
    rows.push(Array.from(best.m.subarray(r * built.size, (r + 1) * built.size)));
  }
  return { version: ver, mask: best.mask, size: built.size, rows };
}
