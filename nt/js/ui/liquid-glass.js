// 界面：NT 悬浮输入窗的液态折射（第一版视频做法）
/**
 * 只做视频里的折射链：
 *   圆角形状 → 法线/位移贴图（R/G=横纵偏移，128=0）
 *   → feImage + feDisplacementMap 采样背后内容
 *   → backdrop-filter: url(#filter)
 *
 * 收起 54×54、展开 360×54 各用一张贴图，避免把圆形贴图拉成椭圆。
 */

const NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const MAP_CACHE = new Map();
const PARAMS_KEY = 'nt_glass_params';
export const GLASS_DEFAULTS = { opacity: 12, scale: 18, highlight: 55, shadow: 38, blur: 0 };

export function getGlassParams() {
  const out = { ...GLASS_DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(PARAMS_KEY) || 'null');
    if (raw) {
      for (const k of Object.keys(out)) {
        const n = Number(raw[k]);
        if (Number.isFinite(n)) out[k] = n;
      }
    }
  } catch (e) { /* ignore */ }
  return out;
}

function applyTo(el, params) {
  if (!el) return;
  const p = params || getGlassParams();
  el.style.setProperty('--lg-alpha', String(Math.max(0, Math.min(1, p.opacity / 100))));
  el.style.setProperty('--lg-highlight', String(Math.max(0, Math.min(1, p.highlight / 100))));
  el.style.setProperty('--lg-shadow', String(Math.max(0, Math.min(1, p.shadow / 100))));
  el.style.setProperty('--lg-blur', String(Math.max(0, Number(p.blur) || 0)) + 'px');
  const ids = [el.dataset.lgId, el.dataset.lgOpenId].filter(Boolean);
  ids.forEach((id) => {
    const disp = document.querySelector('#' + id + ' feDisplacementMap');
    if (disp) disp.setAttribute('scale', String(Math.max(0, Number(p.scale) || 0)));
  });
}

export function setGlassParams(patch) {
  const next = Object.assign(getGlassParams(), patch || {});
  try { localStorage.setItem(PARAMS_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  document.querySelectorAll('[data-liquid-glass="1"]').forEach((el) => applyTo(el, next));
  return next;
}

if (typeof window !== 'undefined') {
  window.addEventListener('nt-glass-params', () => {
    document.querySelectorAll('[data-liquid-glass="1"]').forEach((el) => applyTo(el, getGlassParams()));
  });
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function sdfRoundRect(px, py, w, h, r) {
  const qx = Math.abs(px - w / 2) - (w / 2 - r);
  const qy = Math.abs(py - h / 2) - (h / 2 - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

export function buildMap(w, h, radius) {
  const key = [w, h, radius].join('|');
  if (MAP_CACHE.has(key)) return MAP_CACHE.get(key);
  const maxSide = 96;
  const mw = Math.max(24, Math.round(maxSide * (w / Math.max(w, h))));
  const mh = Math.max(24, Math.round(maxSide * (h / Math.max(w, h))));
  const canvas = document.createElement('canvas');
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(mw, mh);
  const data = img.data;
  const bevel = Math.max(2.5, Math.min(w, h) * 0.3);
  const eps = 0.6;

  for (let y = 0; y < mh; y += 1) {
    const py = ((y + 0.5) / mh) * h;
    for (let x = 0; x < mw; x += 1) {
      const px = ((x + 0.5) / mw) * w;
      const d = -sdfRoundRect(px, py, w, h, radius);
      let r = 128;
      let g = 128;
      if (d > 0) {
        const gx = (sdfRoundRect(px + eps, py, w, h, radius)
          - sdfRoundRect(px - eps, py, w, h, radius)) / (2 * eps);
        const gy = (sdfRoundRect(px, py + eps, w, h, radius)
          - sdfRoundRect(px, py - eps, w, h, radius)) / (2 * eps);
        const len = Math.hypot(gx, gy) || 1;
        const t = clamp(d / bevel, 0, 1);
        const slope = 4 * t * (1 - t);
        const k = 127 * slope;
        r = clamp(Math.round(128 + (gx / len) * k), 0, 255);
        g = clamp(128 + (gy / len) * k, 0, 255);
      }
      const i = (y * mw + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/png');
  MAP_CACHE.set(key, url);
  return url;
}

function defsRoot() {
  let svg = document.getElementById('nt-glass-defs');
  if (!svg) {
    svg = document.createElementNS(NS, 'svg');
    svg.id = 'nt-glass-defs';
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden';
    document.body.appendChild(svg);
  }
  return svg;
}

function makeFilter(id, mapUrl, scale) {
  const svg = defsRoot();
  const old = document.getElementById(id);
  if (old) old.remove();
  const filter = document.createElementNS(NS, 'filter');
  filter.id = id;
  filter.setAttribute('x', '-30%');
  filter.setAttribute('y', '-30%');
  filter.setAttribute('width', '160%');
  filter.setAttribute('height', '160%');
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const img = document.createElementNS(NS, 'feImage');
  img.setAttribute('href', mapUrl);
  img.setAttributeNS(XLINK, 'xlink:href', mapUrl);
  img.setAttribute('preserveAspectRatio', 'none');
  img.setAttribute('result', 'map');
  filter.appendChild(img);

  const disp = document.createElementNS(NS, 'feDisplacementMap');
  disp.setAttribute('in', 'SourceGraphic');
  disp.setAttribute('in2', 'map');
  disp.setAttribute('scale', String(scale));
  disp.setAttribute('xChannelSelector', 'R');
  disp.setAttribute('yChannelSelector', 'G');
  filter.appendChild(disp);

  svg.appendChild(filter);
}

function supportsLiquid() {
  if (typeof CSS === 'undefined' || !CSS.supports) return false;
  if (!CSS.supports('backdrop-filter', 'url(#nt-glass-probe)')) return false;
  const cores = Number(navigator.hardwareConcurrency) || 8;
  if (cores <= 4) return false;
  try {
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return false;
  } catch (e) { /* ignore */ }
  return true;
}

/**
 * @param {HTMLElement} el .nt-composer
 */
export function installLiquidGlass(el) {
  if (!el || el.dataset.liquidGlass === '1') return false;
  if (!supportsLiquid()) {
    el.classList.add('liquid-glass-fallback');
    return false;
  }
  try {
    const map = buildMap(54, 54, 27);
    makeFilter('nt-lg-composer', map, 18);
    const openMap = buildMap(360, 54, 27);
    makeFilter('nt-lg-composer-open', openMap, 18);
    el.dataset.liquidGlass = '1';
    el.dataset.lgId = 'nt-lg-composer';
    el.dataset.lgOpenId = 'nt-lg-composer-open';
    el.classList.add('liquid-glass');
    el.style.setProperty('--lg-filter', 'url(#nt-lg-composer)');
    el.style.setProperty('--lg-filter-open', 'url(#nt-lg-composer-open)');
    applyTo(el, getGlassParams());
    return true;
  } catch (e) {
    el.classList.add('liquid-glass-fallback');
    return false;
  }
}
