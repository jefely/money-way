// 核心：脉络一帧里每颗泡的位置
/**
 * 把滚动进度铺成一帧气泡。纯函数，不碰 DOM。
 * 层：第一层 · core
 *
 * 布局：负债和权益贴窗口左缘，资产在正中，费用和成本贴窗口右缘并随日期滚走。
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

/** 在圆边上取一点。优先朝向对方，但飞泡不能因此压进别的圆。 */
export function rimClear(node, toward, blocks, flyR) {
  const base = Math.atan2(toward.y - node.y, toward.x - node.x);
  let best = null;
  for (let i = 0; i < 24; i += 1) {
    const delta = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12);
    const a = base + delta;
    const x = node.x + Math.cos(a) * node.r;
    const y = node.y + Math.sin(a) * node.r;
    let clear = 1e9;
    for (const o of blocks) {
      if (!o || o.id === node.id) continue;
      clear = Math.min(clear, Math.hypot(x - o.x, y - o.y) - o.r - flyR);
    }
    const score = (clear >= 1 ? 1000 : clear) - Math.abs(delta);
    if (!best || score > best.score) best = { x, y, id: node.id, clear, score };
  }
  return best || { x: node.x, y: node.y, id: node.id };
}

/** 整帧。位置只由滚动进度决定，倒放回到同一帧。 */
export function assembleScene(model, view) {
  return buildHome(model, view || {});
}

/** 窗口三带自己装下圆。不再把整帧绕中心缩小，否则左右缘会被收进中间。 */
export function cameraFit() {
  return { s: 1, x: 0, y: 0 };
}
