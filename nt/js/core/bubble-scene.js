// 核心：脉络一帧里每颗泡的位置
/**
 * 把滚动进度铺成一帧气泡。纯函数，不碰 DOM。
 * 层：第一层 · core
 */

import { isDebitType } from './schema.js';
import {
  bagShare, bubbleRadius, clamp01, eventProgress, flyLocal, flyScale, textFade,
  packCluster, packEdge, shownBalance, yOfDay,
} from './bubble-motion.js';
import { settleColumns } from './bubble-columns.js';

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
    x: b.x, y: b.y, r: b.r, id: b.id, stick: b.stick || '', pinY, axisX: b.axisX, ref: b,
  });
  for (const b of scene.liab) add(b, false);
  for (const b of scene.asset) add(b, false);
  for (const b of scene.left) add(b, true);
  for (const b of scene.right) add(b, true);
  for (let n = 0; n < 36; n += 1) {
    for (let i = 0; i < body.length; i += 1) {
      for (let j = i + 1; j < body.length; j += 1) {
        const A = body[i];
        const B = body[j];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const gap = Math.max(0, scene.gap == null ? 4 : scene.gap) * (scene.repel == null ? 1 : scene.repel);
        const min = A.r + B.r + gap;
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
    if (n < 24) {
      for (const b of body) {
        if (b.axisX == null) continue;
        b.x += (b.axisX - b.x) * 0.34;
      }
    }
  }
  for (const b of body) {
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
  const zone = view.zone;
  const win = view.windowPx;
  const gap = Number(view.dayGap) || 0;
  const fitR = (v) => bubbleRadius(v, { mults: view.mults });
  const coordOf = (e) => (e.vday == null ? e.day : e.vday) + (e.edge && gap ? (e.queue || 0) * gap : 0);
  const prog = (e) => eventProgress(coordOf(e), scrollDay, ppd, height, zone, win);
  const byId = new Map((model.accounts || []).map((a) => [a.id, a]));
  const stocks = [];
  for (const a of model.accounts || []) {
    if (!a.stock) continue;
    const v = shownBalance(model.events, a.id, isDebitType(a.type), scrollDay, ppd, height, zone, gap, win);
    if (Math.abs(v) < 0.5) continue;
    stocks.push({ id: a.id, name: a.name, r: fitR(v), v, lane: a.lane, kind: a.lane === 2 ? 'liab' : 'asset' });
  }
  const limit = { top: height * 0.1, bottom: height * 0.9 };
  const pct = (n, d) => width * ((n == null ? d : n) / 100);
  const xLeft = pct(view.insetL, 8);
  const xRight = width - pct(view.insetR, 8);
  const xLiab = pct(view.xLiab, 35);
  const xAsset = pct(view.xAsset, 65);
  const liab = packCluster(stocks.filter((s) => s.kind === 'liab'), xLiab, height * 0.5, limit);
  const asset = packCluster(stocks.filter((s) => s.kind === 'asset'), xAsset, height * 0.5, limit);
  for (const b of liab) b.axisX = xLiab;
  for (const b of asset) b.axisX = xAsset;
  const at = new Map();
  for (const p of liab) at.set(p.id, p);
  for (const p of asset) at.set(p.id, p);
  const spot = (id) => {
    const hit = at.get(id);
    if (hit) return hit;
    const acc = byId.get(id);
    const x = acc && acc.lane === 2 ? xLiab : xAsset;
    return { x, y: height * 0.5, r: 10, id: '', lane: acc ? acc.lane : 3 };
  };

  const bags = new Map();
  for (const e of model.events || []) {
    if (e.edge !== 'L' && e.edge !== 'R') continue;
    const dayP = prog(e);
    const local = gap > 0 ? dayP : flyLocal(dayP, e.queue || 0, e.queueN || 1);
    if (!(local > 0)) continue;
    const id = e.edge + ':' + e.day + ':' + e.cat;
    let bag = bags.get(id);
    if (!bag) {
      const lane = e.edge === 'R' ? (e.toLane < 0 ? 4 : e.toLane) : (e.fromLane < 0 ? 0 : e.fromLane);
      const y0 = yOfDay(e.vday == null ? e.day : e.vday, scrollDay, ppd, height);
      bag = { id, name: e.cat || '', edge: e.edge, lane, amount: 0, done: 0, y: y0 };
      bags.set(id, bag);
    }
    bag.amount += e.amount * bagShare(e.kind, local);
    if (local >= 1) bag.done += e.amount;
  }
  const left = [];
  const right = [];
  for (const bag of bags.values()) {
    if (!(bag.amount >= 0.5)) continue;
    const item = {
      id: bag.id, name: bag.name, lane: bag.lane, y: bag.y,
      amount: bag.done >= 0.5 ? bag.done : null, r: fitR(bag.amount),
    };
    if (bag.edge === 'L') left.push(item);
    else right.push(item);
  }
  const packedL = packEdge(left, xLeft, 1, width);
  const packedR = packEdge(right, xRight, -1, width);
  for (const b of packedL) b.axisX = xLeft;
  for (const b of packedR) b.axisX = xRight;
  const bagAt = new Map();
  for (const b of packedL) bagAt.set(b.id, b);
  for (const b of packedR) bagAt.set(b.id, b);

  const flies = [];
  for (const e of model.events || []) {
    const dayP = prog(e);
    const local = e.edge && !(gap > 0) ? flyLocal(dayP, e.queue || 0, e.queueN || 1) : dayP;
    const y = yOfDay(coordOf(e), scrollDay, ppd, height);
    if (y < -40 || y > height + 40) continue;
    const arriving = local <= 0 && local > -0.22;
    const scale = arriving ? 1 : flyScale(e.kind, local);
    if (!(scale > 0.04)) continue;
    const from = byId.get(e.fromId);
    const to = byId.get(e.toId);
    const name = (e.kind === 'spend' || e.kind === 'charge')
      ? ((to && to.name) || '')
      : ((from && from.name) || (to && to.name) || '');
    const full = fitR(e.amount);
    const flyR = scale > 0.92 ? full : Math.max(3, full * scale);
    const bag = bagAt.get(e.edge + ':' + e.day + ':' + e.cat);
    const edgePt = bag || (e.edge === 'R'
      ? { x: width - 28, y, r: 8, id: '', lane: e.toLane }
      : { x: 84, y, r: 8, id: '', lane: e.fromLane });
    const toAsset = e.kind === 'spend' || e.kind === 'charge';
    const src = e.edge === 'L' ? edgePt : spot(e.fromId);
    const dst = toAsset ? edgePt : spot(e.toId);
    const t = arriving ? 0 : smooth(clamp01(local));
    const onRight = e.edge === 'R';
    const onLeft = e.edge === 'L';
    const x = onRight ? xRight : onLeft ? xLeft : src.x + (dst.x - src.x) * t;
    const lane = toAsset ? (to ? to.lane : 4) : (from ? from.lane : (to ? to.lane : 0));
    flies.push({
      id: 'F' + e.key,
      x,
      y,
      axisX: onRight ? xRight : onLeft ? xLeft : null,
      homeX: x,
      homeY: y,
      r: flyR,
      lane,
      amount: e.amount,
      name,
      fade: textFade(arriving ? 0 : local, view.fade == null ? 0.18 : view.fade),
      sx: src.x, sy: src.y, sr: src.r, srcId: src.id || '', srcLane: src.lane,
      dx: dst.x, dy: dst.y, dr: dst.r, dstId: dst.id || '', dstLane: dst.lane,
      t,
      meet: t > 0.45 && t <= 0.82 ? (dst.id || '') : '',
      neck: !arriving && t > 0.55 && t < 0.88,
      stick: '',
    });
  }
  const scene = {
    liab, asset, left: packedL, right: packedR, flies,
    gap: view.gap, repel: view.repel,
    axes: [xLeft, xLiab, xAsset, xRight],
  };
  dropOffstage(scene, height);
  separateBubbles(scene);
  separateBubbles(scene);
  for (const b of [...scene.liab, ...scene.asset, ...scene.left, ...scene.right]) {
    b.ax = b.x;
    b.ay = b.y;
  }
  leanToMeet(scene);
  pinEnds(scene);
  settleColumns(scene, width);
  for (const f of scene.flies) {
    if (f.homeX == null) continue;
    f.x = f.homeX;
    f.y = f.homeY;
  }
  return scene;
}

function dropOffstage(scene, height) {
  const vis = (b) => b.y > -12 && b.y < height + 12;
  scene.liab = scene.liab.filter(vis); scene.asset = scene.asset.filter(vis);
  scene.left = scene.left.filter(vis); scene.right = scene.right.filter(vis);
  scene.flies = scene.flies.filter((b) => b.y > -20 && b.y < height + 20);
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

/** 把这一帧收进屏幕。不放大超过 1，内容超出时缩小，中心对齐。 */
export function cameraFit(scene, width, height) {
  const all = [...scene.liab, ...scene.asset, ...scene.left, ...scene.right, ...scene.flies];
  if (!all.length || !(width > 0) || !(height > 0)) return { s: 1, x: 0, y: 0 };
  const padX = 16;
  const padY = 28;
  let fit = 1;
  const halfW = width / 2 - padX;
  const halfH = height / 2 - padY;
  for (const b of all) {
    const right = b.x + b.r - width / 2;
    const left = width / 2 - (b.x - b.r);
    const bot = b.y + b.r - height / 2;
    const top = height / 2 - (b.y - b.r);
    if (right > 1) fit = Math.min(fit, halfW / right);
    if (left > 1) fit = Math.min(fit, halfW / left);
    if (bot > 1) fit = Math.min(fit, halfH / bot);
    if (top > 1) fit = Math.min(fit, halfH / top);
  }
  return { s: Math.max(0.02, Math.min(1, fit)), x: 0, y: 0 };
}
