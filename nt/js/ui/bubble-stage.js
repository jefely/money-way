// 界面：脉络 tab → 气泡画布
/**
 * 把 assembleScene 的结果画到画布上。不算钱、不算进度。
 * 层：第五层 · UI
 */

import { bridgeOutline, formatAmount } from '../core/bubble-motion.js';
import { assembleScene } from '../core/bubble-scene.js';
import { calendarDayAt } from '../core/lifevein-model.js';

const LANE = ['#2d6b58', '#3c7562', '#7a4248', '#34527f', '#7a5636', '#655245'];
const INK = '#f4f0e8';

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

function lift(hex, amt) {
  return rgb(hex).map((c) => {
    const n = amt > 0 ? c + (255 - c) * amt : c * (1 + amt);
    return Math.max(0, Math.min(255, Math.round(n)));
  });
}

function css(rgb3) {
  return 'rgb(' + rgb3[0] + ',' + rgb3[1] + ',' + rgb3[2] + ')';
}

/** 正圆。中心略亮、边缘略暗，外圈只留很窄的一层光。没有高光点。 */
function orb(g, x, y, r, hex) {
  const [R, G, B] = rgb(hex);
  const halo = g.createRadialGradient(x, y, r * 0.9, x, y, r * 1.12);
  halo.addColorStop(0, 'rgba(' + R + ',' + G + ',' + B + ',0.16)');
  halo.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0)');
  g.beginPath();
  g.arc(x, y, r * 1.12, 0, Math.PI * 2);
  g.fillStyle = halo;
  g.fill();
  const body = g.createRadialGradient(x, y, r * 0.15, x, y, r);
  body.addColorStop(0, css(lift(hex, 0.12)));
  body.addColorStop(0.7, hex);
  body.addColorStop(1, css(lift(hex, -0.2)));
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = body;
  g.fill();
}

function paintUnion(g, a, b, ca, cb) {
  const outline = bridgeOutline(a, b);
  if (!outline) return false;
  const [R, G, B] = rgb(ca);
  const halo = g.createRadialGradient(a.x, a.y, a.r * 0.9, a.x, a.y, a.r * 1.12);
  halo.addColorStop(0, 'rgba(' + R + ',' + G + ',' + B + ',0.12)');
  halo.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0)');
  g.beginPath();
  g.arc(a.x, a.y, a.r * 1.12, 0, Math.PI * 2);
  g.arc(b.x, b.y, b.r * 1.12, 0, Math.PI * 2);
  g.fillStyle = halo;
  g.fill();
  g.beginPath();
  for (const arc of outline) g.arc(arc.x, arc.y, arc.r, arc.a0, arc.a1, arc.ccw);
  g.closePath();
  const grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
  grad.addColorStop(0, ca);
  grad.addColorStop(1, cb);
  g.fillStyle = grad;
  g.fill();
  return true;
}

function fitLine(g, text, px, maxW) {
  let size = px;
  let shown = text;
  g.font = '500 ' + size + 'px sans-serif';
  while (size > 11 && g.measureText(shown).width > maxW) {
    size -= 0.5;
    g.font = '500 ' + size + 'px sans-serif';
  }
  while (shown.length > 1 && g.measureText(shown).width > maxW) shown = shown.slice(0, -1);
  if (shown !== text) shown = shown.slice(0, Math.max(1, shown.length - 1)) + '…';
  return { size, shown };
}

function paintLabel(g, b) {
  if (!b || b.r < 20 || b.label === false) return;
  const name = b.name || '';
  const amt = b.amount != null ? formatAmount(b.amount) : (b.v != null ? formatAmount(b.v) : '');
  if (!name && !amt) return;
  const maxW = b.r * 1.55;
  const nameFit = fitLine(g, name, Math.min(14, Math.max(11, b.r * 0.3)), maxW);
  const amtFit = fitLine(g, amt, Math.max(10, nameFit.size - 1), maxW);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK;
  g.font = '500 ' + nameFit.size + 'px sans-serif';
  g.fillText(nameFit.shown, b.x, b.y - nameFit.size * 0.58);
  g.font = '500 ' + amtFit.size + 'px sans-serif';
  g.fillText(amtFit.shown, b.x, b.y + amtFit.size * 0.72);
}

function partner(fly, which) {
  if (which === 'src') return { x: fly.sx, y: fly.sy, r: fly.sr, id: fly.srcId, lane: fly.srcLane };
  return { x: fly.dx, y: fly.dy, r: fly.dr, id: fly.dstId, lane: fly.dstLane };
}

/** 画一整帧。view = { scrollDay, ppd, width, height, reduced } */
export function drawBubbleStage(g, model, view) {
  const w = view.width;
  const h = view.height;
  const ink = inkOf();
  g.clearRect(0, 0, w, h);

  const scene = assembleScene(model, view);
  const bodies = [...scene.liab, ...scene.asset, ...scene.left, ...scene.right];
  const hidden = new Set();
  const unions = [];
  const candidates = [];
  for (const fly of scene.flies) {
    let best = null;
    let bestD = Infinity;
    for (const which of ['src', 'dst']) {
      const p = partner(fly, which);
      if (!p.id || !(p.r > 8)) continue;
      const d = Math.hypot(fly.x - p.x, fly.y - p.y);
      if (d < bestD && bridgeOutline(fly, p)) { best = p; bestD = d; }
    }
    if (best) candidates.push({ fly, best, d: bestD });
  }
  candidates.sort((a, b) => a.d - b.d);
  const taken = new Set();
  for (const c of candidates) {
    if (taken.has(c.fly.id) || taken.has(c.best.id)) continue;
    unions.push([c.fly, c.best]);
    taken.add(c.fly.id);
    taken.add(c.best.id);
    hidden.add(c.fly.id);
    hidden.add(c.best.id);
  }
  for (const b of bodies) {
    if (hidden.has(b.id)) continue;
    orb(g, b.x, b.y, b.r, colorOf(b.lane));
  }
  for (const fly of scene.flies) {
    if (hidden.has(fly.id)) continue;
    orb(g, fly.x, fly.y, fly.r, colorOf(fly.lane));
  }
  for (const [fly, end] of unions) paintUnion(g, fly, end, colorOf(fly.lane), colorOf(end.lane));
  for (const b of bodies) paintLabel(g, b);
  for (const fly of scene.flies) {
    if (hidden.has(fly.id)) continue;
    paintLabel(g, fly);
  }

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
