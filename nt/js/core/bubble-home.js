// 核心：资产居中、负债在左、费用按日在右
/**
 * 屏幕中间是驻留的资产，左缘是驻留的负债，右缘是当天费用分类。
 * 飞泡是单笔金额，在途不并进分类合计。倒放和正放用同一套进度。
 */

import { isDebitType } from './schema.js';
import {
  bubbleRadius, clamp01, eventProgress, flyScale, textFade,
  packCluster, packEdge, shownBalance, yOfDay,
} from './bubble-motion.js';

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

function pushPairs(list, gap) {
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const A = list[i];
      const B = list[j];
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const min = A.r + B.r + gap;
      if (dist >= min) continue;
      const push = (min - dist) / 2;
      const ux = dx / dist;
      const uy = dy / dist;
      A.x -= ux * push;
      A.y -= uy * push;
      B.x += ux * push;
      B.y += uy * push;
    }
  }
}

function stackLeft(items, edge, height, gap) {
  const sorted = items.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const total = sorted.reduce((s, b) => s + b.r * 2, 0) + gap * Math.max(0, sorted.length - 1);
  let y = height / 2 - total / 2;
  return sorted.map((b) => {
    const node = { ...b, x: edge + b.r, y: y + b.r, ax: edge + b.r, ay: y + b.r };
    y += b.r * 2 + gap;
    return node;
  });
}

/** 一帧。资产和负债不跟日期走；右缘费用跟着日期滚出屏幕。 */
export function buildHome(model, view) {
  const width = view.width || 390;
  const height = view.height || 700;
  const ppd = view.ppd || 80;
  const scroll = view.scrollDay || 0;
  const zone = view.zone;
  const win = view.windowPx;
  const gap = view.dayGap == null ? 0.65 : Number(view.dayGap);
  const sep = Math.max(0, view.gap == null ? 4 : view.gap);
  const fitR = (v) => bubbleRadius(Math.abs(v), { mults: view.mults });
  const insetL = width * ((view.insetL == null ? 6 : view.insetL) / 100);
  const insetR = width * ((view.insetR == null ? 6 : view.insetR) / 100);
  const accounts = model.accounts || [];
  const events = model.events || [];
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const prog = (e) => {
    const base = e.vday == null ? e.day : e.vday;
    const shifted = base + (e.queue || 0) * gap;
    return eventProgress(shifted, scroll, ppd, height, zone, win);
  };

  const liab = [];
  const asset = [];
  for (const a of accounts) {
    if (!a.stock) continue;
    const debit = isDebitType(a.type);
    const v = shownBalance(events, a.id, debit, scroll, ppd, height, zone, gap, win);
    if (Math.abs(v) < 0.5) continue;
    const node = {
      id: a.id, name: a.name, lane: a.lane, r: fitR(v), amount: Math.abs(v), v,
      kind: debit ? 'asset' : 'liab',
    };
    (debit ? asset : liab).push(node);
  }
  const placedL = stackLeft(liab, insetL, height, sep);
  const placedA = packCluster(asset, width / 2, height / 2, { top: height * 0.12, bottom: height * 0.88 });
  for (const b of placedA) { b.ax = width / 2; b.ay = height / 2; b.amount = Math.abs(b.v); }
  const stay = [...placedL, ...placedA];
  for (let n = 0; n < 20; n += 1) {
    pushPairs(stay, sep);
    for (const b of stay) {
      if (b.ax == null) continue;
      b.x += (b.ax - b.x) * 0.3;
      b.y += (b.ay - b.y) * 0.3;
    }
  }
  for (let n = 0; n < 10; n += 1) pushPairs(stay, sep);
  const at = new Map(stay.map((b) => [b.id, b]));

  const bags = new Map();
  for (const e of events) {
    if (e.edge !== 'R' || !(prog(e) >= 1)) continue;
    const id = 'R:' + e.day + ':' + e.cat;
    let bag = bags.get(id);
    if (!bag) {
      const y = yOfDay(e.vday == null ? e.day : e.vday, scroll, ppd, height);
      bag = { id, name: e.cat || '费用', lane: e.toLane < 0 ? 4 : e.toLane, y, dateY: y, amount: 0, edge: 'R' };
      bags.set(id, bag);
    }
    bag.amount += e.amount;
  }
  const rightItems = [...bags.values()].filter((b) => b.amount >= 0.5).map((b) => ({
    ...b, r: fitR(b.amount), band: Math.max(8, ppd * 0.42),
  }));
  const xRight = width - insetR;
  let right = packEdge(rightItems, xRight, -1, width);
  for (const b of right) { b.dateY = b.y; b.band = Math.max(8, ppd * 0.42); b.edge = 'R'; }
  for (const b of right) {
    let x = xRight - b.r;
    for (const o of stay) {
      const dy = b.y - o.y;
      const min = b.r + o.r + sep;
      if (Math.abs(dy) >= min) continue;
      x = Math.max(x, o.x + Math.sqrt(Math.max(0, min * min - dy * dy)));
    }
    b.x = x;
  }
  for (let n = 0; n < 8; n += 1) {
    pushPairs(right, sep);
    for (const b of right) {
      const home = b.dateY == null ? b.y : b.dateY;
      const band = b.band || 28;
      b.y = Math.min(home + band, Math.max(home - band, b.y));
    }
  }

  const flies = [];
  const blockers = [...stay, ...right];
  for (const e of events) {
    const p = prog(e);
    if (!(p > 0) || p >= 1) continue;
    const scale = flyScale(e.kind, p);
    if (!(scale > 0.04)) continue;
    const from = byId.get(e.fromId);
    const to = byId.get(e.toId);
    const yDate = yOfDay(e.vday == null ? e.day : e.vday, scroll, ppd, height);
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
      let x = e.edge === 'R' ? xRight - 18 : width / 2;
      const y = e.edge === 'R' ? yDate : height / 2;
      if (e.edge === 'R') {
        const min = flyR + sep;
        for (const o of stay) {
          const dy = y - o.y;
          if (Math.abs(dy) >= o.r + min) continue;
          x = Math.max(x, o.x + Math.sqrt(Math.max(0, (o.r + min) * (o.r + min) - dy * dy)));
        }
      }
      dst = { x, y, r: 10, id: e.toId || '' };
    }
    const incoming = e.kind === 'inflow' || (e.opening && e.toId !== '__OPENING__');
    if (!src && incoming) {
      src = { x: Math.max(8, flyR * 0.35), y: height - Math.max(8, flyR * 0.25), r: 6, id: '' };
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
    const dx0 = dst.x - src.x;
    const dy0 = dst.y - src.y;
    const len0 = Math.hypot(dx0, dy0) || 1;
    const launch = src.id ? {
      x: src.x + (dx0 / len0) * (src.r || 0),
      y: src.y + (dy0 / len0) * (src.r || 0),
      id: src.id,
    } : src;
    const land = dst.id ? {
      x: dst.x - (dx0 / len0) * (dst.r || 0),
      y: dst.y - (dy0 / len0) * (dst.r || 0),
      id: dst.id,
    } : dst;
    const blocks = blockers.filter((o) => o.id !== src.id && o.id !== dst.id);
    let pos = flyArc(launch, land, blocks, t, flyR, preferUp);
    if (t > 0.22 && t < 0.78) {
      for (const o of blocks) {
        const dx = pos.x - o.x;
        const dy = pos.y - o.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const min = flyR + o.r + sep;
        if (dist >= min) continue;
        pos = { x: pos.x + (dx / dist) * (min - dist), y: pos.y + (dy / dist) * (min - dist) };
      }
    }
    const x = pos.x;
    const y = pos.y;
    const name = (e.kind === 'repay') ? '还款'
      : (e.kind === 'borrow') ? '借入'
        : (e.cat || (from && from.name) || (to && to.name) || '');
    flies.push({
      id: 'F' + e.key, x, y, homeX: x, homeY: y, r: flyR * (scale > 0.92 ? 1 : Math.max(0.35, scale)),
      lane: to ? to.lane : (from ? from.lane : 0),
      amount: e.amount, name, kind: e.kind,
      fade: textFade(p, view.fade == null ? 0.18 : view.fade),
      sx: src.x, sy: src.y, sr: src.r || 8, srcId: src.id || '',
      dx: dst.x, dy: dst.y, dr: dst.r || 8, dstId: dst.id || '',
      t, neck: t > 0.58 && t < 0.94, meet: t > 0.45 ? (dst.id || '') : '', stick: '',
    });
  }
  for (let n = 0; n < 14; n += 1) {
    for (let i = 0; i < flies.length; i += 1) {
      for (let j = i + 1; j < flies.length; j += 1) {
        const A = flies[i];
        const B = flies[j];
        if (A.t > 0.8 && B.t > 0.8 && A.dstId && A.dstId === B.dstId) continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const min = A.r + B.r + sep * 0.5;
        if (dist >= min) continue;
        const push = (min - dist) / 2;
        A.x -= (dx / dist) * push;
        A.y -= (dy / dist) * push;
        B.x += (dx / dist) * push;
        B.y += (dy / dist) * push;
      }
    }
  }
  for (const f of flies) {
    if (f.t < 0.28 || f.t > 0.74) continue;
    for (const o of blockers) {
      if (o.id && (o.id === f.srcId || o.id === f.dstId)) continue;
      const dx = f.x - o.x;
      const dy = f.y - o.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const min = f.r + o.r + sep;
      if (dist >= min) continue;
      f.x += (dx / dist) * (min - dist);
      f.y += (dy / dist) * (min - dist);
    }
  }

  return {
    liab: placedL, asset: placedA, left: [], right, flies,
    gap: view.gap, repel: view.repel,
    axes: [insetL, width / 2, width - insetR],
  };
}
