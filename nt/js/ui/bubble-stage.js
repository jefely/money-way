// 界面：脉络 tab → 气泡画布
/**
 * 把 assembleScene 的结果画到画布上。不算钱、不算进度。
 * 层：第五层 · UI
 */

import { tangentBridge, formatAmount } from '../core/bubble-motion.js';
import { assembleScene } from '../core/bubble-scene.js';
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

function bubble(g, x, y, r, hex) {
  const [R, G, B] = rgb(hex);
  const shade = g.createRadialGradient(x - r * 0.34, y - r * 0.4, r * 0.04, x, y, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.82)');
  shade.addColorStop(0.2, 'rgba(' + R + ',' + G + ',' + B + ',0.42)');
  shade.addColorStop(0.62, 'rgba(' + R + ',' + G + ',' + B + ',0.16)');
  shade.addColorStop(0.84, 'rgba(' + R + ',' + G + ',' + B + ',0.48)');
  shade.addColorStop(1, 'rgba(255,255,255,0.62)');
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = shade;
  g.fill();
  g.beginPath();
  g.ellipse(x - r * 0.28, y - r * 0.34, r * 0.2, r * 0.1, -0.7, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fill();
}

function neck(g, fly) {
  const pairs = [
    [{ x: fly.x, y: fly.y, r: fly.r }, { x: fly.sx, y: fly.sy, r: fly.sr }, colorOf(fly.lane), colorOf(fly.lane)],
    [{ x: fly.x, y: fly.y, r: fly.r }, { x: fly.dx, y: fly.dy, r: fly.dr }, colorOf(fly.lane), colorOf(fly.toLane)],
  ];
  for (const [a, b, ca, cb] of pairs) {
    if (!(b.r > 3) || !(a.r > 2)) continue;
    const bridge = tangentBridge(a, b);
    if (!bridge) continue;
    const grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, ca);
    grad.addColorStop(1, cb);
    g.beginPath();
    const arc0 = bridge.arcs[0];
    const arc1 = bridge.arcs[1];
    g.arc(arc0.x, arc0.y, arc0.r, arc0.a0, arc0.a1);
    g.arc(arc1.x, arc1.y, arc1.r, arc1.a1, arc1.a0, true);
    g.closePath();
    g.fillStyle = grad;
    g.globalAlpha = 0.72;
    g.fill();
    g.globalAlpha = 1;
  }
}

function tag(g, b, text, ink) {
  g.font = '11px sans-serif';
  const tw = Math.max(28, g.measureText(text).width + 12);
  const x = b.x - tw / 2;
  const y = b.y + b.r + 8;
  g.strokeStyle = ink.muted;
  g.beginPath();
  g.moveTo(b.x, b.y + b.r);
  g.lineTo(b.x, y);
  g.stroke();
  g.fillStyle = ink.bg;
  g.globalAlpha = 0.9;
  g.fillRect(x, y, tw, 18);
  g.globalAlpha = 1;
  g.fillStyle = ink.text;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, b.x, y + 9);
}

function label(g, b, ink) {
  const name = b.name || '';
  const amt = b.amount != null ? formatAmount(b.amount) : (b.v != null ? formatAmount(b.v) : '');
  if (!name && !amt) return;
  const maxW = b.r * 1.45;
  let size = Math.min(15, Math.max(8, b.r * 0.34));
  const fit = (s) => {
    g.font = s + 'px sans-serif';
    const nw = name ? g.measureText(name).width : 0;
    const aw = amt ? g.measureText(amt).width : 0;
    return nw <= maxW && aw <= maxW && s * 2.4 <= b.r * 1.35;
  };
  while (size > 8 && !fit(size)) size -= 0.5;
  if (!fit(size)) {
    tag(g, b, (name + ' ' + amt).trim(), ink);
    return;
  }
  g.fillStyle = ink.text;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 ' + size + 'px sans-serif';
  if (name) g.fillText(name, b.x, b.y - size * 0.55);
  g.font = size + 'px sans-serif';
  if (amt) g.fillText(amt, b.x, b.y + size * 0.6);
}

/** 画一整帧。view = { scrollDay, ppd, width, height } */
export function drawBubbleStage(g, model, view) {
  const w = view.width;
  const h = view.height;
  const ink = inkOf();
  g.clearRect(0, 0, w, h);

  const scene = assembleScene(model, view);
  for (const fly of scene.flies) neck(g, fly);
  for (const b of [...scene.flies, ...scene.left, ...scene.right, ...scene.liab, ...scene.asset]) {
    bubble(g, b.x, b.y, b.r, colorOf(b.lane));
    label(g, b, ink);
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
