// 界面：NT 悬浮输入窗的液态折射（视频四层做法）
/**
 * 四层：
 *   ① 透明 rgba 底
 *   ② 折射：高度场 → 法线 → Snell(n=1.5) → 归一化位移贴图 → feDisplacementMap
 *   ③ 高光：CSS 一圈方向性渐变环（一侧灰暗、一侧白亮）
 *   ④ 阴影：外投影
 *
 * 位移在**边缘最大、中间为 0**：高度场 h(t) 边缘最陡，求导后法线最斜，
 * 按 Snell 折射出去横向位移最大。旧版用 4t(1-t)，边缘是 0，
 * 会留一圈"不折射的硬边"——那正是白边与阶梯感的来源。
 */

const NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const MAP_CACHE = new Map();

const REFRACT = 1.5;
const BEVEL = 0.32;
const BASE = 40;
/* filter region 相对元素外扩的比例；位移贴图按同一比例加大，
 * 否则 feImage 铺满 region 时和元素错位，位移环全在元素外面。 */
const REGION_EXT = 0.2;

export const GLASS_DEFAULTS = {
  opacity: 34,
  scale: 8,
  bevel: 32,
  highlight: 60,
  shadow: 34,
  blur: 1.5,
  ring: 1.2,
  ringBlur: 0.4,
  angle: 0,
  distance: 55,
  ringAlpha: 62,
  darkRing: 34,
};
const KEYS = Object.keys(GLASS_DEFAULTS);
const PARAMS_KEY = 'nt_glass_params';

export function getGlassParams() {
  const out = { ...GLASS_DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(PARAMS_KEY) || 'null');
    if (raw) {
      for (const k of KEYS) {
        const n = Number(raw[k]);
        if (Number.isFinite(n)) out[k] = n;
      }
    }
  } catch (e) { /* ignore */ }
  return out;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function setDispScale(id, px) {
  if (!id) return;
  const disp = document.querySelector('#' + id + ' feDisplacementMap');
  if (disp) disp.setAttribute('scale', String(Math.max(0, px)));
}

function applyTo(el, params) {
  if (!el) return;
  const p = params || getGlassParams();
  el.style.setProperty('--lg-alpha', String(clamp(p.opacity / 100, 0, 1)));
  el.style.setProperty('--lg-highlight', String(clamp(p.highlight / 100, 0, 1)));
  el.style.setProperty('--lg-shadow', String(clamp(p.shadow / 100, 0, 1)));
  el.style.setProperty('--lg-blur', String(Math.max(0, Number(p.blur) || 0)) + 'px');
  /* 环宽吸附到整数物理像素：1.2 CSS px 在 125% 缩放下是 1.5 物理像素，
   * 半覆盖必然糊成两条灰线——那正是锯齿感的直接来源。 */
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const ringPx = Math.max(0, Number(p.ring) || 0);
  const ringSnapped = ringPx <= 0 ? 0 : Math.max(1, Math.round(ringPx * dpr)) / dpr;
  el.style.setProperty('--lg-ring-width', String(ringSnapped) + 'px');
  el.style.setProperty('--lg-ring-blur', String(Math.max(0, Number(p.ringBlur) || 0)) + 'px');
  el.style.setProperty('--lg-ring-alpha', String(clamp((Number(p.ringAlpha) || 0) / 100, 0, 1)));
  el.style.setProperty('--lg-dark-ring', String(clamp((Number(p.darkRing) || 0) / 100, 0, 1)));
  el.style.setProperty('--lg-ring-angle', String(Number(p.angle) || 0) + 'deg');
  const near = clamp((Number(p.distance == null ? 55 : p.distance)) / 100, 0, 1);
  el.style.setProperty('--lg-ring-min', String(1 - near * 0.55));

  /* padding 四边从运行态读，用于把内缩层顶回 border-box */
  try {
    const cs = window.getComputedStyle(el);
    el.style.setProperty('--lg-pad-t', cs.paddingTop);
    el.style.setProperty('--lg-pad-r', cs.paddingRight);
    el.style.setProperty('--lg-pad-b', cs.paddingBottom);
    el.style.setProperty('--lg-pad-l', cs.paddingLeft);
  } catch (e) { /* ignore */ }

  /* 折射环宽度改变要重建贴图（形状变了），只改 scale 不用。 */
  if (el.dataset.lgBevel !== String(p.bevel)) rebuild(el, p);
  else setDispScaleFor(el, p);
}

function setDispScaleFor(el, p) {
  const px = Math.max(0, Number(p.scale) || 0);
  const base = Number(el.dataset.lgBase) || BASE;
  const openBase = Number(el.dataset.lgOpenBase) || BASE;
  setDispScale(el.dataset.lgId, px * (base / BASE));
  setDispScale(el.dataset.lgOpenId, px * (openBase / BASE));
}

/** 按当前 bevel 重建贴图与滤镜（保留 id / 尺寸）。 */
function rebuild(el, p) {
  if (!el.dataset.lgId) return;
  const o = p || getGlassParams();
  const bevel = clamp((Number(o.bevel) || 32) / 100, 0.04, 0.6);
  const w = Number(el.dataset.lgW) || 54;
  const h = Number(el.dataset.lgH) || 54;
  const radius = Number(el.dataset.lgR) || Math.min(w, h) / 2;
  try {
    makeFilter(el.dataset.lgId, buildMap(w, h, radius, bevel), 0);
    const ow = Number(el.dataset.lgOpenW) || 0;
    const oh = Number(el.dataset.lgOpenH) || 0;
    if (ow > 0 && el.dataset.lgOpenId) {
      const orad = Number(el.dataset.lgOpenR) || Math.min(ow, oh) / 2;
      makeFilter(el.dataset.lgOpenId, buildMap(ow, oh, orad, bevel), 0);
    }
    el.dataset.lgBevel = String(o.bevel);
    setDispScaleFor(el, o);
  } catch (e) { /* ignore */ }
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

function sdfRoundRect(px, py, w, h, r) {
  const qx = Math.abs(px - w / 2) - (w / 2 - r);
  const qy = Math.abs(py - h / 2) - (h / 2 - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** 高度场斜率：t=0 最外沿最陡，t=1 进平面为 0 */
function heightSlope(t) {
  return (Math.PI / 2) * Math.cos((Math.PI / 2) * t);
}

/**
 * 位移贴图：R 横、G 纵、128 = 0。
 * 先算物理偏移，再按全场最大值归一化到 [-1,1]，强度完全交给 scale。
 * 贴图**连 filter region 一起画**（元素形状在中间 1/1.4 处）：
 * feImage 默认铺满 region，按元素尺寸出图会被拉伸，位移环跑出元素外。
 */
export function buildMap(w, h, radius, bevelRatio) {
  const bev = Number(bevelRatio) || BEVEL;
  const key = ['v4', w, h, radius, bev, REFRACT, REGION_EXT].join('|');
  if (MAP_CACHE.has(key)) return MAP_CACHE.get(key);

  const rw = w * (1 + 2 * REGION_EXT);
  const rh = h * (1 + 2 * REGION_EXT);
  const sc = Math.min(2, 512 / Math.max(rw, rh));
  const mw = Math.max(24, Math.round(rw * sc));
  const mh = Math.max(24, Math.round(rh * sc));
  const canvas = document.createElement('canvas');
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(mw, mh);
  const data = img.data;

  const bevel = Math.max(2, Math.min(w, h) * bev);
  const eps = Math.max(0.2, Math.min(rw / mw, rh / mh) * 0.75);
  const vec = new Float32Array(mw * mh * 2);
  let maxLen = 1e-6;

  for (let y = 0; y < mh; y += 1) {
    for (let x = 0; x < mw; x += 1) {
      const px = ((x + 0.5) / mw) * rw - w * REGION_EXT;
      const py = ((y + 0.5) / mh) * rh - h * REGION_EXT;
      const d = -sdfRoundRect(px, py, w, h, radius);
      const i = (y * mw + x) * 2;
      if (d <= 0) { vec[i] = 0; vec[i + 1] = 0; continue; }

      const t = Math.min(1, d / bevel);
      const th1 = Math.atan(heightSlope(t));
      const sin2 = Math.min(1, Math.sin(th1) / REFRACT);
      const th2 = Math.asin(sin2);
      let amount = Math.tan(th1 - th2);
      if (!Number.isFinite(amount) || amount > 6) amount = 6;

      const gx = (sdfRoundRect(px + eps, py, w, h, radius)
        - sdfRoundRect(px - eps, py, w, h, radius)) / (2 * eps);
      const gy = (sdfRoundRect(px, py + eps, w, h, radius)
        - sdfRoundRect(px, py - eps, w, h, radius)) / (2 * eps);
      const len = Math.hypot(gx, gy) || 1;
      const vx = (gx / len) * amount;
      const vy = (gy / len) * amount;
      vec[i] = vx;
      vec[i + 1] = vy;
      const m = Math.hypot(vx, vy);
      if (m > maxLen) maxLen = m;
    }
  }

  for (let k = 0; k < mw * mh; k += 1) {
    const o4 = k * 4;
    data[o4] = Math.round(clamp(128 + (vec[k * 2] / maxLen) * 127, 1, 255));
    data[o4 + 1] = Math.round(clamp(128 + (vec[k * 2 + 1] / maxLen) * 127, 1, 255));
    data[o4 + 2] = 128;
    data[o4 + 3] = 255;
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

/** 滤镜链只有两步：贴图 → 位移。高光交给 CSS 的方向性环。 */
function makeFilter(id, mapUrl, scale) {
  const svg = defsRoot();
  const old = document.getElementById(id);
  if (old) old.remove();
  const filter = document.createElementNS(NS, 'filter');
  filter.id = id;
  filter.setAttribute('x', (-REGION_EXT * 100) + '%');
  filter.setAttribute('y', (-REGION_EXT * 100) + '%');
  filter.setAttribute('width', ((1 + 2 * REGION_EXT) * 100) + '%');
  filter.setAttribute('height', ((1 + 2 * REGION_EXT) * 100) + '%');
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
  disp.setAttribute('result', 'refracted');
  filter.appendChild(disp);

  const blur = document.createElementNS(NS, 'feGaussianBlur');
  blur.setAttribute('in', 'refracted');
  blur.setAttribute('stdDeviation', '0.35');
  filter.appendChild(blur);

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
 * @param {{width?:number,height?:number,radius?:number,
 *          openWidth?:number,openHeight?:number,openRadius?:number}} [opts]
 */
export function installLiquidGlass(el, opts) {
  if (!el || el.dataset.liquidGlass === '1') return false;
  if (!supportsLiquid()) {
    el.classList.add('liquid-glass-fallback');
    return false;
  }
  try {
    const o = opts || {};
    const rect = el.getBoundingClientRect();
    const w = Math.round(o.width || rect.width || 54);
    const h = Math.round(o.height || rect.height || 54);
    const radius = o.radius == null ? Math.min(w, h) / 2 : o.radius;
    const ow = Math.round(o.openWidth || 360);
    const oh = Math.round(o.openHeight || h);
    const orad = o.openRadius == null ? Math.min(ow, oh) / 2 : o.openRadius;

    const p = getGlassParams();
    const bevel = clamp((Number(p.bevel) || 32) / 100, 0.04, 0.6);
    const map = buildMap(w, h, radius, bevel);
    makeFilter('nt-lg-composer', map, p.scale * (Math.min(w, h) / BASE));
    const openMap = buildMap(ow, oh, orad, bevel);
    makeFilter('nt-lg-composer-open', openMap, p.scale * (Math.min(ow, oh) / BASE));

    el.dataset.liquidGlass = '1';
    el.dataset.lgId = 'nt-lg-composer';
    el.dataset.lgOpenId = 'nt-lg-composer-open';
    el.dataset.lgBase = String(Math.min(w, h));
    el.dataset.lgOpenBase = String(Math.min(ow, oh));
    el.dataset.lgW = String(w);
    el.dataset.lgH = String(h);
    el.dataset.lgR = String(radius);
    el.dataset.lgOpenW = String(ow);
    el.dataset.lgOpenH = String(oh);
    el.dataset.lgOpenR = String(orad);
    el.dataset.lgBevel = String(p.bevel);
    el.style.setProperty('--lg-radius', radius + 'px');
    el.classList.add('liquid-glass');
    el.style.setProperty('--lg-filter', 'url(#nt-lg-composer)');
    el.style.setProperty('--lg-filter-open', 'url(#nt-lg-composer-open)');
    applyTo(el, p);
    /* 展开 / 收起会改 padding，动画结束后重新量一次 */
    el.addEventListener('transitionend', (ev) => {
      if (ev.target === el) applyTo(el);
    });
    /* DPR 变了（换屏 / 系统缩放）要重算环宽的物理像素整数倍 */
    if (typeof window !== 'undefined' && !el.dataset.lgDprWatch) {
      el.dataset.lgDprWatch = '1';
      let lastDpr = window.devicePixelRatio || 1;
      window.addEventListener('resize', () => {
        const d = window.devicePixelRatio || 1;
        if (d !== lastDpr) { lastDpr = d; applyTo(el); }
      });
    }
    return true;
  } catch (e) {
    el.classList.add('liquid-glass-fallback');
    return false;
  }
}
