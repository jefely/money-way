// 核心：脉络一帧里每颗泡的位置
/**
 * 把滚动进度铺成一帧气泡。纯函数，不碰 DOM。
 * 层：第一层 · core
 */

import { isDebitType } from './schema.js';
import {
  bubbleRadius, clamp01, eventProgress, flowFractions, packCluster, packEdge,
  shownBalance, yOfDay,
} from './bubble-motion.js';

const INCOME = '收入类';
const EQUITY = '权益类';
const EXPENSE = '费用类';
const COST = '成本类';

function lerp(a, b, t) {
  return a + (b - a) * t;
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
  for (let n = 0; n < 8; n += 1) {
    for (let i = 0; i < body.length; i += 1) {
      for (let j = i + 1; j < body.length; j += 1) {
        const A = body[i];
        const B = body[j];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const stick = A.stick === B.id || B.stick === A.id;
        const min = stick ? (A.r + B.r) * 0.8 : A.r + B.r + 2;
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
    if (String(b.id || '').startsWith('L') && b.x - b.r < 70) b.x = b.r + 70;
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
  const radius = (v) => bubbleRadius(v, { max: Math.max(16, Math.min(48, width * 0.14)) });
  const byId = new Map((model.accounts || []).map((a) => [a.id, a]));
  const stocks = [];
  for (const a of model.accounts || []) {
    if (!a.stock) continue;
    const v = shownBalance(model.events, a.id, isDebitType(a.type), scrollDay, ppd, height);
    if (Math.abs(v) < 0.5) continue;
    stocks.push({ id: a.id, name: a.name, r: radius(v), v, lane: a.lane, kind: a.lane === 2 ? 'liab' : 'asset' });
  }
  const limit = { top: height * 0.25, bottom: height * 0.75 };
  const liab = packCluster(stocks.filter((s) => s.kind === 'liab'), width * 0.30, height * 0.5, limit);
  const asset = packCluster(stocks.filter((s) => s.kind === 'asset'), width * 0.68, height * 0.5, limit);
  const at = new Map();
  for (const p of liab) at.set(p.id, p);
  for (const p of asset) at.set(p.id, p);
  const spot = (id) => {
    const hit = at.get(id);
    if (hit) return hit;
    const acc = byId.get(id);
    const x = acc && acc.lane === 2 ? width * 0.30 : width * 0.68;
    return { x, y: height * 0.5, r: 10 };
  };

  const left = [];
  const right = [];
  const flies = [];
  for (const e of model.events || []) {
    const coord = e.vday == null ? e.day : e.vday;
    const p = eventProgress(coord, scrollDay, ppd, height);
    if (!(p > 0)) continue;
    const y = yOfDay(coord, scrollDay, ppd, height);
    const fr = flowFractions(e.kind, p);
    const from = byId.get(e.fromId);
    const to = byId.get(e.toId);
    const name = (from && from.name) || (to && to.name) || '';
    if (fr.marker > 0.04 && (e.fromType === INCOME || e.fromType === EQUITY)) {
      left.push({
        id: 'L' + e.key, name, lane: from ? from.lane : 0,
        r: radius(e.amount * fr.marker), y, amount: e.amount,
      });
    }
    if (fr.marker > 0.04 && (e.toType === EXPENSE || e.toType === COST)) {
      right.push({
        id: 'R' + e.key, name: to ? to.name : name, lane: to ? to.lane : 4,
        r: radius(e.amount * fr.marker), y, amount: e.amount,
      });
    }
    if (fr.fly > 0.04) {
      const src = e.kind === 'inflow' ? { x: 8, y, r: 8 } : spot(e.fromId);
      const dst = (e.kind === 'spend' || e.kind === 'charge')
        ? { x: width - 8, y, r: 8 }
        : spot(e.toId);
      const t = clamp01(fr.flyT);
      const flyR = radius(e.amount * fr.fly);
      const merge = e.kind === 'inflow' || e.kind === 'borrow' || e.kind === 'repay' || e.kind === 'transfer';
      const along = merge ? smooth((t - 0.62) / 0.38) : smooth(Math.min(1, t / 0.3));
      const yy = merge ? lerp(y, dst.y, along) : lerp(src.y, y, along);
      const xx = lerp(src.x, dst.x, t);
      flies.push({
        id: 'F' + e.key,
        x: Math.max(flyR, Math.min(width - flyR, xx)),
        y: Math.max(flyR, Math.min(height - flyR, yy)),
        r: flyR,
        lane: from ? from.lane : (to ? to.lane : 0),
        toLane: to ? to.lane : 0,
        amount: e.amount * fr.fly,
        name,
        sx: src.x, sy: src.y, sr: src.r,
        dx: dst.x, dy: dst.y, dr: dst.r,
        srcId: e.kind === 'inflow' ? '' : e.fromId,
        dstId: (e.kind === 'spend' || e.kind === 'charge') ? '' : e.toId,
        meet: (e.fromType === INCOME || e.fromType === EQUITY) && t < 0.5 ? ('L' + e.key) : '',
        t,
        stick: merge ? (t > 0.55 ? e.toId : '') : (t < 0.4 ? e.fromId : ''),
      });
    }
  }
  const scene = {
    liab, asset,
    left: packEdge(left, 72, 1, width),
    right: packEdge(right, width - 6, -1, width),
    flies,
  };
  for (const b of [...scene.liab, ...scene.asset, ...scene.left, ...scene.right]) {
    b.ax = b.x;
    b.ay = b.y;
  }
  leanToMeet(scene);
  separateBubbles(scene);
  return scene;
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
  const at = new Map();
  for (const s of [...scene.liab, ...scene.asset]) at.set(s.id, s);
  for (const f of scene.flies) {
    const src = at.get(f.srcId);
    const dst = at.get(f.dstId);
    if (src) { f.sx = src.x; f.sy = src.y; f.sr = src.r; }
    if (dst) { f.dx = dst.x; f.dy = dst.y; f.dr = dst.r; }
  }
}
