// 核心：资产居中、负债在左、费用按日在右
/**
 * 窗口左缘停负债和权益，正中停资产，右缘停费用和成本。收入从左缘出现。
 * 飞泡是单笔金额，在途不并进分类合计。倒放和正放用同一套进度。
 */

import { rimClear } from './bubble-scene.js';
import {
  bubbleRadius, clamp01, eventProgress, flyScale, textFade, yOfDay,
} from './bubble-motion.js';
import { dayLine, playLayout, stockBooks } from './bubble-play.js';

function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function bezier(src, dst, cx, cy, t) {
  const s = 1 - t;
  return {
    x: s * s * src.x + 2 * s * t * cx + t * t * dst.x,
    y: s * s * src.y + 2 * s * t * cy + t * t * dst.y,
  };
}

function arcClear(src, dst, cx, cy, blocks, flyR) {
  let clear = 1e9;
  for (const u of [0.28, 0.5, 0.72]) {
    const p = bezier(src, dst, cx, cy, u);
    for (const o of blocks) {
      if (!o) continue;
      clear = Math.min(clear, Math.hypot(p.x - o.x, p.y - o.y) - o.r - flyR);
    }
  }
  return clear;
}

/** 一条抛物线。默认轻轻鼓起；挡住时把鼓起加大，仍然是同一条平滑曲线。 */
function flyArc(src, dst, blocks, t, flyR, preferUp) {
  const dx = dst.x - src.x;
  const dy = dst.y - src.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (src.x + dst.x) / 2;
  const my = (src.y + dst.y) / 2;
  let best = null;
  for (const frac of [0.14, 0.26, 0.4]) {
    for (const sign of [1, -1]) {
      const cx = mx + nx * len * frac * sign;
      const cy = my + ny * len * frac * sign;
      const clear = arcClear(src, dst, cx, cy, blocks, flyR);
      const up = my - cy;
      const bias = (preferUp ? up : -up) * 0.03;
      const score = clear + bias;
      if (!best || score > best.score) best = { cx, cy, clear, score };
    }
    if (best.clear >= 1) break;
  }
  return bezier(src, dst, best.cx, best.cy, t);
}

/** 错层列。列号来自稳定的 slot，不随当前可见集合重排。side>0 贴左缘，side<0 贴右缘，0 以中线为轴。 */
/** 错层列，装进窗口上的一条带。太大就整组缩小，列号不换，也不靠镜头往中心收。 */
function dockColumns(items, edge, height, gap, side, nCols, band) {
  if (!items.length) return [];
  const n = nCols || 2;
  const cols = Array.from({ length: n }, () => []);
  for (const b of items) cols[(b.slot || 0) % n].push(b);
  for (const list of cols) list.sort((a, c) => (a.id < c.id ? -1 : 1));
  const live = cols.map((list, i) => (list.length ? i : -1)).filter((i) => i >= 0);
  const measure = () => {
    const maxR = cols.map((list) => (list.length ? Math.max(...list.map((b) => b.r)) : 0));
    let span = 0;
    let tall = 0;
    live.forEach((col, i) => {
      span += maxR[col] * 2 + (i ? gap : 0);
      const total = cols[col].reduce((s, b) => s + b.r * 2, 0) + gap * Math.max(0, cols[col].length - 1);
      const extra = col % 2 ? maxR[col] * 0.62 : 0;
      if (total + extra > tall) tall = total + extra;
    });
    return { maxR, span, tall };
  };
  let box = measure();
  const limW = band > 0 ? band : box.span || 1;
  const limH = Math.max(48, height - 36);
  const k = Math.min(1, limW / Math.max(box.span, 1), limH / Math.max(box.tall, 1));
  if (k < 1) {
    for (const b of items) b.r *= k;
    box = measure();
  }
  const shift = side > 0 ? edge : side < 0 ? edge - box.span : edge + ((band || box.span) - box.span) / 2;
  const laid = [];
  let cursor = 0;
  const x0 = [];
  live.forEach((col, i) => {
    x0[col] = cursor;
    cursor += box.maxR[col] * 2 + (i < live.length - 1 ? gap : 0);
  });
  for (const col of live) {
    const list = cols[col];
    const total = list.reduce((s, b) => s + b.r * 2, 0) + gap * Math.max(0, list.length - 1);
    let y = height / 2 - total / 2 + (col % 2 ? box.maxR[col] * 0.62 : 0);
    const flush = side < 0 && col === live[live.length - 1];
    for (const b of list) {
      const inset = flush ? (box.maxR[col] - b.r) * 2 : side ? 0 : box.maxR[col] - b.r;
      laid.push({ ...b, sx: shift + x0[col] + inset + b.r, sy: y + b.r });
      y += b.r * 2 + gap;
    }
  }
  return laid;
}

/** 一帧。资产和负债不跟日期走；右缘费用跟着日期滚出屏幕。 */
export function buildHome(model, view) {
  const width = view.width || 390;
  const height = view.height || 700;
  const ppd = view.ppd || 80;
  const scroll = view.scrollDay || 0;
  const zone = view.zone;
  const win = view.windowPx;
  const sep = Math.max(0, view.gap == null ? 4 : view.gap);
  const fitR = (v) => bubbleRadius(Math.abs(v), {
    mults: view.mults, dMin: view.dMin, dMax: view.dMax, dMaxOn: view.dMaxOn,
  });
  const insetL = width * ((view.insetL == null ? 0 : view.insetL) / 100);
  const insetR = width * ((view.insetR == null ? 0 : view.insetR) / 100);
  const accounts = model.accounts || [];
  const events = model.events || [];
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const daysPer = Number(view.daysPer) > 0 ? Number(view.daysPer) : 0;
  const pref = Number(win) > 0 ? Number(win) : height * 0.8;
  const anim = daysPer ? Math.min(pref, ppd * 0.9) : pref;
  const play = playLayout(model, ppd, height, anim, { lockDay: daysPer > 0 });
  const prog = (e) => eventProgress(play.slot.get(e.key), scroll, ppd, height, zone, (play.dur && play.dur.get(e.key)) || anim);
  const books = stockBooks(events, accounts, prog);
  const wx = (sx) => sx;
  const wy = (sy) => sy;
  const leftBand = Math.max(80, width * 0.3);
  const midBand = Math.max(96, width * 0.34);
  const rightBand = Math.max(80, width * 0.28);

  const slotMap = (pred) => {
    const ids = accounts.filter((a) => a.id !== '__OPENING__' && pred(a)).map((a) => a.id).sort();
    return new Map(ids.map((id, i) => [id, i]));
  };
  const leftSlot = slotMap((a) => a.type === '负债类' || a.type === '权益类');
  const assetSlot = slotMap((a) => a.type === '资产类');
  const cats = [...new Set(events.filter((e) => e.edge === 'R').map((e) => e.cat))].sort();
  const catSlot = new Map(cats.map((c, i) => [c, i]));
  const left = [];
  const asset = [];
  for (const a of accounts) {
    if (a.id === '__OPENING__') continue;
    const equity = a.type === '权益类';
    if (!a.stock && !equity) continue;
    const book = books.get(a.id);
    if (!book || (Math.abs(book.label) < 0.5 && !book.live)) continue;
    const kind = a.type === '资产类' ? 'asset' : (equity ? 'equity' : 'liab');
    const node = {
      id: a.id, name: a.name, lane: a.lane, r: fitR(book.size), amount: Math.abs(book.label),
      v: book.size, kind, slot: kind === 'asset' ? assetSlot.get(a.id) : leftSlot.get(a.id),
    };
    (kind === 'asset' ? asset : left).push(node);
  }
  const padL = Math.min(Math.max(2, insetL), width * 0.04);
  const padR = Math.min(Math.max(2, insetR), width * 0.04);
  const placedL = dockColumns(left, padL, height, sep, 1, 2, leftBand - padL);
  const placedA = dockColumns(asset, (width - midBand) / 2, height, sep, 0, 3, midBand);
  const pin = (list) => { for (const b of list) { b.x = wx(b.sx); b.y = wy(b.sy); } };
  pin(placedL);
  pin(placedA);
  const stay = [...placedL, ...placedA];
  const at = new Map(stay.map((b) => [b.id, b]));

  const bagAt = (e) => {
    let s = play.slot.get(e.key);
    for (const o of events) {
      if (o.edge !== 'R' || o.day !== e.day || o.cat !== e.cat) continue;
      const n = play.slot.get(o.key);
      if (n < s) s = n;
    }
    return s;
  };
  const bags = new Map();
  for (const e of events) {
    if (e.edge !== 'R') continue;
    const p = prog(e);
    const arrived = p >= 1 ? 1 : smooth(clamp01((p - 0.72) / 0.28));
    if (!(p >= 1) && !(arrived > 0)) continue;
    const id = 'R:' + e.day + ':' + e.cat;
    let bag = bags.get(id);
    if (!bag) {
      const screenY = yOfDay(daysPer ? e.day : bagAt(e), scroll, ppd, height);
      bag = { id, name: e.cat || '费用', lane: e.toLane < 0 ? 4 : e.toLane, y: screenY, screenY, dateY: screenY, amount: 0, size: 0, edge: 'R', slot: catSlot.get(e.cat) || 0 };
      bags.set(id, bag);
    }
    bag.size += e.amount * (p >= 1 ? 1 : arrived);
    if (p >= 1) bag.amount += e.amount;
  }
  const rightItems = [...bags.values()].filter((b) => b.size >= 0.5).map((b) => ({
    ...b, r: fitR(b.size),
  }));
  const groups = new Map();
  for (const b of rightItems) {
    const k = b.id.split(':')[1];
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  let right = [];
  for (const list of groups.values()) {
    const cy = list[0].screenY == null ? list[0].y : list[0].screenY;
    for (const b of dockColumns(list, width - padR, cy * 2 || 1, sep, -1, 2, rightBand - padR)) {
      b.edge = 'R';
      b.x = wx(b.sx);
      b.y = daysPer ? wy(b.sy) : b.sy;
      right.push(b);
    }
  }

  const flies = [];
  const blockers = [...stay, ...right];
  for (const e of events) {
    const p = prog(e);
    const fadeSpan = view.fade == null ? 0.18 : view.fade;
    if (!(p > 0) || p > 1 + fadeSpan) continue;
    const from = byId.get(e.fromId);
    const to = byId.get(e.toId);
    const name = e.kind === 'repay' ? '还款' : e.kind === 'borrow' ? '借入' : e.kind === 'transfer' ? '转账' : (e.cat || (from && from.name) || (to && to.name) || '');
    if (p >= 1) {
      const host = at.get(e.toId) || right.find((b) => b.id === 'R:' + e.day + ':' + e.cat);
      const fade = textFade(p, fadeSpan);
      if (host && fade > 0.01) {
        flies.push({
          id: 'F' + e.key, x: host.x, y: host.y, r: 0, labelR: fitR(e.amount), ghost: true,
          lane: host.lane || 0, amount: e.amount, name, fade, t: 1, melt: 1, srcId: '', dstId: host.id || '',
        });
      }
      continue;
    }
    const scale = flyScale(e.kind, p);
    if (!(scale > 0.04)) continue;
    const yDate = yOfDay(daysPer ? e.day : (e.edge === 'R' ? bagAt(e) : dayLine(play, e)), scroll, ppd, height);
    const bag = right.find((b) => b.id === 'R:' + e.day + ':' + e.cat);
    const flyR = fitR(e.amount);
    const spotFor = (id) => at.get(id) || null;
    let dst = (to && spotFor(e.toId)) || bag || null;
    let src = (from && spotFor(e.fromId)) || null;
    if (e.opening || e.fromId === '__OPENING__' || e.toId === '__OPENING__') {
      const id = e.fromId === '__OPENING__' ? e.toId : e.fromId;
      const node = spotFor(id) || { x: width / 2, y: height / 2, r: 12, id };
      dst = node;
      src = e.toId === '__OPENING__'
        ? { x: node.x, y: Math.min(height - 8, node.y + node.r + 42), r: 6, id: '' }
        : null;
    }
    if (!dst) {
      const x = e.edge === 'R' ? width - padR - flyR : width / 2;
      const y = e.edge === 'R' ? (daysPer ? wy(yDate) : yDate) : height / 2;
      dst = { x, y, r: 10, id: e.toId || '' };
    }
    const incoming = e.kind === 'inflow' || (e.opening && e.toId !== '__OPENING__');
    if (!src && incoming) {
      src = { x: wx(padL), y: wy(height * 0.82), r: 6, id: '' };
    }
    if (!src) {
      src = {
        x: dst.x,
        y: Math.min(height - 8, dst.y + Math.max(48, (dst.r || 16) + 28)),
        r: 6, id: e.fromId || '',
      };
    }
    const t = smooth(clamp01(p));
    const preferUp = e.kind === 'spend' || e.kind === 'charge';
    const others = blockers.filter((o) => o.id !== src.id && o.id !== dst.id);
    const launch = src.id ? rimClear(src, dst, [...others, dst], flyR) : src;
    const land = dst.id ? rimClear(dst, src, [...others, src], flyR) : dst;
    const blocks = others;
    let pos = flyArc(launch, land, blocks, t, flyR, preferUp);
    const melt = smooth(clamp01((p - 0.72) / 0.28));
    const shove = (list) => {
      for (const o of list) {
        if (!o || !(1 - melt)) continue;
        const dx = pos.x - o.x;
        const dy = pos.y - o.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const min = flyR + o.r + sep;
        if (dist >= min) continue;
        const push = (min - dist) * (1 - melt);
        pos = { x: pos.x + (dx / dist) * push, y: pos.y + (dy / dist) * push };
      }
    };
    shove(t > 0.2 ? [...blocks, src.id ? src : null, dst.id ? dst : null] : blocks);
    pos = { x: pos.x + (dst.x - pos.x) * melt, y: pos.y + (dst.y - pos.y) * melt };
    const body = flyR * (scale > 0.92 ? 1 : scale) * (1 - melt);
    flies.push({
      id: 'F' + e.key, x: pos.x, y: pos.y, homeX: pos.x, homeY: pos.y, r: body, labelR: flyR,
      lane: to ? to.lane : (from ? from.lane : 0),
      amount: e.amount, name, kind: e.kind, fade: textFade(p, fadeSpan),
      sx: src.x, sy: src.y, sr: src.r || 8, srcId: src.id || '',
      dx: dst.x, dy: dst.y, dr: dst.r || 8, dstId: dst.id || '',
      t, melt, neck: melt > 0.02 && melt < 0.98, meet: t > 0.45 ? (dst.id || '') : '', stick: '',
    });
  }

  return {
    liab: placedL.filter((b) => b.kind === 'liab'),
    equity: placedL.filter((b) => b.kind === 'equity'),
    asset: placedA, left: [], right, flies,
    gap: view.gap, repel: view.repel,
    axes: [],
  };
}
