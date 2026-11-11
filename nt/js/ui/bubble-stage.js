// 界面：脉络 tab → 气泡画布
/**
 * 把 assembleScene 的结果画到画布上。不算钱、不算进度。
 * 层：第五层 · UI
 */

import { formatAmount } from '../core/bubble-motion.js';
import { assembleScene, cameraFit } from '../core/bubble-scene.js';
import { grainCanvas, readLvParams } from './lv-params.js';
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

const FIELD = {
  pastel: { a: '#7ed4c8', b: '#c5c2ee', c: '#b7c6f0', text: '#ffffff', stroke: '#f7f4ff' },
  light: { a: '#fff6ec', b: '#f3e4d2', c: '#e6d5c2', text: '#2a221c', stroke: '#3a322c' },
  darkfield: { a: '#322c40', b: '#14121c', c: '#07060c', text: '#f7f2f5', stroke: '#f4eef2' },
  dusk: { a: '#f0b48c', b: '#c46d98', c: '#5a4e86', text: '#fff8f3', stroke: '#fff1e8' },
  mint: { a: '#e7f6ef', b: '#c5e8d8', c: '#c5d6ee', text: '#1b2a24', stroke: '#24362e' },
};

const THEME_STROKE = { '#f4eef2': 1, '#f7f4ff': 1, '#2a2428': 1, '#3a3228': 1, '#e7f6ee': 1 };

function paintField(g, dw, dh, dpr, p, light) {
  const id = p.preset || 'pastel';
  const preset = FIELD[id];
  g.globalAlpha = 1;
  g.fillStyle = light ? '#f4f1ee' : '#100e14';
  g.fillRect(0, 0, dw, dh);
  const strength = p.bg == null ? 0.75 : p.bg;
  if (preset && strength > 0.01) {
    const grd = g.createLinearGradient(0, 0, dw * 0.15, dh);
    grd.addColorStop(0, preset.a);
    grd.addColorStop(0.48, preset.b);
    grd.addColorStop(1, preset.c);
    g.globalAlpha = strength;
    g.fillStyle = grd;
    g.fillRect(0, 0, dw, dh);
    g.globalAlpha = 1;
  }
  if ((p.grain || 0) > 0.004 && typeof document !== 'undefined') {
    const pat = g.createPattern(grainCanvas(dpr, p), 'repeat');
    if (pat) {
      g.globalAlpha = p.grain;
      g.fillStyle = pat;
      g.fillRect(0, 0, dw, dh);
      g.globalAlpha = 1;
    }
  }
}

function lookOf(p, light) {
  const preset = FIELD[p.preset || 'pastel'] || FIELD.pastel;
  const custom = p.stroke && !THEME_STROKE[String(p.stroke).toLowerCase()];
  const strokeHex = custom ? p.stroke : (p.preset === 'plain' ? (light ? '#2a2428' : '#f4eef2') : preset.stroke);
  const text = p.preset === 'plain' ? (light ? '#241820' : '#f6f1f3') : preset.text;
  return { strokeHex, text };
}

function rgba(hex, a) {
  const [r, gv, b] = rgb(hex);
  return 'rgba(' + r + ',' + gv + ',' + b + ',' + a + ')';
}

/** 透明圆。细描边，中心一小块偏暗的色晕，没有亮点。 */
function orb(g, x, y, r, hex, p, cam) {
  if (p.fillA > 0.01) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = rgba(hex, p.fillA);
    g.fill();
  }
  const rad = Math.max(0.8, r * (p.coreR || 0.32));
  const ink = p.coreInk == null ? 0.75 : p.coreInk;
  const [R, G, B] = rgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c * ink))));
  const soft = Math.min(0.92, Math.max(0.08, p.coreSoft == null ? 0.55 : p.coreSoft));
  const a0 = p.coreA == null ? 0.42 : p.coreA;
  const grd = g.createRadialGradient(x, y, 0, x, y, rad);
  grd.addColorStop(0, 'rgba(' + R + ',' + G + ',' + B + ',' + a0 + ')');
  grd.addColorStop(soft, 'rgba(' + R + ',' + G + ',' + B + ',' + (a0 * 0.28) + ')');
  grd.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0)');
  g.beginPath();
  g.arc(x, y, rad, 0, Math.PI * 2);
  g.fillStyle = grd;
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.lineWidth = Math.min(r * 0.09, (p.strokeW || 1.3) / (cam || 1));
  g.strokeStyle = rgba(p.strokeHex, p.strokeA == null ? 0.9 : p.strokeA);
  g.stroke();
}

function paintNeck(g, a, b, p, cam) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (!(dist > 1) || dist > a.r + b.r + 16) return;
  const ang = Math.atan2(dy, dx);
  const spread = 0.45;
  const rim = (c, t) => [c.x + Math.cos(t) * c.r, c.y + Math.sin(t) * c.r];
  const a1 = rim(a, ang + spread);
  const a2 = rim(a, ang - spread);
  const b1 = rim(b, ang + Math.PI - spread);
  const b2 = rim(b, ang + Math.PI + spread);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  g.beginPath();
  g.moveTo(a1[0], a1[1]);
  g.quadraticCurveTo(mx, my, b1[0], b1[1]);
  g.moveTo(a2[0], a2[1]);
  g.quadraticCurveTo(mx, my, b2[0], b2[1]);
  g.lineWidth = Math.min(a.r, b.r, (p.strokeW || 1.3) / (cam || 1)) * 0.7;
  g.strokeStyle = rgba(p.strokeHex, (p.strokeA == null ? 0.9 : p.strokeA) * 0.85);
  g.stroke();
}

function paintLabel(g, b, cam, fill, p) {
  if (!b || b.label === false) return;
  const name = b.name || '';
  const amt = b.amount != null ? formatAmount(b.amount) : (b.v != null ? formatAmount(b.v) : '');
  if (!name && !amt) return;
  const k = p.fontK == null ? 0.32 : p.fontK;
  const minPx = p.fontMin == null ? 8 : p.fontMin;
  const maxPx = p.fontMax == null ? 18 : p.fontMax;
  let screenPx = b.r * (cam || 1) * k;
  if (screenPx < minPx) return;
  screenPx = Math.min(maxPx, screenPx);
  let namePx = screenPx / (cam || 1);
  const maxW = b.r * 1.55;
  g.font = '500 ' + namePx + 'px sans-serif';
  while (namePx > minPx / (cam || 1) && g.measureText(name).width > maxW) {
    namePx -= 0.5;
    g.font = '500 ' + namePx + 'px sans-serif';
  }
  const fade = b.fade == null ? 1 : b.fade;
  if (fade <= 0.01) return;
  if (namePx * (cam || 1) < minPx) return;
  let shown = name;
  while (shown.length > 1 && g.measureText(shown).width > maxW) shown = shown.slice(0, -1);
  if (shown !== name && shown.length > 1) shown = shown.slice(0, -1) + '…';
  const amtPx = Math.max(6, namePx * 0.82);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = fill;
  g.font = '500 ' + namePx + 'px sans-serif';
  g.globalAlpha = (p.nameA == null ? 1 : p.nameA) * fade;
  if (shown) g.fillText(shown, b.x, b.y - namePx * 0.52);
  g.font = '500 ' + amtPx + 'px sans-serif';
  g.globalAlpha = (p.amtA == null ? 1 : p.amtA) * fade;
  if (amt) g.fillText(amt, b.x, b.y + amtPx * 0.62);
  g.globalAlpha = 1;
}

function partner(fly, which) {
  if (which === 'src') return { x: fly.sx, y: fly.sy, r: fly.sr, id: fly.srcId, lane: fly.srcLane };
  return { x: fly.dx, y: fly.dy, r: fly.dr, id: fly.dstId, lane: fly.dstLane };
}

/** 画一整帧。view = { scrollDay, ppd, width, height, cam } */
export function drawBubbleStage(g, model, view) {
  const w = view.width;
  const h = view.height;
  const ink = inkOf();
  const light = lum(ink.bg) > 0.6;
  const cam = view.cam || { s: 1, x: 0, y: 0 };
  const lv = view.lv || readLvParams();
  const look = lookOf(lv, light);
  const style = {
    ...lv,
    strokeHex: look.strokeHex,
    fillA: lv.fillA,
    coreR: lv.coreR,
    coreA: lv.coreA,
    coreSoft: lv.coreSoft,
    coreInk: lv.coreInk,
    strokeW: lv.strokeW,
    strokeA: lv.strokeA,
    fontK: lv.fontK,
    fontMin: lv.fontMin,
    fontMax: lv.fontMax,
  };
  const tf = g.getTransform();
  const dpr = tf && tf.a ? tf.a : 1;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  paintField(g, w * dpr, h * dpr, dpr, lv, light);
  g.restore();

  const scene = assembleScene(model, view);
  if (view.fit && !view.cam) view.cam = cameraFit(scene, w, h);
  const use = view.cam || cam;
  g.save();
  g.translate(w / 2 + (use.x || 0), h / 2 + (use.y || 0));
  g.scale(use.s || 1, use.s || 1);
  g.translate(-w / 2, -h / 2);
  const bodies = [...scene.liab, ...scene.asset, ...scene.left, ...scene.right];
  for (const b of bodies) orb(g, b.x, b.y, b.r, colorOf(b.lane), style, use.s || 1);
  for (const fly of scene.flies) orb(g, fly.x, fly.y, fly.r, colorOf(fly.lane), style, use.s || 1);
  for (const fly of scene.flies) {
    if (!fly.neck) continue;
    const end = partner(fly, 'dst');
    if (end.id) paintNeck(g, fly, end, style, use.s || 1);
  }
  for (const b of bodies) paintLabel(g, b, use.s || 1, look.text, style);
  for (const fly of scene.flies) paintLabel(g, fly, use.s || 1, look.text, style);
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
