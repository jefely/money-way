/**
 * 颜色互转（纯函数，零依赖）
 * 层：第一层 · 数据基座
 */

export function hexToRgb(hex) {
  let s = String(hex || '').replace('#', '').trim();
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (s.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(s)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

export function rgbToHex(r, g, b) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}

export function rgbToHsl(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, l };
}

export function hslToRgb(h, s, l) {
  const hh = ((((h % 360) + 360) % 360) / 360);
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));

  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;

  const hue2rgb = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  return {
    r: Math.round(hue2rgb(hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(hh) * 255),
    b: Math.round(hue2rgb(hh - 1 / 3) * 255),
  };
}

/** 归一化成 #rrggbb（非法值落回 #000000） */
export function normalizeHex(v) {
  const s = String(v || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  }
  const rgb = hexToRgb(s);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}
