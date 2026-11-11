// 界面：脉络参数（CSS 变量 → 数字）
/**
 * 从布局页写到 :root 的变量读回脉络画面。
 * 层：第五层 · UI
 */

import { LV_SCHEMA, LV_DEFAULTS } from '../core/lv-settings.js';

let cache = null;

export function invalidateLvParams() {
  cache = null;
}

export function readLvParams() {
  if (cache) return cache;
  const out = { ...LV_DEFAULTS };
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (root) {
    const cs = getComputedStyle(root);
    for (const s of LV_SCHEMA) {
      const raw = cs.getPropertyValue(s.cssVar).trim();
      if (!raw) continue;
      if (s.field === 'stroke' || s.field === 'preset' || s.field === 'grainTint') out[s.field] = raw;
      else {
        const n = parseFloat(raw);
        if (Number.isFinite(n)) out[s.field] = n;
      }
    }
  }
  const presetId = { 柔彩: 'pastel', 灯箱: 'light', 暗场: 'darkfield', 纯色: 'plain', 暮色: 'dusk', 薄荷: 'mint' };
  const tintId = { 单色: 'mono', 暖色: 'warm', 冷色: 'cool' };
  out.preset = presetId[out.preset] || out.preset || 'pastel';
  out.grainTint = tintId[out.grainTint] || out.grainTint || 'mono';
  out.mults = [out.m1, out.m10, out.m100, out.m1000, out.m5000, out.m10000, out.m100000];
  out.zone01 = Math.min(1, Math.max(0.4, out.zone / 100));
  out.fade = Math.min(0.8, Math.max(0, (out.fadePct == null ? 18 : out.fadePct) / 100));
  cache = out;
  return out;
}

let grainKey = '';
let grainTile = null;

function hashByte(x, y) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) & 255;
}

/** 按设备像素铺的小块噪点。泡泡缩放时它留在屏幕坐标里。 */
export function grainCanvas(dpr, p) {
  const cell = Math.max(1, Math.round((p.grainSize || 1) * (dpr || 1)));
  const contrast = p.grainContrast == null ? 1 : p.grainContrast;
  const tint = p.grainTint || 'mono';
  const key = cell + '|' + contrast + '|' + tint;
  if (key === grainKey && grainTile) return grainTile;
  const cells = 48;
  const px = cells * cell;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const cg = c.getContext('2d');
  const img = cg.createImageData(px, px);
  const amp = 90 * contrast;
  for (let cy = 0; cy < cells; cy += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      const n = (hashByte(cx, cy) / 255 - 0.5) * amp;
      let r = 148 + n;
      let gv = 148 + n;
      let b = 148 + n;
      if (tint === 'warm') { r += 22; b -= 18; }
      else if (tint === 'cool') { r -= 14; b += 22; }
      r = Math.max(0, Math.min(255, r));
      gv = Math.max(0, Math.min(255, gv));
      b = Math.max(0, Math.min(255, b));
      for (let yy = 0; yy < cell; yy += 1) {
        for (let xx = 0; xx < cell; xx += 1) {
          const i = ((cy * cell + yy) * px + (cx * cell + xx)) * 4;
          img.data[i] = r;
          img.data[i + 1] = gv;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      }
    }
  }
  cg.putImageData(img, 0, 0);
  grainKey = key;
  grainTile = c;
  return c;
}

export function onLvLayout(handler) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  const run = () => {
    invalidateLvParams();
    if (typeof handler === 'function') handler();
  };
  window.addEventListener('nt-layout', run);
  return () => window.removeEventListener('nt-layout', run);
}
