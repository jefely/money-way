// 核心：脉络一帧里每颗泡的位置
/**
 * 把滚动进度铺成一帧气泡。纯函数，不碰 DOM。
 * 层：第一层 · core
 *
 * 布局：资产驻留在画面中央，负债驻留在左缘，当天费用分类在右缘随日期滚走。
 */

import { buildHome } from './bubble-home.js';

/** 二次曲线绕开簇。t=0 在起点，t=1 在终点，中段被障碍往旁边推。 */
export function arcPoint(src, dst, obstacles, t) {
  const dx = dst.x - src.x;
  const dy = dst.y - src.y;
  const len2 = dx * dx + dy * dy || 1;
  const len = Math.sqrt(len2);
  const nx = -dy / len;
  const ny = dx / len;
  let push = 0;
  for (const o of obstacles) {
    if (!o) continue;
    const u = Math.max(0, Math.min(1, ((o.x - src.x) * dx + (o.y - src.y) * dy) / len2));
    const px = src.x + dx * u;
    const py = src.y + dy * u;
    const ox = o.x - px;
    const oy = o.y - py;
    const d = Math.hypot(ox, oy);
    const need = o.r + 6;
    if (d >= need) continue;
    const sign = Math.sign(ox * nx + oy * ny) || -1;
    push += -sign * (need - d);
  }
  const cx = (src.x + dst.x) / 2 + nx * push;
  const cy = (src.y + dst.y) / 2 + ny * push;
  const s = 1 - t;
  return {
    x: s * s * src.x + 2 * s * t * cx + t * t * dst.x,
    y: s * s * src.y + 2 * s * t * cy + t * t * dst.y,
    cx, cy,
  };
}

/** 整帧。位置只由滚动进度决定，倒放回到同一帧。 */
export function assembleScene(model, view) {
  return buildHome(model, view || {});
}

/** 只按中间的资产缩放，并且把它们收进中带。左右缘是屏幕坐标，不参与这次缩放。 */
export function cameraFit(scene, width, height) {
  const all = (scene.asset || []).filter((b) => b && b.r > 0);
  if (!all.length || !(width > 0) || !(height > 0)) return { s: 1, x: 0, y: 0 };
  const roomL = width / 2 - width * 0.22;
  const roomR = width * 0.78 - width / 2;
  const halfH = height / 2 - 28;
  let fit = 1;
  for (const b of all) {
    const right = b.x + b.r - width / 2;
    const left = width / 2 - (b.x - b.r);
    const bot = b.y + b.r - height / 2;
    const top = height / 2 - (b.y - b.r);
    if (right > 1 && roomR > 0) fit = Math.min(fit, roomR / right);
    if (left > 1 && roomL > 0) fit = Math.min(fit, roomL / left);
    if (bot > 1 && halfH > 0) fit = Math.min(fit, halfH / bot);
    if (top > 1 && halfH > 0) fit = Math.min(fit, halfH / top);
  }
  return { s: Math.max(0.02, Math.min(1, fit)), x: 0, y: 0 };
}
