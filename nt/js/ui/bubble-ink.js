// 界面：脉络泡的内发光、外晕和字号
/**
 * 内发光用轮廓裁切，只留在泡泡里面。外晕是另一层，只画在轮廓外面。
 * 名称和金额各有字号；默认同步，超宽时一起缩小，不再单独把金额缩小。
 */

function rgba(hex, a) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function worldPx(r, cam, k, minPx, maxPx) {
  const screen = r * (cam || 1) * k;
  if (!(screen >= minPx) || !(maxPx > 0)) return 0;
  return Math.min(maxPx, screen) / (cam || 1);
}

function ellipsis(text, px, maxW, measure) {
  let shown = text;
  while (shown.length > 1 && measure(shown, px) > maxW) shown = shown.slice(0, -1);
  if (shown !== text && shown.length > 1) shown = shown.slice(0, -1) + '…';
  return shown;
}

/** 名称、金额的字号。同步开启时两行用名称那一套，并共用一次缩放。 */
export function labelLayout(r, cam, p, name, amount, measure) {
  const opt = p || {};
  const lock = opt.fontLock !== '0' && opt.fontLock !== 0 && opt.fontLock !== '关';
  const nameK = num(opt.nameK, 0.32);
  const nameMin = num(opt.nameMin, 8);
  const nameMax = num(opt.nameMax, 18);
  const amtK = lock ? nameK : num(opt.amtK, nameK);
  const amtMin = lock ? nameMin : num(opt.amtMin, nameMin);
  const amtMax = lock ? nameMax : num(opt.amtMax, nameMax);
  let namePx = name ? worldPx(r, cam, nameK, nameMin, nameMax) : 0;
  let amtPx = amount ? worldPx(r, cam, amtK, amtMin, amtMax) : 0;
  const maxW = Math.max(8, r * 1.55);
  if (lock) {
    const base = namePx || amtPx;
    if (!(base > 0)) return { namePx: 0, amtPx: 0, name: name || '' };
    const nw = name ? measure(name, base) : 0;
    const aw = amount ? measure(amount, base) : 0;
    let scale = 1;
    if (nw > maxW) scale = Math.min(scale, maxW / nw);
    if (aw > maxW) scale = Math.min(scale, maxW / aw);
    const px = base * scale;
    const shown = name && measure(name, px) > maxW ? ellipsis(name, px, maxW, measure) : (name || '');
    return { namePx: name ? px : 0, amtPx: amount ? px : 0, name: shown };
  }
  let shown = name || '';
  if (namePx > 0 && name && measure(name, namePx) > maxW) {
    const fit = namePx * maxW / measure(name, namePx);
    const floor = nameMin / (cam || 1);
    if (fit + 0.01 < floor) shown = ellipsis(name, namePx, maxW, measure);
    else namePx = fit;
  }
  if (amtPx > 0 && amount && measure(amount, amtPx) > maxW) {
    amtPx *= maxW / measure(amount, amtPx);
  }
  return { namePx, amtPx, name: shown };
}

function discsOf(parts) {
  const seen = new Set();
  const out = [];
  for (const s of parts || []) {
    const key = Math.round(s.x) + ':' + Math.round(s.y) + ':' + Math.round(s.r);
    if (seen.has(key) || !(s.r > 1)) continue;
    seen.add(key);
    out.push({ x: s.x, y: s.y, r: s.r });
  }
  return out;
}

/** 轮廓外的淡晕。先按真实轮廓挖空，光不会涂进泡泡里面。 */
export function paintOuterGlow(g, addPath, discs, hex, p) {
  const a = num(p && p.outGlow, 0.1);
  const ext = num(p && p.outGlowExt, 50) / 100;
  const list = discsOf(discs);
  if (!(a > 0.004) || !(ext > 0.002) || !list.length) return;
  const peak = Math.min(0.28, a);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const d of list) {
    const reach = d.r * (1 + ext);
    x0 = Math.min(x0, d.x - reach);
    y0 = Math.min(y0, d.y - reach);
    x1 = Math.max(x1, d.x + reach);
    y1 = Math.max(y1, d.y + reach);
  }
  g.save();
  g.beginPath();
  g.rect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
  addPath(g);
  g.clip('evenodd');
  for (const d of list) {
    const grd = g.createRadialGradient(d.x, d.y, d.r, d.x, d.y, d.r * (1 + ext));
    grd.addColorStop(0, rgba(hex, peak));
    grd.addColorStop(1, rgba(hex, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(d.x, d.y, d.r * (1 + ext), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** 轮廓内的光。裁切用真实轮廓，不用外接矩形，也不使用阴影模糊。 */
export function paintInnerGlow(g, addPath, discs, hex, p) {
  const a = num(p && p.inGlow, 0.1);
  const ext = num(p && p.inGlowExt, 18) / 100;
  const list = discsOf(discs);
  if (!(a > 0.004) || !(ext > 0.002) || !list.length) return;
  const peak = Math.min(0.45, a);
  g.save();
  g.beginPath();
  addPath(g);
  g.clip();
  for (const d of list) {
    const inner = Math.max(0, d.r * (1 - ext));
    const grd = g.createRadialGradient(d.x, d.y, inner, d.x, d.y, Math.max(inner + 0.5, d.r));
    grd.addColorStop(0, rgba(hex, 0));
    grd.addColorStop(1, rgba(hex, peak));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function circleAdd(x, y, r) {
  return (g) => {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, Math.PI * 2);
    g.closePath();
  };
}

export function unionAdd(parts) {
  return (g) => {
    const s0 = parts[0];
    g.moveTo(s0.x + Math.cos(s0.a0) * s0.r, s0.y + Math.sin(s0.a0) * s0.r);
    for (const seg of parts) g.arc(seg.x, seg.y, seg.r, seg.a0, seg.a1, !!seg.ccw);
    g.closePath();
  };
}

export function partsBox(parts) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of parts) {
    x0 = Math.min(x0, s.x - s.r);
    y0 = Math.min(y0, s.y - s.r);
    x1 = Math.max(x1, s.x + s.r);
    y1 = Math.max(y1, s.y + s.r);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
