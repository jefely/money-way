// 核心：脉络气泡的滚动进度、分组与形变
/**
 * 脉络页的气泡运动（纯函数）。
 * 层：第一层 · core
 *
 * 画面上的每一个数都只由滚动位置决定：同一进度正放和倒放得到同一组坐标。
 * 弹力不做逐帧积分（那会让倒放滞后），而是写进进度曲线和固定次数的松弛里。
 */

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
/**
 * 飞行动作的手感，只看进度 t。
 * 中段拉长，靠近并入时压扁并给出一圈冲击；分开的一瞬间溅出小滴。
 * 端点回到 1，倒放是同一条曲线。
 */
export function juiceAt(t) {
  const x = Math.min(1, Math.max(0, t));
  const stretch = 1 + 0.16 * Math.sin(x * Math.PI);
  return { sx: stretch, sy: 1 / Math.sqrt(stretch), ripple: Math.exp(-((x - 0.84) ** 2) / 0.004), droplets: Math.exp(-((x - 0.16) ** 2) / 0.004) };
}

export function elastic(p) {
  const x = clamp01(p);
  return x * x * (3 - 2 * x) + Math.sin(x * Math.PI) * Math.sin(x * Math.PI * 2) * 0.08;
}

/** 事件日期线在屏幕上的 y。过去在上，未来在下，scrollDay 对准屏幕正中。 */
export function yOfDay(day, scrollDay, ppd, height) {
  return height * 0.5 + (day - scrollDay) * ppd;
}

/**
 * 动画进度。日期线在下中带下沿（0.75H）时为 0，上中带上沿（0.25H）时为 1。
 * 不钳制：小于 0 还没开始，大于 1 已经演完。
 */
export function eventProgress(day, scrollDay, ppd, height, zone, windowPx) {
  if (!(height > 0)) return 0;
  const z = Math.min(1, Math.max(0.4, Number(zone) || 0.8));
  const y = yOfDay(day, scrollDay, ppd, height);
  const bot = height * (0.5 + z / 2);
  const win = Number(windowPx) > 0 ? Number(windowPx) : height * z;
  return (bot - y) / win;
}

/**
 * 一屏里的动画窗口跟数据跨度走，不跟死的「每天 72 像素」。
 * 视界（半屏）大约盖住全程的两成，再少也有 2.2 个视觉日，
 * 所以只有几笔流水时，拖半屏就能看完飞入飞出。
 */
export function pixelsPerDay(vspan, height, zoom, override) {
  const z = Number(zoom) || 1;
  if (Number(override) > 0) return Number(override) * z;
  const span = Math.max(1, Number(vspan) || 1);
  const h = Math.max(240, Number(height) || 700);
  const horizonDays = Math.min(4.2, Math.max(2.2, span * 0.08));
  const raw = (h * 0.5) / horizonDays;
  return Math.max(14, Math.min(176, raw)) * z;
}

/** 金额：一位小数；整数不带「.0」。 */
export function formatAmount(n) {
  const v = Math.abs(Math.round((Number(n) || 0) * 10) / 10);
  if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
  return v.toFixed(1);
}

/**
 * 两圆之间的公切圆弧（粘连颈）。
 * 半径由两圆大小和距离一起决定：靠得越近，弧越大、颈越粗；拉开到阈值就没有弧。
 */
export function tangentBridge(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const reach = a.r + b.r + Math.min(a.r, b.r) * 0.85;
  if (!(d > 1) || d >= reach || d <= Math.abs(a.r - b.r) + 0.4) return null;
  const span = reach - Math.abs(a.r - b.r);
  const closeness = span > 0 ? 1 - (d - Math.abs(a.r - b.r)) / span : 0;
  const rho = Math.min(a.r, b.r) * (0.2 + 1.2 * closeness);
  const R1 = a.r + rho;
  const R2 = b.r + rho;
  const along = (d * d - R2 * R2 + R1 * R1) / (2 * d);
  const h2 = R1 * R1 - along * along;
  if (!(h2 > 0.5)) return null;
  const h = Math.sqrt(h2);
  const ux = dx / d;
  const uy = dy / d;
  const px = a.x + ux * along;
  const py = a.y + uy * along;
  const centers = [
    { x: px - uy * h, y: py + ux * h },
    { x: px + uy * h, y: py - ux * h },
  ];
  const touch = (c, circle) => Math.atan2(circle.y - c.y, circle.x - c.x);
  return {
    rho,
    closeness,
    arcs: centers.map((c) => ({ x: c.x, y: c.y, r: rho, a0: touch(c, a), a1: touch(c, b) })),
  };
}

function turn(d) {
  let x = d % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x;
}

/** 外圆弧要绕开对方，所以取背对另一颗圆心的那一侧。 */
function outerCCW(cx, cy, from, to, other) {
  const mid = from + turn(to - from) / 2;
  const face = Math.cos(mid) * (other.x - cx) + Math.sin(mid) * (other.y - cy) > 0;
  return face;
}

/**
 * 两圆的融合轮廓：各自的外圆弧，加上两侧与两圆相切的凹弧。
 * 拉开到阈值就没有这条轮廓。
 */
export function bridgeOutline(a, b) {
  const bridge = tangentBridge(a, b);
  if (!bridge) return null;
  const [c1, c2] = bridge.arcs;
  const ang = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
  const a1 = ang(a, c1);
  const a2 = ang(a, c2);
  const b1 = ang(b, c1);
  const b2 = ang(b, c2);
  const fillet = (c, from, to) => ({
    x: c.x, y: c.y, r: c.r, a0: from, a1: to, ccw: turn(to - from) > Math.PI,
  });
  return [
    { x: a.x, y: a.y, r: a.r, a0: a1, a1: a2, ccw: outerCCW(a.x, a.y, a1, a2, b) },
    fillet(c2, c2.a0, c2.a1),
    { x: b.x, y: b.y, r: b.r, a0: b2, a1: b1, ccw: outerCCW(b.x, b.y, b2, b1, a) },
    fillet(c1, c1.a1, c1.a0),
  ];
}

/**
 * 同一天里第 index 笔的飞行进度。一笔就跟日期线走；
 * 多笔则错开，先飞的先到，后飞的还在后面，整段都落在日期线穿过视界的过程里。
 */
export function flyLocal(dayP, index, count) {
  const n = Math.max(1, count || 1);
  if (n === 1) return dayP;
  const span = Math.min(0.55, Math.max(0.22, 1 / n));
  const gap = (1 - span) / (n - 1);
  return (dayP - (index || 0) * gap) / span;
}

/** 分类泡已经吃进这笔的比例。费用在飞到边上时长大，收入一出发就记上。 */
export function bagShare(kind, localP) {
  if (!(localP > 0)) return 0;
  if (localP >= 1) return 1;
  if (kind === 'inflow') return smooth(Math.min(1, localP / 0.28));
  if (kind === 'spend' || kind === 'charge') return smooth(Math.max(0, (localP - 0.42) / 0.58));
  return 0;
}

/** 飞泡大小。借款和刷卡从小变大；并入的末段收回。两端是 0。 */
export function flyScale(kind, localP) {
  if (!(localP > 0) || localP >= 1) return 0;
  return (kind === 'borrow' || kind === 'charge') ? smooth(Math.min(1, localP / 0.3)) : 1;
}

/** 飞泡文字在并完前保持 1，最后一段按进度渐隐。倒放是同一条曲线。 */
export function textFade(localP, span) {
  const w = Math.max(0, Number(span) || 0);
  if (!(localP < 1)) return 0;
  return (!(w > 0) || localP <= 1 - w) ? 1 : (1 - localP) / w;
}

/**
 * 半径跟金额的平方根走，不夹上下限。
 * 1 元是一个小点，10 万比它大两个数量级，整屏靠缩放去装。
 */
const TIERS = [1, 10, 100, 1000, 5000, 10000, 100000];

/** 金额在各档倍率之间按对数插值。不传倍率时每一档都是 1。 */
export function tierMult(amount, mults) {
  const ms = mults && mults.length ? mults : [1, 1, 1, 1, 1, 1, 1];
  const v = Math.max(0.5, Math.abs(Number(amount) || 0));
  const x = Math.log10(v);
  const xs = TIERS.map((t) => Math.log10(t));
  if (x <= xs[0]) return ms[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ms[Math.min(last, ms.length - 1)];
  for (let i = 1; i < xs.length; i += 1) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      const a = ms[i - 1] == null ? 1 : ms[i - 1];
      return a + ((ms[i] == null ? 1 : ms[i]) - a) * t;
    }
  }
  return 1;
}

export function bubbleRadius(amount, opt) {
  const v = Math.abs(Number(amount) || 0);
  if (v < 0.5) return 2;
  const exp = (opt && opt.exp) || 0.5;
  const k = (opt && opt.k) || 2.6;
  const m = tierMult(v, opt && opt.mults);
  return k * Math.pow(v, exp) * m;
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
export function shownBalance(events, accountId, debit, scrollDay, ppd, height, zone, dayGap, windowPx) {
  let run = 0;
  const gap = Number(dayGap) || 0;
  for (const e of events) {
    if (e.toId !== accountId && e.fromId !== accountId) continue;
    const coord = e.vday == null ? e.day : e.vday;
    const shifted = coord + (e.edge && gap ? (e.queue || 0) * gap : 0);
    const dayP = eventProgress(shifted, scrollDay, ppd, height, zone, windowPx);
    const p = e.edge && !gap ? flyLocal(dayP, e.queue || 0, e.queueN || 1) : dayP;
    const fr = flowFractions(e.kind, p);
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
      const need = p.r + it.r + 8;
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
