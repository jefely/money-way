// 界面：脉络 tab → 气泡画布
/**
 * 把 assembleScene 的结果画到画布上。不算钱、不算进度。
 * 层：第五层 · UI
 */

import { tangentBridge, formatAmount, juiceAt } from '../core/bubble-motion.js';
import { assembleScene } from '../core/bubble-scene.js';
import { layoutCallouts } from '../core/bubble-callout.js';
import { calendarDayAt } from '../core/lifevein-model.js';

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

function rgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function orb(g, x, y, r, hex, reduced) {
  const [R, G, B] = rgb(hex);
  const halo = g.createRadialGradient(x, y, r * 0.2, x, y, r * 1.7);
  halo.addColorStop(0, 'rgba(' + R + ',' + G + ',' + B + ',0.28)');
  halo.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0)');
  g.beginPath();
  g.arc(x, y, r * 1.7, 0, Math.PI * 2);
  g.fillStyle = halo;
  g.fill();
  if (!reduced) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, r * 1.7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const core = g.createRadialGradient(x - r * 0.22, y - r * 0.28, r * 0.04, x, y, r);
  core.addColorStop(0, 'rgba(255,255,255,0.96)');
  core.addColorStop(0.16, 'rgba(' + R + ',' + G + ',' + B + ',0.92)');
  core.addColorStop(0.55, 'rgba(' + R + ',' + G + ',' + B + ',0.62)');
  core.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0.08)');
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = core;
  g.fill();
  const rim = g.createRadialGradient(x, y, r * 0.68, x, y, r);
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(255,255,255,0.55)');
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = rim;
  g.fill();
}

function neck(g, fly) {
  const pairs = [
    [{ x: fly.x, y: fly.y, r: fly.r }, { x: fly.sx, y: fly.sy, r: fly.sr }, colorOf(fly.lane), colorOf(fly.lane)],
    [{ x: fly.x, y: fly.y, r: fly.r }, { x: fly.dx, y: fly.dy, r: fly.dr }, colorOf(fly.lane), colorOf(fly.toLane)],
  ];
  for (const [a, b, ca, cb] of pairs) {
    if (!(b.r > 6) || !(a.r > 4)) continue;
    const bridge = tangentBridge(a, b);
    if (!bridge) continue;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const spread = 0.42 + 0.5 * bridge.closeness;
    const rim = (c, t) => [c.x + Math.cos(t) * c.r, c.y + Math.sin(t) * c.r];
    const aR = rim(a, ang + spread);
    const aL = rim(a, ang - spread);
    const bL = rim(b, ang + Math.PI + spread);
    const bR = rim(b, ang + Math.PI - spread);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, ca);
    grad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, cb);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.beginPath();
    g.moveTo(aR[0], aR[1]);
    g.quadraticCurveTo(mx, my, bL[0], bL[1]);
    g.lineTo(bR[0], bR[1]);
    g.quadraticCurveTo(mx, my, aL[0], aL[1]);
    g.closePath();
    g.fillStyle = grad;
    g.globalAlpha = 0.72 + 0.25 * bridge.closeness;
    g.fill();
    g.beginPath();
    g.moveTo((aL[0] + aR[0]) / 2, (aL[1] + aR[1]) / 2);
    g.quadraticCurveTo(mx, my, (bL[0] + bR[0]) / 2, (bL[1] + bR[1]) / 2);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2.5 + 4 * bridge.closeness;
    g.globalAlpha = 0.95;
    g.stroke();
    g.restore();
  }
}

function caption(b) {
  const name = b.name || '';
  const amt = b.amount != null ? formatAmount(b.amount) : (b.v != null ? formatAmount(b.v) : '');
  return [name, amt].filter(Boolean).join(' ');
}

function drawCallouts(g, ink, width, bodies, flies) {
  g.font = '11px sans-serif';
  const items = [];
  for (const b of flies) {
    const text = caption(b);
    if (!text) continue;
    items.push({ ...b, text, tw: g.measureText(text).width + 2, priority: 2 });
  }
  for (const b of bodies) {
    const text = caption(b);
    if (!text) continue;
    items.push({ ...b, text, tw: g.measureText(text).width + 2, priority: b.r > 28 ? 1 : 0 });
  }
  const slots = layoutCallouts(items, width, [{ x: width - 122, y: 0, w: 122, h: 42 }]);
  g.lineWidth = 1;
  g.textBaseline = 'middle';
  for (const s of slots) {
    g.globalAlpha = s.alpha;
    g.strokeStyle = ink.text;
    g.beginPath();
    g.moveTo(s.x1, s.y1);
    g.lineTo(s.x2, s.y2);
    g.stroke();
    g.textAlign = s.side > 0 ? 'left' : 'right';
    const tx = s.side > 0 ? s.x2 + 3 : s.x2 - 3;
    g.lineWidth = 3;
    g.strokeStyle = ink.bg;
    g.strokeText(s.text, tx, s.y2);
    g.fillStyle = ink.text;
    g.fillText(s.text, tx, s.y2);
    g.lineWidth = 1;
  }
  g.globalAlpha = 1;
}

function mixHex(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function paintImpact(g, fly) {
  const j = juiceAt(fly.t || 0);
  if (j.ripple < 0.2) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.beginPath();
  g.arc(fly.x, fly.y, fly.r * (1.15 + j.ripple * 0.45), 0, Math.PI * 2);
  g.strokeStyle = colorOf(fly.lane);
  g.globalAlpha = j.ripple * 0.55;
  g.lineWidth = 1.25;
  g.stroke();
  g.restore();
}

function paintGlow(g, b) {
  const [R, G, B] = rgb(colorOf(b.lane));
  const shade = g.createRadialGradient(b.x, b.y, b.r * 0.6, b.x, b.y, b.r * 1.45);
  shade.addColorStop(0, 'rgba(' + R + ',' + G + ',' + B + ',0.22)');
  shade.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0)');
  g.beginPath();
  g.arc(b.x, b.y, b.r * 1.45, 0, Math.PI * 2);
  g.fillStyle = shade;
  g.fill();
}

/** 画一整帧。view = { scrollDay, ppd, width, height, reduced } */
export function drawBubbleStage(g, model, view) {
  const w = view.width;
  const h = view.height;
  const ink = inkOf();
  g.clearRect(0, 0, w, h);

  const scene = assembleScene(model, view);
  const reduced = !!view.reduced;
  const juicy = reduced ? [] : scene.flies.filter((f) => f.r > 7).sort((a, b) => b.r - a.r).slice(0, 8);
  const bodies = [...scene.liab, ...scene.asset, ...scene.left, ...scene.right];
  for (const b of bodies) {
    if (!reduced && b.v > 4000) paintGlow(g, b);
    orb(g, b.x, b.y, b.r, colorOf(b.lane), reduced);
  }
  for (const fly of scene.flies) {
    const hex = mixHex(colorOf(fly.lane), colorOf(fly.toLane), (fly.t || 0) * 0.55);
    orb(g, fly.x, fly.y, fly.r, hex, reduced);
  }
  for (const fly of scene.flies) neck(g, fly);
  if (!reduced) for (const fly of juicy) paintImpact(g, fly);
  drawCallouts(g, ink, w, bodies, scene.flies);

  g.fillStyle = ink.muted;
  g.font = '10px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('借贷', w * 0.30, h - 10);
  g.fillText('资产', w * 0.68, h - 10);
  paintRuler(g, model, view, ink);
  paintMonth(g, ink, view.month);
  return scene;
}

function paintRuler(g, model, view, ink) {
  if (!model || !model.startIso) return;
  const h = view.height;
  const top = view.scrollDay - (h * 0.5) / view.ppd;
  const bot = view.scrollDay + (h * 0.5) / view.ppd;
  const step = view.ppd > 26 ? 1 : 2;
  g.strokeStyle = ink.muted;
  g.fillStyle = ink.muted;
  g.lineWidth = 1;
  g.font = '10px sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  for (let v = Math.ceil(top); v <= bot; v += step) {
    const y = h * 0.5 + (v - view.scrollDay) * view.ppd;
    if (y < 40 || y > h - 8) continue;
    const cal = calendarDayAt(model, v);
    const dt = new Date(Date.parse(model.startIso + 'T00:00:00') + Math.round(cal) * 86400000);
    if (Number.isNaN(dt.getTime())) continue;
    g.beginPath();
    g.moveTo(32, y);
    g.lineTo(42, y);
    g.stroke();
    g.fillText(String(dt.getDate()), 46, y);
  }
}

function paintMonth(g, ink, month) {
  if (!month || !month.to) return;
  const p = Math.min(1, Math.max(0, month.p == null ? 1 : month.p));
  const sign = month.dir >= 0 ? -1 : 1;
  g.font = '600 15px sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = ink.text;
  if (p < 1 && month.from && month.from !== month.to) {
    g.globalAlpha = 1 - p;
    g.fillText(month.from, 36, 22 + sign * p * 26);
    g.globalAlpha = p;
    g.fillText(month.to, 36, 22 + sign * (p - 1) * 26);
    g.globalAlpha = 1;
    return;
  }
  g.fillText(month.to, 36, 22);
}
