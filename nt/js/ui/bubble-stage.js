// 界面：脉络 tab → 气泡画布
/**
 * 把 assembleScene 的结果画到画布上。不算钱、不算进度。
 * 层：第五层 · UI
 */

import { assembleScene, gooAngles } from '../core/bubble-motion.js';

const LANE = ['#12b76a', '#0e8a57', '#ef4444', '#3b6cff', '#f97316', '#d4a017'];

function colorOf(lane) {
  return LANE[lane] || '#8b84a8';
}

function inkOf() {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || fallback).trim() || fallback;
  return {
    text: pick('--nt-text', '#ddd'),
    muted: pick('--nt-text-muted', '#8b849c'),
    line: pick('--nt-bg-line', 'rgba(255,255,255,0.16)'),
    bg: pick('--nt-bg', '#000'),
  };
}

function circle(g, x, y, r, color, alpha) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.globalAlpha = alpha;
  g.fill();
  g.globalAlpha = 1;
  g.lineWidth = 2;
  g.strokeStyle = inkBg;
  g.stroke();
}

let inkBg = '#000';

function neck(g, fly) {
  const pairs = [
    [fly.x, fly.y, fly.r, fly.sx, fly.sy, fly.sr],
    [fly.x, fly.y, fly.r, fly.dx, fly.dy, fly.dr],
  ];
  for (const [x, y, r, px, py, pr] of pairs) {
    if (!(pr > 3) || !(r > 2)) continue;
    const ang = gooAngles(x, y, r, px, py, pr);
    if (!ang) continue;
    const A = (t, cx, cy, cr) => [cx + Math.cos(t) * cr, cy + Math.sin(t) * cr];
    const a0 = ang.angle - ang.ha;
    const a1 = ang.angle + ang.ha;
    const b0 = ang.angle + Math.PI - ang.hb;
    const b1 = ang.angle + Math.PI + ang.hb;
    const p1 = A(a1, x, y, r);
    const p0 = A(a0, x, y, r);
    const q0 = A(b0, px, py, pr);
    const q1 = A(b1, px, py, pr);
    const mx = (x + px) / 2;
    const my = (y + py) / 2;
    g.beginPath();
    g.moveTo(p1[0], p1[1]);
    g.quadraticCurveTo(mx, my, q0[0], q0[1]);
    g.lineTo(q1[0], q1[1]);
    g.quadraticCurveTo(mx, my, p0[0], p0[1]);
    g.closePath();
    g.fillStyle = colorOf(fly.lane);
    g.globalAlpha = 0.9;
    g.fill();
    g.globalAlpha = 1;
  }
}

function label(g, x, y, r, text, ink) {
  if (r < 13 || !text) return;
  g.fillStyle = ink.text;
  g.font = Math.max(9, Math.min(12, r * 0.38)) + 'px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(text).slice(0, 4), x, y);
}

/** 画一整帧。view = { scrollDay, ppd, width, height } */
export function drawBubbleStage(g, model, view) {
  const w = view.width;
  const h = view.height;
  const ink = inkOf();
  inkBg = ink.bg;
  g.clearRect(0, 0, w, h);

  g.strokeStyle = ink.line;
  g.lineWidth = 1;
  g.setLineDash([3, 6]);
  for (const k of [0.25, 0.5, 0.75]) {
    g.beginPath();
    g.moveTo(0, h * k);
    g.lineTo(w, h * k);
    g.stroke();
  }
  g.setLineDash([]);
  const scene = assembleScene(model, view);
  for (const fly of scene.flies) neck(g, fly);
  for (const b of scene.flies) circle(g, b.x, b.y, b.r, colorOf(b.lane), 0.96);
  for (const b of [...scene.left, ...scene.right, ...scene.liab, ...scene.asset]) {
    circle(g, b.x, b.y, b.r, colorOf(b.lane), 0.96);
    label(g, b.x, b.y, b.r, b.name, ink);
  }

  const crowd = [...scene.left, ...scene.right, ...scene.liab, ...scene.asset, ...scene.flies];
  const clear = (x, y) => !crowd.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + 10);
  g.fillStyle = ink.muted;
  g.font = '10px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  if (clear(w * 0.5, h * 0.5 - 6)) g.fillText('现在', w * 0.5, h * 0.5 - 6);
  g.fillText('借贷', w * 0.30, h - 10);
  g.fillText('资产', w * 0.68, h - 10);

  if (model && model.startIso) {
    g.textAlign = 'left';
    g.font = '10px monospace';
    const topDay = view.scrollDay - (h * 0.5) / view.ppd;
    const botDay = view.scrollDay + (h * 0.5) / view.ppd;
    const step = view.ppd > 36 ? 1 : 7;
    for (let d = Math.ceil(topDay); d <= botDay; d += step) {
      if (d < 0 || d >= model.days) continue;
      const y = h * 0.5 + (d - view.scrollDay) * view.ppd;
      if (y < 18 || y > h - 8) continue;
      const dt = new Date(Date.parse(model.startIso + 'T00:00:00') + d * 86400000);
      const tag = String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      if (!clear(w * 0.5, y - 2)) continue;
      g.fillStyle = ink.muted;
      g.textAlign = 'center';
      g.fillText(tag, w * 0.5, y - 2);
    }
  }
  return scene;
}
