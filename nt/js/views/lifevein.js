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

import { buildLifeVein, monthLabel } from '../core/lifevein-model.js';
import { drawBubbleStage } from '../ui/bubble-stage.js';
import { pixelsPerDay } from '../core/bubble-motion.js';
import { emptyFilter, visibleIdx } from '../ui/path-filter.js';

export function mountLifeVein(section, ctx) {
  const canvas = section.querySelector('[data-lv-canvas]');
  if (!canvas) return { render() {} };
  const g = canvas.getContext('2d');

  const view = { scrollDay: 0, zoom: 1, ready: false };
  let model = null;
  let drag = null;
  let frame = 0;
  let filter = emptyFilter();
  let refit = true;
  let month = { from: '', to: '', p: 1, dir: 1, t0: 0 };

  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;
  const ppd = () => pixelsPerDay(model ? model.vspan : 1, H() || 700, view.zoom);

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
      month: monthFrame(),
      reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  }

  function monthFrame() {
    if (month.t0 && month.p < 1) {
      month.p = Math.min(1, (performance.now() - month.t0) / 280);
      if (month.p < 1) requestAnimationFrame(draw);
    }
    return month;
  }

  function syncMonth(dir) {
    if (!model) return;
    const label = monthLabel(model, view.scrollDay);
    if (!label) return;
    if (!month.to) {
      month = { from: label, to: label, p: 1, dir: dir || 1, t0: 0 };
      return;
    }
    if (label === month.to) return;
    month = { from: month.to, to: label, p: 0, dir: dir || 1, t0: performance.now() };
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  function setScroll(day) {
    const prev = view.scrollDay;
    const hi = model ? model.vspan + 3 : 0;
    view.scrollDay = Math.max(-2, Math.min(hi, day));
    syncMonth(view.scrollDay >= prev ? 1 : -1);
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

  for (const el of section.querySelectorAll('[data-lv-f]')) {
    el.addEventListener('input', () => {
      filter[el.getAttribute('data-lv-f')] = el.value;
      refit = true;
      render();
    });
  }
  const clearBtn = section.querySelector('[data-lv-clear]');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filter = emptyFilter();
      for (const el of section.querySelectorAll('[data-lv-f]')) el.value = '';
      refit = true;
      render();
    });
  }
  const rail = section.querySelector('[data-lv-rail]');
  const side = section.querySelector('[data-lv-side]');
  if (rail && side) {
    rail.addEventListener('click', () => side.classList.toggle('is-open'));
  }

  function render() {
    const st = ctx.getState();
    const txs = st.transactions || [];
    const accounts = st.accounts || [];
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const picked = visibleIdx(txs, filter, byId, accounts).map((i) => txs[i]);
    model = buildLifeVein({ accounts, transactions: picked });
    if ((!view.ready || refit) && H() > 0) {
      view.scrollDay = model.vspan / 2;
      view.ready = true;
      refit = false;
    }
    syncMonth(1);
    draw();
    ctx.setFooter('脉络 · 上拖正放，下拖倒回 · ' + model.events.length + ' 笔');
  }

  return { render };
}
