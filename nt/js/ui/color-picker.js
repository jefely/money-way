// 界面：界面参数浮层 → 取色器
/**
 * 拾色器（标准色板 + 色相条 + 已用颜色库）
 * 层：第五层 · UI
 *
 * 选色后自动算出 #rrggbb，点「复制色值」再手动贴到参数输入框。
 */

import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, normalizeHex } from '../core/color.js';

/**
 * @param {{initial?:string, library?:string[]}} [opts]
 * @returns {{close:()=>void}}
 */
export function openColorPicker(opts) {
  const o = opts || {};
  let hex = normalizeHex(o.initial);

  const initRgb = hexToRgb(hex);
  const initHsl = rgbToHsl(initRgb.r, initRgb.g, initRgb.b);
  let hue = initHsl.h;

  const mask = document.createElement('div');
  mask.className = 'nt-cpick-mask';

  const box = document.createElement('div');
  box.className = 'nt-cpick';

  const title = document.createElement('div');
  title.className = 'nt-cpick-title';
  title.textContent = '拾色器（色板 + 色相条）';

  const body = document.createElement('div');
  body.className = 'nt-cpick-body';

  const sat = document.createElement('canvas');
  sat.className = 'nt-cpick-sat';
  sat.width = 220;
  sat.height = 160;

  const hueBar = document.createElement('canvas');
  hueBar.className = 'nt-cpick-hue';
  hueBar.width = 20;
  hueBar.height = 160;

  body.appendChild(sat);
  body.appendChild(hueBar);

  const bar = document.createElement('div');
  bar.className = 'nt-cpick-bar';
  const preview = document.createElement('span');
  preview.className = 'nt-cpick-preview';
  const hexInput = document.createElement('input');
  hexInput.className = 'nt-cpick-hex';
  hexInput.type = 'text';
  hexInput.value = hex;
  bar.appendChild(preview);
  bar.appendChild(hexInput);

  const lib = document.createElement('div');
  lib.className = 'nt-cpick-lib';
  const libTitle = document.createElement('span');
  libTitle.className = 'nt-cpick-lib-title';
  libTitle.textContent = '已用颜色：';
  lib.appendChild(libTitle);

  const libColors = Array.isArray(o.library) ? o.library : [];
  for (const c of libColors) {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'nt-cpick-sw';
    sw.style.background = c;
    sw.setAttribute('aria-label', c);
    sw.title = c;
    sw.addEventListener('click', () => setHex(c));
    lib.appendChild(sw);
  }

  const foot = document.createElement('div');
  foot.className = 'nt-debug-foot';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'nt-debug-btn';
  copyBtn.textContent = '复制色值';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nt-debug-btn';
  closeBtn.textContent = '关闭';
  foot.appendChild(copyBtn);
  foot.appendChild(closeBtn);

  box.appendChild(title);
  box.appendChild(body);
  box.appendChild(bar);
  box.appendChild(lib);
  box.appendChild(foot);
  mask.appendChild(box);
  document.body.appendChild(mask);

  function setHex(h) {
    hex = normalizeHex(h);
    const rgb = hexToRgb(hex);
    preview.style.background = hex;
    hexInput.value = hex;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (hsl.s > 0.001) hue = hsl.h;
    redrawSat();
  }

  function redrawSat() {
    const ctx = sat.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(sat.width, sat.height);
    for (let y = 0; y < sat.height; y += 1) {
      const l = 1 - y / sat.height;
      for (let x = 0; x < sat.width; x += 1) {
        const c = hslToRgb(hue, x / sat.width, l);
        const i = (y * sat.width + x) * 4;
        img.data[i] = c.r;
        img.data[i + 1] = c.g;
        img.data[i + 2] = c.b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function redrawHue() {
    const ctx = hueBar.getContext('2d');
    if (!ctx) return;
    for (let y = 0; y < hueBar.height; y += 1) {
      const c = hslToRgb((y / hueBar.height) * 360, 1, 0.5);
      ctx.fillStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      ctx.fillRect(0, y, hueBar.width, 1);
    }
  }

  sat.addEventListener('click', (e) => {
    const r = sat.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    const c = hslToRgb(hue, x, 1 - y);
    setHex(rgbToHex(c.r, c.g, c.b));
  });

  hueBar.addEventListener('click', (e) => {
    const r = hueBar.getBoundingClientRect();
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    hue = y * 360;
    redrawSat();
  });

  hexInput.addEventListener('change', () => setHex(hexInput.value));

  copyBtn.addEventListener('click', () => {
    hexInput.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    if (navigator.clipboard) navigator.clipboard.writeText(hex).catch(() => {});
    copyBtn.textContent = '已复制';
    setTimeout(() => { copyBtn.textContent = '复制色值'; }, 1200);
  });

  closeBtn.addEventListener('click', () => mask.remove());

  redrawHue();
  setHex(hex);

  return { close: () => mask.remove() };
}
