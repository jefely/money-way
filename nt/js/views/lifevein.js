// 界面：脉络 tab（气泡时间流）
/**
 * 脉络视图。
 * 层：第五层 · UI
 *
 * 屏幕分成四条等高带。中间两条是事件视界：
 * 日期线从下中带下沿走到上中带上沿，这笔的气泡就从开始演到结束。
 * 上拖时间轴是正放，下拖是倒回。进度只看滚动，不看时钟。
 *
 * 四列：左缘收入/权益，中左借贷簇，中右资产簇，右缘成本/费用。
 * 不算钱：余额和事件在 core/lifevein-model.js，形变在 core/bubble-motion.js。
 */

import { buildLifeVein } from '../core/lifevein-model.js';
import { drawBubbleStage } from '../ui/bubble-stage.js';

const BASE_PPD = 72;

export function mountLifeVein(section, ctx) {
  const canvas = section.querySelector('[data-lv-canvas]');
  if (!canvas) return { render() {} };
  const g = canvas.getContext('2d');

  const view = { scrollDay: 0, zoom: 1, ready: false };
  let model = null;
  let drag = null;
  let frame = 0;

  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;
  const ppd = () => BASE_PPD * view.zoom;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    const pw = Math.floor(w * dpr);
    const ph = Math.floor(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function draw() {
    if (!model || !resize()) return;
    drawBubbleStage(g, model, {
      scrollDay: view.scrollDay,
      ppd: ppd(),
      width: W(),
      height: H(),
    });
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  function setScroll(day) {
    const hi = model ? model.days + 8 : 0;
    view.scrollDay = Math.max(-8, Math.min(hi, day));
    schedule();
  }

  canvas.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, day: view.scrollDay };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // 手指往上：内容跟着往上，更晚的日期进入视界，就是正放。
    setScroll(drag.day - (e.clientY - drag.y) / ppd());
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    setScroll(view.scrollDay - e.deltaY / ppd());
  }, { passive: false });

  for (const btn of section.querySelectorAll('[data-lv-zoom]')) {
    btn.addEventListener('click', () => {
      view.zoom = Math.max(0.35, Math.min(2.6, view.zoom * Number(btn.getAttribute('data-lv-zoom') || 1)));
      schedule();
    });
  }

  window.addEventListener('resize', schedule);

  function render() {
    model = buildLifeVein(ctx.getState());
    if (!view.ready && H() > 0) {
      const last = model.events.length
        ? model.events.reduce((m, e) => Math.max(m, e.day), 0)
        : model.todayDay;
      view.scrollDay = last;
      view.ready = true;
    }
    draw();
    ctx.setFooter('脉络 · 上拖正放，下拖倒回 · ' + model.events.length + ' 笔');
  }

  return { render };
}
