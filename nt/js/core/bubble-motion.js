// 核心：脉络气泡的滚动进度、分组与形变
/**
 * 脉络页的气泡运动（纯函数）。
 * 层：第一层 · core
 *
 * 画面上的每一个数都只由滚动位置决定：同一进度正放和倒放得到同一组坐标。
 * 弹力不做逐帧积分（那会让倒放滞后），而是写进进度曲线和固定次数的松弛里。
 */

import { isDebitType } from './schema.js';

const INCOME = '收入类';
const EQUITY = '权益类';
const ASSET = '资产类';
const LIABILITY = '负债类';
const EXPENSE = '费用类';
const COST = '成本类';

export function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function smooth(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * 端点精确落在 0 和 1，中途略微过冲再收回。
 * 过冲只取决于进度，倒放会把这一下原样倒回去。
 */
export function elastic(p) {
  const x = clamp01(p);
  const base = x * x * (3 - 2 * x);
  const bounce = Math.sin(x * Math.PI) * Math.sin(x * Math.PI * 2) * 0.08;
  return base + bounce;
}

/** 事件日期线在屏幕上的 y。过去在上，未来在下，scrollDay 对准屏幕正中。 */
export function yOfDay(day, scrollDay, ppd, height) {
  return height * 0.5 + (day - scrollDay) * ppd;
}

/**
 * 动画进度。日期线在下中带下沿（0.75H）时为 0，上中带上沿（0.25H）时为 1。
 * 不钳制：小于 0 还没开始，大于 1 已经演完。
 */
export function eventProgress(day, scrollDay, ppd, height) {
  if (!(height > 0)) return 0;
  const y = yOfDay(day, scrollDay, ppd, height);
  return (height * 0.75 - y) / (height * 0.5);
}

/** 半径：金额的平方根，膝部之后不再线性涨，并夹在上下限里。面积大致跟金额走。 */
export function bubbleRadius(amount, opt) {
  const o = opt || {};
  const min = o.min == null ? 8 : o.min;
  const max = o.max == null ? 52 : o.max;
  const knee = o.knee == null ? 6000 : o.knee;
  const v = Math.abs(Number(amount) || 0);
  if (v < 0.5) return 2;
  const t = Math.sqrt(v / (v + knee));
  return min + (max - min) * t;
}

/** 这笔钱在四列之间怎么走。 */
export function classifyFlow(fromType, toType) {
  const fromIn = fromType === INCOME || fromType === EQUITY;
  const toOut = toType === EXPENSE || toType === COST;
  if (fromIn && toType === ASSET) return 'inflow';
  if (fromType === LIABILITY && toType === ASSET) return 'borrow';
  if (fromType === ASSET && toOut) return 'spend';
  if (fromType === LIABILITY && toOut) return 'charge';
  if (fromType === ASSET && toType === LIABILITY) return 'repay';
  if (fromType === ASSET && toType === ASSET) return 'transfer';
  if (fromType === LIABILITY && toType === LIABILITY) return 'transfer';
  if (fromIn) return 'inflow';
  if (toOut) return 'spend';
  return 'other';
}

/**
 * 一笔流水在进度 p 上的分配。
 * fly：正在飞的那一颗占金额的比例。src / dst：两端存量已经结算的比例。
 * park：飞完之后留在日期线上的记录。
 */
export function flowFractions(kind, p) {
  if (!(p > 0)) return { fly: 0, flyT: 0, src: 0, dst: 0, marker: 0 };
  const done = p >= 1;
  if (kind === 'inflow') {
    const absorb = done ? 1 : smooth((p - 0.5) / 0.5);
    return { fly: done ? 0 : 1 - absorb, flyT: elastic(p), src: 0, dst: done ? 1 : absorb, marker: done ? 1 : smooth(p) };
  }
  if (kind === 'borrow') {
    const grow = done ? 1 : smooth(p / 0.42);
    const absorb = done ? 1 : smooth((p - 0.4) / 0.6);
    return {
      fly: done ? 0 : grow * (1 - absorb),
      flyT: elastic(clamp01((p - 0.28) / 0.72)),
      src: done ? 1 : Math.max(grow, absorb),
      dst: done ? 1 : absorb,
      marker: 0,
    };
  }
  if (kind === 'spend' || kind === 'charge') {
    const leave = done ? 1 : smooth(p / 0.62);
    return { fly: done ? 0 : leave, flyT: elastic(p), src: done ? 1 : leave, dst: 0, marker: done ? 1 : 0 };
  }
  if (kind === 'repay') {
    const leave = done ? 1 : smooth(p / 0.55);
    const absorb = done ? 1 : smooth((p - 0.38) / 0.62);
    return {
      fly: done ? 0 : leave * (1 - absorb),
      flyT: elastic(p),
      src: done ? 1 : Math.max(leave, absorb),
      dst: done ? 1 : absorb,
      marker: 0,
    };
  }
  const absorb = done ? 1 : smooth((p - 0.45) / 0.55);
  return { fly: done ? 0 : 1 - absorb, flyT: elastic(p), src: done ? 1 : absorb, dst: done ? 1 : absorb, marker: 0 };
}

/** 滚动所对应的存量。规则与每日余额相同，只是每笔按进度比例计入。 */
export function shownBalance(events, accountId, debit, scrollDay, ppd, height) {
  let run = 0;
  for (const e of events) {
    if (e.toId !== accountId && e.fromId !== accountId) continue;
    const fr = flowFractions(e.kind, eventProgress(e.day, scrollDay, ppd, height));
    if (e.toId === accountId && fr.dst) run += debit ? e.amount * fr.dst : -e.amount * fr.dst;
    if (e.fromId === accountId && fr.src) run += debit ? -e.amount * fr.src : e.amount * fr.src;
  }
  return run;
}

/**
 * 两圆之间的粘连颈。贴得越近颈越粗，拉开到阈值就断开。
 * 返回两侧的张角；画的时候用张角在圆周上取四个点。
 */
export function gooAngles(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  const reach = ar + br + Math.min(ar, br) * 0.9;
  if (!(d > 1) || d >= reach || d <= Math.abs(ar - br) + 0.75) return null;
  const span = reach - Math.abs(ar - br);
  const closeness = span > 0 ? 1 - (d - Math.abs(ar - br)) / span : 0;
  const spread = 0.22 + 0.95 * closeness;
  return {
    angle: Math.atan2(dy, dx),
    ha: Math.min(1.2, spread * (br / (ar + br)) * 1.6),
    hb: Math.min(1.2, spread * (ar / (ar + br)) * 1.6),
    closeness,
    d,
  };
}

function pushApart(pts) {
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      const d = Math.hypot(dx, dy) || 0.001;
      const min = pts[i].r + pts[j].r;
      if (d >= min) continue;
      const push = (min - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      pts[i].x -= ux * push;
      pts[i].y -= uy * push;
      pts[j].x += ux * push;
      pts[j].y += uy * push;
    }
  }
}

/**
 * 一组气泡挤在锚点上：相斥到刚好相切，又被弹簧拉回轴线。
 * 每次都从同一初值出发，迭代次数固定，所以和上一帧无关。
 */
export function packCluster(items, anchorX, anchorY, limit) {
  const pts = items.map((it, i) => {
    const ang = i * 2.399963;
    const rad = 4 + it.r * 0.15 * Math.sqrt(i);
    return {
      id: it.id, name: it.name, r: it.r, v: it.v, lane: it.lane,
      x: anchorX + Math.cos(ang) * rad,
      y: anchorY + Math.sin(ang) * rad,
    };
  });
  const lo = limit.top;
  const hi = limit.bottom;
  for (let n = 0; n < 16; n += 1) {
    pushApart(pts);
    for (const p of pts) {
      p.x += (anchorX - p.x) * 0.28;
      p.y += (anchorY - p.y) * 0.08;
      if (p.y < lo + p.r) p.y = lo + p.r;
      if (p.y > hi - p.r) p.y = hi - p.r;
    }
  }
  for (let n = 0; n < 8; n += 1) pushApart(pts);
  return pts;
}

/**
 * 日期线上的停放泡。y 钉死在日期线，重叠时只沿横向往屏内让。
 */
export function packEdge(items, edgeX, inward, width) {
  const sorted = items.slice().sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1));
  const out = [];
  for (const it of sorted) {
    let x = edgeX + inward * it.r;
    for (const p of out) {
      const dy = Math.abs(p.y - it.y);
      const need = p.r + it.r + 3;
      if (dy >= need) continue;
      const dx = Math.sqrt(Math.max(0, need * need - dy * dy));
      const nudged = p.x + inward * dx;
      x = inward > 0 ? Math.max(x, nudged) : Math.min(x, nudged);
    }
    const bound = width || 4000;
    x = Math.max(it.r + 2, Math.min(bound - it.r - 2, x));
    out.push({ id: it.id, name: it.name, lane: it.lane, r: it.r, y: it.y, x, amount: it.amount });
  }
  return out;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * 整帧画面。stocks 是两根轴上的簇，markers 是左右缘的日期泡，flies 是正在飞的那一颗。
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
    const p = eventProgress(e.day, scrollDay, ppd, height);
    if (!(p > 0)) continue;
    const y = yOfDay(e.day, scrollDay, ppd, height);
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
      const flyX = Math.max(flyR, Math.min(width - flyR, lerp(src.x, dst.x, t)));
      const flyY = Math.max(flyR, Math.min(height - flyR, lerp(src.y, dst.y, t)));
      flies.push({
        id: 'F' + e.key,
        x: flyX,
        y: flyY,
        r: flyR,
        lane: from ? from.lane : (to ? to.lane : 0),
        sx: src.x, sy: src.y, sr: src.r,
        dx: dst.x, dy: dst.y, dr: dst.r,
      });
    }
  }
  return {
    liab, asset,
    left: packEdge(left, 6, 1, width),
    right: packEdge(right, width - 6, -1, width),
    flies,
  };
}
