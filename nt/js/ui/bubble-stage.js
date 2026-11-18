// 界面：脉络 tab → 气泡画布
/**
 * 把 assembleScene 的结果画到画布上。不算钱、不算进度。
 * 层：第五层 · UI
 */

import { formatAmount } from '../core/bubble-motion.js';
import { unionOutline } from '../core/bubble-union.js';
import { assembleScene, cameraFit } from '../core/bubble-scene.js';
import { grainCanvas, readLvParams } from './lv-params.js';
import { rulerMarks } from '../core/lifevein-model.js';
import { rulerFromPlay, screenDayMarks } from '../core/bubble-play.js';
import {
  bodyDiscs, circleAdd, labelLayout, paintInnerGlow, paintOuterGlow, unionAdd,
} from './bubble-ink.js';

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
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  if (preset) {
    const grd = g.createLinearGradient(0, 0, 0, dh);
    grd.addColorStop(0, preset.a);
    grd.addColorStop(0.5, preset.b);
    grd.addColorStop(1, preset.c);
    g.fillStyle = grd;
    g.fillRect(0, 0, dw, dh);
    const strength = p.bg == null ? 1 : p.bg;
    if (strength < 0.999) {
      g.globalAlpha = 1 - strength;
      g.fillStyle = light ? '#f6f3f0' : '#100e14';
      g.fillRect(0, 0, dw, dh);
      g.globalAlpha = 1;
    }
  } else {
    g.fillStyle = light ? '#f7f4f2' : '#100e14';
    g.fillRect(0, 0, dw, dh);
  }
  const grain = p.grain == null ? 0.04 : p.grain;
  if (grain > 0.004 && typeof document !== 'undefined') {
    const pat = g.createPattern(grainCanvas(dpr, p), 'repeat');
    if (pat) {
      g.imageSmoothingEnabled = false;
      g.globalAlpha = grain;
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

function fillHexOf(hex, p) {
  const mode = p.fillMode || 'white';
  if (mode === 'lane') return hex;
  if (mode === 'stroke') return p.strokeHex || '#ffffff';
  return '#ffffff';
}

function paintCore(g, x, y, r, hex, p) {
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
}

function strokeOf(g, r, p, cam) {
  g.lineWidth = Math.min(r * 0.09, (p.strokeW || 1.3) / (cam || 1));
  g.strokeStyle = rgba(p.strokeHex, p.strokeA == null ? 0.9 : p.strokeA);
  g.stroke();
}

/** 单独一颗泡。外晕在轮廓外，内发光被圆裁住，中心渐变仍是另一层。 */
function orb(g, x, y, r, hex, p, cam) {
  const add = circleAdd(x, y, r);
  paintOuterGlow(g, add, [{ x, y, r }], hex, p);
  const fillA = p.fillA == null ? 0.05 : p.fillA;
  if (fillA > 0.004) {
    g.beginPath();
    add(g);
    g.fillStyle = rgba(fillHexOf(hex, p), fillA);
    g.fill();
  }
  paintInnerGlow(g, add, [{ x, y, r }], hex, p);
  paintCore(g, x, y, r, hex, p);
  g.beginPath(); add(g); strokeOf(g, r, p, cam);
}

/** 合并轮廓：发光跟着真实外轮廓裁，不使用外接矩形。 */
export function paintUnion(g, parts, hex, p, cam, capR, bodies) {
  if (!parts || !parts.length) return;
  const add = unionAdd(parts);
  const ref = capR || parts[0].r;
  const discs = bodyDiscs(parts, bodies);
  paintOuterGlow(g, add, discs, hex, p);
  g.beginPath();
  add(g);
  const fillA = p.fillA == null ? 0.05 : p.fillA;
  if (fillA > 0.004) {
    g.fillStyle = rgba(fillHexOf(hex, p), fillA);
    g.fill();
  }
  paintInnerGlow(g, add, discs, hex, p);
  g.beginPath(); add(g); strokeOf(g, ref, p, cam);
}

function paintLabel(g, b, cam, fill, p) {
  if (!b || b.label === false) return;
  const name = b.name || '';
  const amt = b.amount != null ? formatAmount(b.amount) : (b.v != null ? formatAmount(b.v) : '');
  if (!name && !amt) return;
  const fade = b.fade == null ? 1 : b.fade;
  if (fade <= 0.01) return;
  const lay = labelLayout(b.labelR || b.r, cam || 1, p, name, amt, (text, px) => {
    g.font = '500 ' + px + 'px sans-serif';
    return g.measureText(text).width;
  });
  if (!(lay.namePx > 0) && !(lay.amtPx > 0)) return;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = fill;
  if (lay.name && lay.namePx > 0) {
    g.font = '500 ' + lay.namePx + 'px sans-serif';
    g.globalAlpha = (p.nameA == null ? 1 : p.nameA) * fade;
    g.fillText(lay.name, b.x, b.y - lay.namePx * 0.55);
  }
  if (amt && lay.amtPx > 0) {
    g.font = '500 ' + lay.amtPx + 'px sans-serif';
    g.globalAlpha = (p.amtA == null ? 1 : p.amtA) * fade;
    g.fillText(amt, b.x, b.y + lay.amtPx * 0.62);
  }
  g.globalAlpha = 1;
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
  const style = { ...lv, strokeHex: look.strokeHex };
  const tf = g.getTransform();
  const dpr = tf && tf.a ? tf.a : 1;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  paintField(g, w * dpr, h * dpr, dpr, lv, light);
  g.restore();

  let use = view.cam || cam;
  if (view.fit && !view.cam) {
    const preview = assembleScene(model, { ...view, cam: { s: 1, x: 0, y: 0 } });
    use = cameraFit(preview, w, h);
    view.cam = use;
  }
  const scene = assembleScene(model, { ...view, cam: use });
  const user = view.viewZoom || { s: 1, x: 0, y: 0 };
  g.save();
  g.translate(w / 2 + (user.x || 0), h / 2 + (user.y || 0));
  g.scale(user.s || 1, user.s || 1);
  g.translate(-w / 2, -h / 2);
  g.translate(w / 2 + (use.x || 0), h / 2 + (use.y || 0));
  g.scale(use.s || 1, use.s || 1);
  g.translate(-w / 2, -h / 2);
  const bodies = [...scene.liab, ...(scene.equity || []), ...scene.asset, ...scene.left, ...scene.right];
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const covered = new Set();
  const joins = [];
  const gapOf = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  for (const fly of scene.flies) {
    const dst = byId.get(fly.dstId);
    const src = byId.get(fly.srcId);
    const foreign = bodies.some((b) => b.id !== fly.srcId && b.id !== fly.dstId && gapOf(fly, b) < 2);
    const gs = src ? gapOf(fly, src) : 99;
    const gd = dst ? gapOf(fly, dst) : 99;
    const reach = (node) => node ? Math.min(fly.r, node.r) * 0.85 : 0;
    const both = gs < 0 && gd < 0;
    const end = fly.melt > 0 && dst ? dst
      : foreign || both ? null
        : (fly.t < 0.5 && src && gs < reach(src) && gs <= gd) ? src
          : (fly.t >= 0.5 && dst && gd < reach(dst) && gd <= gs) ? dst : null;
    if (!end) continue;
    const parts = unionOutline(fly, end);
    if (!parts) continue;
    joins.push({ fly, dst: end, parts });
    covered.add(fly.id); covered.add(end.id);
  }
  const camS = use.s || 1;
  for (const b of bodies) if (!covered.has(b.id)) orb(g, b.x, b.y, b.r, colorOf(b.lane), style, camS);
  for (const fly of scene.flies) if (!covered.has(fly.id) && fly.r > 1) orb(g, fly.x, fly.y, fly.r, colorOf(fly.lane), style, camS);
  const cored = new Set();
  for (const j of joins) {
    paintUnion(g, j.parts, colorOf(j.dst.lane), style, camS, Math.min(j.fly.r, j.dst.r), [j.fly, j.dst]);
    if (!cored.has(j.dst.id)) { paintCore(g, j.dst.x, j.dst.y, j.dst.r, colorOf(j.dst.lane), style); cored.add(j.dst.id); }
    paintCore(g, j.fly.x, j.fly.y, j.fly.r, colorOf(j.fly.lane), style);
  }
  for (const b of bodies) paintLabel(g, b, use.s || 1, look.text, style);
  for (const fly of scene.flies) paintLabel(g, fly, use.s || 1, look.text, style);
  g.restore();

  g.fillStyle = ink.muted;
  g.font = '10px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('负债/权益', w * 0.14, h - 10); g.fillText('资产', w * 0.5, h - 10); g.fillText('费用/成本', w * 0.86, h - 10);
  paintRuler(g, model, view, ink, use);
  paintMonth(g, ink, view.month);
  return scene;
}

function paintRuler(g, model, view, ink, cam) {
  if (!model || !model.startIso || !(view.ppd > 0)) return;
  const h = view.height;
  const lock = Number(view.daysPer) > 0;
  const s = lock ? 1 : (cam && cam.s > 0 ? cam.s : 1);
  const py = lock ? 0 : ((cam && cam.y) || 0);
  const vAt = (y) => view.scrollDay + (y - h / 2 - py) / (view.ppd * s);
  const px = view.ppd * s;
  const marks = lock
    ? screenDayMarks(model, view.scrollDay, view.daysPer, view.ppd)
    : (view.playMarks && view.playMarks.length)
      ? rulerFromPlay(model, view.playMarks, vAt(0), vAt(h), px)
      : rulerMarks(model, vAt(0), vAt(h), px);
  g.strokeStyle = ink.muted;
  g.fillStyle = ink.muted;
  g.lineWidth = 1;
  g.font = '10px sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  for (const m of marks) {
    const y = h / 2 + (m.vday - view.scrollDay) * view.ppd * s + py;
    if (y < 4 || y > h - 4) continue;
    g.beginPath();
    g.moveTo(28, y);
    g.lineTo(m.span ? 38 : 42, y);
    g.stroke();
    g.fillText(m.label, 46, y);
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
