// 界面：脉络 tab → 气泡画布
/**
 * 把 assembleScene 的结果画到画布上。不算钱、不算进度。
 * 层：第五层 · UI
 */

import { bridgeOutline, formatAmount } from '../core/bubble-motion.js';
import { assembleScene, cameraFit } from '../core/bubble-scene.js';
import { calendarDayAt } from '../core/lifevein-model.js';

const LANE = ['#2fbfa8', '#3a9e88', '#e25d86', '#4d86e0', '#e15b4a', '#d4893c'];

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

function lum(bg) {
  const m = String(bg || '').match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  let r = 0;
  let gv = 0;
  let b = 0;
  if (m) { r = +m[1]; gv = +m[2]; b = +m[3]; }
  else if (String(bg).trim().startsWith('#')) {
    const n = parseInt(String(bg).trim().slice(1, 7), 16);
    if (!Number.isNaN(n)) { r = (n >> 16) & 255; gv = (n >> 8) & 255; b = n & 255; }
  }
  return (0.2126 * r + 0.7152 * gv + 0.0722 * b) / 255;
}

/** 一块平的底。深色略偏暖，浅色跟主题，没有管壁。 */
function paintVessel(g, w, h, light) {
  g.fillStyle = light ? '#f6f3f4' : '#141018';
  g.fillRect(0, 0, w, h);
}

/** 正圆细胞：半透明身体、亮核、窄光晕、一圈细膜。线宽按屏幕像素，放大仍清晰。 */
function orb(g, x, y, r, hex, stroke, cam) {
  const [R, G, B] = rgb(hex);
  const halo = g.createRadialGradient(x, y, r * 0.55, x, y, r * 1.28);
  halo.addColorStop(0, 'rgba(' + R + ',' + G + ',' + B + ',0.22)');
  halo.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0)');
  g.beginPath();
  g.arc(x, y, r * 1.28, 0, Math.PI * 2);
  g.fillStyle = halo;
  g.fill();
  const hot = lift(hex, 0.78);
  const body = g.createRadialGradient(x, y, r * 0.02, x, y, r);
  body.addColorStop(0, 'rgba(' + hot[0] + ',' + hot[1] + ',' + hot[2] + ',0.95)');
  body.addColorStop(0.18, 'rgba(' + R + ',' + G + ',' + B + ',0.78)');
  body.addColorStop(0.7, 'rgba(' + R + ',' + G + ',' + B + ',0.5)');
  body.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0.34)');
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = body;
  g.fill();
  g.lineWidth = Math.min(r * 0.12, 1.15 / (cam || 1));
  g.strokeStyle = stroke;
  g.stroke();
}

function paintUnion(g, a, b, ca, cb, stroke, cam) {
  const outline = bridgeOutline(a, b);
  if (!outline) return false;
  const [R, G, B] = rgb(ca);
  const halo = g.createRadialGradient(a.x, a.y, a.r * 0.2, a.x, a.y, Math.max(a.r, b.r) * 1.6);
  halo.addColorStop(0, 'rgba(' + R + ',' + G + ',' + B + ',0.22)');
  halo.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0)');
  g.beginPath();
  g.arc(a.x, a.y, a.r * 1.55, 0, Math.PI * 2);
  g.arc(b.x, b.y, b.r * 1.55, 0, Math.PI * 2);
  g.fillStyle = halo;
  g.fill();
  g.beginPath();
  for (const arc of outline) g.arc(arc.x, arc.y, arc.r, arc.a0, arc.a1, arc.ccw);
  g.closePath();
  const grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
  const ha = lift(ca, 0.55);
  const hb = lift(cb, 0.55);
  grad.addColorStop(0, 'rgba(' + ha[0] + ',' + ha[1] + ',' + ha[2] + ',0.78)');
  grad.addColorStop(1, 'rgba(' + hb[0] + ',' + hb[1] + ',' + hb[2] + ',0.78)');
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = Math.min(Math.min(a.r, b.r) * 0.12, 1.15 / (cam || 1));
  g.strokeStyle = stroke;
  g.stroke();
  return true;
}

function paintLabel(g, b, cam, fill) {
  if (!b || b.label === false) return;
  const screen = b.r * (cam || 1);
  if (screen < 15) return;
  const name = b.name || '';
  const amt = b.amount != null ? formatAmount(b.amount) : (b.v != null ? formatAmount(b.v) : '');
  if (!name && !amt) return;
  let namePx = Math.min(14, b.r * 0.36);
  const maxW = b.r * 1.5;
  g.font = '500 ' + namePx + 'px sans-serif';
  while (namePx > 6 && g.measureText(name).width > maxW) {
    namePx -= 0.5;
    g.font = '500 ' + namePx + 'px sans-serif';
  }
  if (namePx * (cam || 1) < 7) return;
  let shown = name;
  while (shown.length > 1 && g.measureText(shown).width > maxW) shown = shown.slice(0, -1);
  if (shown !== name && shown.length > 1) shown = shown.slice(0, -1) + '…';
  const amtPx = Math.max(6, namePx * 0.82);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = fill;
  g.font = '500 ' + namePx + 'px sans-serif';
  if (shown) g.fillText(shown, b.x, b.y - namePx * 0.52);
  g.font = '500 ' + amtPx + 'px sans-serif';
  if (amt) g.fillText(amt, b.x, b.y + amtPx * 0.62);
}

function partner(fly, which) {
  if (which === 'src') return { x: fly.sx, y: fly.sy, r: fly.sr, id: fly.srcId, lane: fly.srcLane };
  return { x: fly.dx, y: fly.dy, r: fly.dr, id: fly.dstId, lane: fly.dstLane };
}

function screenOf(x, y, view) {
  const cam = view.cam || { s: 1, x: 0, y: 0 };
  return {
    x: (x - view.width / 2) * cam.s + view.width / 2 + (cam.x || 0),
    y: (y - view.height / 2) * cam.s + view.height / 2 + (cam.y || 0),
  };
}

/** 画一整帧。view = { scrollDay, ppd, width, height, cam } */
export function drawBubbleStage(g, model, view) {
  const w = view.width;
  const h = view.height;
  const ink = inkOf();
  const light = lum(ink.bg) > 0.6;
  const cam = view.cam || { s: 1, x: 0, y: 0 };
  const stroke = light ? 'rgba(28,16,24,0.72)' : 'rgba(255,244,246,0.82)';
  const labelInk = light ? '#241820' : '#f6f1f3';
  g.clearRect(0, 0, w, h);
  paintVessel(g, w, h, light);

  const scene = assembleScene(model, view);
  if (view.fit && !view.cam) view.cam = cameraFit(scene, w, h);
  const use = view.cam || cam;
  g.save();
  g.translate(w / 2 + (use.x || 0), h / 2 + (use.y || 0));
  g.scale(use.s || 1, use.s || 1);
  g.translate(-w / 2, -h / 2);
  const bodies = [...scene.liab, ...scene.asset, ...scene.left, ...scene.right];
  const hidden = new Set();
  const unions = [];
  const candidates = [];
  for (const fly of scene.flies) {
    let best = null;
    let bestD = Infinity;
    for (const which of ['src', 'dst']) {
      const p = partner(fly, which);
      if (!p.id || !(p.r > 3)) continue;
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
    orb(g, b.x, b.y, b.r, colorOf(b.lane), stroke, use.s || 1);
  }
  for (const fly of scene.flies) {
    if (hidden.has(fly.id)) continue;
    orb(g, fly.x, fly.y, fly.r, colorOf(fly.lane), stroke, use.s || 1);
  }
  for (const [fly, end] of unions) paintUnion(g, fly, end, colorOf(fly.lane), colorOf(end.lane), stroke, use.s || 1);
  for (const b of bodies) paintLabel(g, b, use.s || 1, labelInk);
  for (const fly of scene.flies) {
    if (hidden.has(fly.id)) continue;
    paintLabel(g, fly, use.s || 1, labelInk);
  }
  g.restore();

  g.fillStyle = ink.muted;
  g.font = '10px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('借贷', w * 0.30, h - 10);
  g.fillText('资产', w * 0.68, h - 10);
  paintRuler(g, model, view, ink, use);
  paintMonth(g, ink, view.month);
  return scene;
}

function paintRuler(g, model, view, ink, cam) {
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
    const worldY = h * 0.5 + (v - view.scrollDay) * view.ppd;
    const y = (worldY - h / 2) * (cam.s || 1) + h / 2 + (cam.y || 0);
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
