// 核心：两颗脉络气泡的融合轮廓
/**
 * 融合轮廓只由圆弧组成：A 的外弧、一侧凹桥、B 的外弧、另一侧凹桥。
 * 离得远、一圆含在另一圆里、或者桥算不出来，都不产生直线。
 */

import { bridgeOutline } from './bubble-motion.js';

function sweepOf(seg) {
  const cw = ((seg.a1 - seg.a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return seg.ccw ? cw - Math.PI * 2 : cw;
}

function pointAt(seg, t) {
  const a = seg.a0 + sweepOf(seg) * t;
  return [seg.x + Math.cos(a) * seg.r, seg.y + Math.sin(a) * seg.r];
}

function axisDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return Math.abs((p[0] - a.x) * dy - (p[1] - a.y) * dx) / d;
}

/** 四段弧要首尾相接，桥是短的内凹弧，而且整条轮廓不穿进任一圆。 */
export function outlineOk(a, b, parts) {
  if (!parts || parts.length < 1) return false;
  for (let i = 0; i < parts.length; i += 1) {
    const seg = parts[i];
    if (!(seg.r > 0.5) || !Number.isFinite(seg.a0) || !Number.isFinite(seg.a1)) return false;
    const p = pointAt(seg, 1);
    const q = pointAt(parts[(i + 1) % parts.length], 0);
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.8) return false;
    const ownA = Math.hypot(seg.x - a.x, seg.y - a.y) < 0.5;
    const ownB = Math.hypot(seg.x - b.x, seg.y - b.y) < 0.5;
    for (const t of [0.25, 0.5, 0.75]) {
      const s = pointAt(seg, t);
      const inA = Math.hypot(s[0] - a.x, s[1] - a.y) < a.r - 0.6;
      const inB = Math.hypot(s[0] - b.x, s[1] - b.y) < b.r - 0.6;
      if (ownA && inB) return false;
      if (ownB && inA) return false;
      if (!ownA && !ownB && (inA || inB)) return false;
    }
    if (!ownA && !ownB) {
      if (Math.abs(sweepOf(seg)) > Math.PI - 0.05) return false;
      const mid = pointAt(seg, 0.5);
      const chord = [
        (pointAt(seg, 0)[0] + pointAt(seg, 1)[0]) / 2,
        (pointAt(seg, 0)[1] + pointAt(seg, 1)[1]) / 2,
      ];
      if (axisDist(mid, a, b) > axisDist(chord, a, b) - 0.35) return false;
    }
  }
  return true;
}

function outerSeg(c, other, from, to) {
  const cw = ((to - from) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const mid = from + cw / 2;
  const mx = c.x + Math.cos(mid) * c.r;
  const my = c.y + Math.sin(mid) * c.r;
  const inside = Math.hypot(mx - other.x, my - other.y) < other.r;
  return { x: c.x, y: c.y, r: c.r, a0: from, a1: to, ccw: inside };
}

/** 两圆相交时，轮廓就是两段露出的圆弧，没有桥。 */
function overlapOutline(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (!(d > 0.5) || d >= a.r + b.r || d <= Math.abs(a.r - b.r) + 0.2) return null;
  const along = (d * d - b.r * b.r + a.r * a.r) / (2 * d);
  const h2 = a.r * a.r - along * along;
  if (!(h2 > 0.25)) return null;
  const h = Math.sqrt(h2);
  const ux = dx / d;
  const uy = dy / d;
  const px = a.x + ux * along;
  const py = a.y + uy * along;
  const i1 = { x: px - uy * h, y: py + ux * h };
  const i2 = { x: px + uy * h, y: py - ux * h };
  const ang = (c, p) => Math.atan2(p.y - c.y, p.x - c.x);
  return [
    outerSeg(a, b, ang(a, i1), ang(a, i2)),
    outerSeg(b, a, ang(b, i2), ang(b, i1)),
  ];
}

/**
 * 合并时的一条闭合轮廓。
 * 拉远、含在内部、桥退化，都返回 null 或单独的外圆，调用方不会去画直线。
 */
export function unionOutline(a, b) {
  if (!a || !b || !(a.r > 1) || !(b.r > 1)) return null;
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d + Math.min(a.r, b.r) <= Math.max(a.r, b.r) + 0.4) {
    const big = a.r >= b.r ? a : b;
    return [{ x: big.x, y: big.y, r: big.r, a0: 0, a1: Math.PI * 2, ccw: false }];
  }
  const bridged = bridgeOutline(a, b);
  if (bridged && outlineOk(a, b, bridged)) return bridged;
  if (d < a.r + b.r) {
    const lens = overlapOutline(a, b);
    if (lens && outlineOk(a, b, lens)) return lens;
  }
  return null;
}
