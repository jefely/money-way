/**
 * 把 QR 矩阵画到 canvas（UI 层）
 *
 * 只做绘制，不做编码。
 */

import { qrEncode } from '../core/qr-encode.js';

/** 静区：二维码四周必须留白，否则扫不出来 */
export const QUIET_MODULES = 4;

/**
 * 计算画布尺寸（给 <canvas> 定宽高用）
 * @param {number} size 模块数（qr.size）
 * @param {number} scale 每个模块多少像素
 */
export function canvasSize(size, scale) {
  const s = Math.max(2, Math.round(scale || 4));
  return (size + QUIET_MODULES * 2) * s;
}

/**
 * 画一张二维码。
 * @param {HTMLCanvasElement} canvas
 * @param {{size:number, rows:number[][]}} qr
 * @param {number} [modulePx] 每模块像素，默认 4（手机上更容易扫）
 */
export function drawQr(canvas, qr, modulePx) {
  const scale = Math.max(2, Math.round(modulePx || 4));
  const dim = qr.size + QUIET_MODULES * 2;
  canvas.width = dim * scale;
  canvas.height = dim * scale;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < qr.size; r++) {
    const row = qr.rows[r];
    for (let c = 0; c < qr.size; c++) {
      if (row[c]) {
        ctx.fillRect((c + QUIET_MODULES) * scale, (r + QUIET_MODULES) * scale, scale, scale);
      }
    }
  }
}

/**
 * 一步到位：文本 → 画好的 canvas；装不下返回 null。
 * @param {HTMLCanvasElement} canvas
 * @param {string} text
 * @param {number} [modulePx]
 * @returns {{ok:boolean, error?:string, size?:number}}
 */
export function paintText(canvas, text, modulePx) {
  const qr = qrEncode(text);
  if (qr.error) return { ok: false, error: qr.error };
  drawQr(canvas, qr, modulePx);
  return { ok: true, size: qr.size, version: qr.version };
}
