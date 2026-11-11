// 核心：脉络一帧里每颗泡的位置
/**
 * 把滚动进度铺成一帧气泡。纯函数，不碰 DOM。
 * 层：第一层 · core
 */

import { isDebitType } from './schema.js';
import {
  bagShare, bubbleRadius, clamp01, eventProgress, flyLocal, flyScale, formatAmount,
  packCluster, packEdge, shownBalance, yOfDay,
} from './bubble-motion.js';

function clusterDisc(list) {
  if (!list.length) return null;
  let x = 0;
  let y = 0;
  for (const b of list) { x += b.x; y += b.y; }
  x /= list.length;
  y /= list.length;
  let r = 0;
  for (const b of list) r = Math.max(r, Math.hypot(b.x - x, b.y - y) + b.r);
  return { x, y, r: r + 16 };
}

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

function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** 所有泡互相推开。只有正在并入/分出的那一对允许靠近到能长出颈。 */
function separateBubbles(scene) {
  const body = [];
  const add = (b, pinY) => body.push({
    x: b.x, y: b.y, r: b.r, id: b.id, stick: b.stick || '', pinY, ref: b,
  });
  for (const b of scene.liab) add(b, false);
  for (const b of scene.asset) add(b, false);
  for (const b of scene.left) add(b, true);
  for (const b of scene.right) add(b, true);
  for (const b of scene.flies) add(b, false);
  for (let n = 0; n < 22; n += 1) {
    for (let i = 0; i < body.length; i += 1) {
      for (let j = i + 1; j < body.length; j += 1) {
        const A = body[i];
        const B = body[j];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const stick = A.stick === B.id || B.stick === A.id;
        const min = stick ? (A.r + B.r) * 0.74 : A.r + B.r + 5;
        if (dist >= min) continue;
        const push = (min - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        if (A.pinY) A.x -= ux * push;
        else { A.x -= ux * push; A.y -= uy * push; }
        if (B.pinY) B.x += ux * push;
        else { B.x += ux * push; B.y += uy * push; }
      }
    }
  }
  for (const b of body) {
    if (String(b.id || '').startsWith('L') && b.x - b.r < 56) b.x = b.r + 56;
    b.ref.x = b.x;
    b.ref.y = b.y;
  }
}

/**
 * 整帧画面。飞泡沿自己的日期线横穿，只在并入或离开时才靠向对方。
 */
export function assembleScene(model, view) {
  const width = view.width;
  const height = view.height;
  const ppd = view.ppd;
  const scrollDay = view.scrollDay;
  const cap = Math.max(36, Math.min(56, width * 0.16));
  const fitR = (v, name, labeled) => {
    const floor = labeled ? 22 : 8;
    const base = bubbleRadius(Math.max(0.5, Math.abs(v) || 0), { min: floor, max: cap, knee: 900 });
    if (!labeled) return base;
    const glyphs = Math.max(String(name || '').length, String(formatAmount(v)).length * 0.62);
    return Math.max(base, Math.min(glyphs * 11 / 1.45, width * 0.22));
  };
  const byId = new Map((model.accounts || []).map((a) => [a.id, a]));
  const stocks = [];
  for (const a of model.accounts || []) {
    if (!a.stock) continue;
    const v = shownBalance(model.events, a.id, isDebitType(a.type), scrollDay, ppd, height);
    if (Math.abs(v) < 0.5) continue;
    stocks.push({ id: a.id, name: a.name, r: fitR(v, a.name, true), v, lane: a.lane, kind: a.lane === 2 ? 'liab' : 'asset' });
  }
  const limit = { top: height * 0.25, bottom: height * 0.75 };
  const liab = packCluster(stocks.filter((s) => s.kind === 'liab'), width * 0.30, height * 0.5, limit);
  const asset = packCluster(stocks.filter((s) => s.kind === 'asset'), width * 0.68, height * 0.5, limit);
  const at = new Map();
  for (const p of liab) at.set(p.id, p);
  for (const p of asset) at.set(p.id, p);
  const discs = [clusterDisc(liab), clusterDisc(asset)].filter(Boolean);
  const spot = (id) => {
    const hit = at.get(id);
    if (hit) return hit;
    const acc = byId.get(id);
    const x = acc && acc.lane === 2 ? width * 0.30 : width * 0.68;
    return { x, y: height * 0.5, r: 10, id: '', lane: acc ? acc.lane : 3 };
  };

  const bags = new Map();
  for (const e of model.events || []) {
    if (e.edge !== 'L' && e.edge !== 'R') continue;
    const coord = e.vday == null ? e.day : e.vday;
    const dayP = eventProgress(coord, scrollDay, ppd, height);
    const local = flyLocal(dayP, e.queue || 0, e.queueN || 1);
    if (!(local > 0)) continue;
    const id = e.edge + ':' + e.day + ':' + e.cat;
    let bag = bags.get(id);
    if (!bag) {
      const lane = e.edge === 'R' ? (e.toLane < 0 ? 4 : e.toLane) : (e.fromLane < 0 ? 0 : e.fromLane);
      bag = { id, name: e.cat || '', edge: e.edge, y: yOfDay(coord, scrollDay, ppd, height), lane, amount: 0 };
      bags.set(id, bag);
    }
    bag.amount += e.amount * bagShare(e.kind, local);
  }
  const left = [];
  const right = [];
  for (const bag of bags.values()) {
    if (!(bag.amount >= 0.5)) continue;
    const item = {
      id: bag.id, name: bag.name, lane: bag.lane, y: bag.y,
      amount: bag.amount, r: fitR(bag.amount, bag.name, true),
    };
    if (bag.edge === 'L') left.push(item);
    else right.push(item);
  }
  const packedL = packEdge(left, 64, 1, width);
  const packedR = packEdge(right, width - 10, -1, width);
  const bagAt = new Map();
  for (const b of packedL) bagAt.set(b.id, b);
  for (const b of packedR) bagAt.set(b.id, b);

  const flies = [];
  for (const e of model.events || []) {
    const coord = e.vday == null ? e.day : e.vday;
    const dayP = eventProgress(coord, scrollDay, ppd, height);
    const local = e.edge ? flyLocal(dayP, e.queue || 0, e.queueN || 1) : dayP;
    const scale = flyScale(e.kind, local);
    if (!(scale > 0.04)) continue;
    const y = yOfDay(coord, scrollDay, ppd, height);
    const from = byId.get(e.fromId);
    const to = byId.get(e.toId);
    const name = (e.kind === 'spend' || e.kind === 'charge')
      ? ((to && to.name) || '')
      : ((from && from.name) || (to && to.name) || '');
    const full = fitR(e.amount, name, true);
    const flyR = scale > 0.92 ? full : Math.max(5, full * scale);
    const bag = bagAt.get(e.edge + ':' + e.day + ':' + e.cat);
    const edgePt = bag || (e.edge === 'R'
      ? { x: width - 36, y, r: 22, id: '', lane: e.toLane }
      : { x: 96, y, r: 22, id: '', lane: e.fromLane });
    const toAsset = e.kind === 'spend' || e.kind === 'charge';
    const src = e.edge === 'L' ? edgePt : spot(e.fromId);
    const dst = toAsset ? edgePt : spot(e.toId);
    const t = smooth(clamp01(local));
    const curve = arcPoint(src, dst, discs, t);
    const lane = toAsset ? (to ? to.lane : 4) : (from ? from.lane : (to ? to.lane : 0));
    flies.push({
      id: 'F' + e.key,
      x: Math.max(flyR, Math.min(width - flyR, curve.x)),
      y: Math.max(flyR, Math.min(height - flyR, curve.y)),
      r: flyR,
      lane,
      amount: e.amount,
      name,
      label: scale > 0.92,
      sx: src.x, sy: src.y, sr: src.r, srcId: src.id || '', srcLane: src.lane,
      dx: dst.x, dy: dst.y, dr: dst.r, dstId: dst.id || '', dstLane: dst.lane,
      t,
      meet: t > 0.45 && t <= 0.82 ? (dst.id || '') : '',
      stick: t > 0.82 ? (dst.id || '') : (t < 0.32 ? (src.id || '') : ''),
    });
  }
  const claimed = new Map();
  for (const f of flies) {
    if (!f.stick) continue;
    const prev = claimed.get(f.stick);
    if (!prev || f.t > prev.t) claimed.set(f.stick, f);
  }
  for (const f of flies) {
    if (f.stick && claimed.get(f.stick) !== f) f.stick = '';
  }
  const scene = { liab, asset, left: packedL, right: packedR, flies };
  dropOffstage(scene, height);
  separateBubbles(scene);
  clampOnScreen(scene, width, height);
  separateBubbles(scene);
  clampOnScreen(scene, width, height);
  for (const b of [...scene.liab, ...scene.asset, ...scene.left, ...scene.right]) {
    b.ax = b.x;
    b.ay = b.y;
  }
  leanToMeet(scene);
  pinEnds(scene);
  return scene;
}

function dropOffstage(scene, height) {
  const vis = (b) => b.y > 64 && b.y < height - 18;
  scene.liab = scene.liab.filter(vis);
  scene.asset = scene.asset.filter(vis);
  scene.left = scene.left.filter(vis);
  scene.right = scene.right.filter(vis);
  scene.flies = scene.flies.filter((b) => b.y > 40 && b.y < height - 12);
}

function clampOnScreen(scene, width) {
  const all = [...scene.liab, ...scene.asset, ...scene.left, ...scene.right, ...scene.flies];
  for (const b of all) {
    if (b.y - b.r < 46 && b.x + b.r > width - 122) b.x = Math.min(b.x, width - 122 - b.r);
    const left = String(b.id || '').startsWith('L') ? b.r + 56 : b.r + 2;
    b.x = Math.max(left, Math.min(width - b.r - 2, b.x));
  }
}

/**
 * 静止泡迎向正在靠近的那一颗。偏移量只由这一帧的距离决定，
 * 飞走之后加项是 0，泡回到锚点。倒放经过同一进度，迎的幅度相同。
 */
function leanToMeet(scene) {
  const resting = [...scene.liab, ...scene.asset, ...scene.left, ...scene.right];
  for (const s of resting) {
    let ox = 0;
    let oy = 0;
    let n = 0;
    for (const f of scene.flies) {
      const mine = f.stick === s.id || f.meet === s.id;
      if (!mine) continue;
      const dx = f.x - s.ax;
      const dy = f.y - s.ay;
      const d = Math.hypot(dx, dy) || 1;
      const reach = f.r + s.r + Math.min(f.r, s.r) * 1.15;
      if (d >= reach) continue;
      const k = 1 - d / reach;
      const pull = Math.min(s.r * 0.55, d * 0.42 * k);
      ox += (dx / d) * pull;
      oy += (dy / d) * pull;
      n += 1;
    }
    if (!n) continue;
    s.x = s.ax + ox / n;
    s.y = s.ay + oy / n;
  }
  pinEnds(scene);
}

function pinEnds(scene) {
  const at = new Map();
  for (const s of [...scene.liab, ...scene.asset, ...scene.left, ...scene.right]) at.set(s.id, s);
  for (const f of scene.flies) {
    const src = at.get(f.srcId);
    const dst = at.get(f.dstId);
    if (src) { f.sx = src.x; f.sy = src.y; f.sr = src.r; f.srcLane = src.lane; }
    if (dst) { f.dx = dst.x; f.dy = dst.y; f.dr = dst.r; f.dstLane = dst.lane; }
  }
}
