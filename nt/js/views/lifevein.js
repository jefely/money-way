// 界面：脉络 tab（气泡时间流）
/**
 * 脉络视图。
 * 层：第五层 · UI
 *
 * 屏幕分成四条等高带。中间两条是事件视界：
 * 日期线从下中带下沿走到上中带上沿，这笔的气泡就从开始演到结束。
 * 上拖时间轴是正放，下拖是倒回。进度只看滚动，不看时钟。
 *
 * 窗口左缘停负债和权益，收入从左缘出现；中间只停资产；右缘是费用和成本。
 * 一屏天数把画布高度锁成日历日。不算钱：余额在 core/lifevein-model.js。
 */

import { buildLifeVein, monthLabel } from '../core/lifevein-model.js';
import { playDay, playLayout } from '../core/bubble-play.js';
import { drawBubbleStage } from '../ui/bubble-stage.js';
import { pixelsPerDay } from '../core/bubble-motion.js';
import { readLvParams, onLvLayout } from '../ui/lv-params.js';
import { emptyFilter, visibleIdx } from '../ui/path-filter.js';

export function mountLifeVein(section, ctx) {
  const canvas = section.querySelector('[data-lv-canvas]');
  if (!canvas) return { render() {} };
  const g = canvas.getContext('2d');
  onLvLayout(() => schedule());

  const view = { scrollDay: 0, ready: false };
  const cam = { s: 1, x: 0, y: 0 };
  const user = { s: 1, x: 0, y: 0 };
  let panMode = false;
  let needFit = true;
  let zoomed = false;
  let laid = '';
  let model = null;
  let drag = null;
  let frame = 0;
  let filter = emptyFilter();
  let refit = true;
  let month = { from: '', to: '', p: 1, dir: 1, t0: 0 };

  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;
  const ppd = () => {
    const lv = readLvParams();
    const h = H() || 700;
    const d = Number(lv.daysPer);
    if (d > 0) return h / d;
    return pixelsPerDay(model ? model.vspan : 1, h, 1, lv.ppd);
  };
  const play = () => playLayout(model, ppd(), H() || 700, readLvParams().windowPx);

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
    const key = Math.round(W()) + 'x' + Math.round(H());
    if (key !== laid) {
      if (!zoomed) needFit = true;
      laid = key;
    }
    const lv = readLvParams();
    const shot = {
      scrollDay: view.scrollDay,
      ppd: ppd(),
      width: W(),
      height: H(),
      month: monthFrame(),
      cam: needFit ? null : cam,
      fit: needFit,
      reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      zone: lv.zone01,
      gap: lv.gap,
      repel: lv.repel,
      mults: lv.mults,
      dMin: lv.dMin,
      dMax: lv.dMax,
      dMaxOn: lv.dMaxOn,
      lv,
      fade: lv.fade,
      windowPx: lv.windowPx,
      dayGap: lv.dayGap,
      xLiab: lv.xLiab,
      xAsset: lv.xAsset,
      insetL: lv.insetL,
      insetR: lv.insetR,
      daysPer: lv.daysPer,
      playMarks: Number(lv.daysPer) > 0 ? [] : play().marks,
      viewZoom: { s: user.s, x: user.x, y: user.y },
    };
    drawBubbleStage(g, model, shot);
    if (needFit && shot.cam) {
      cam.s = shot.cam.s;
      cam.x = shot.cam.x;
      cam.y = shot.cam.y;
      needFit = false;
    }
  }

  function zoomAt(px, py, factor) {
    const next = Math.max(0.015, Math.min(8, user.s * factor));
    const wx = (px - W() / 2 - user.x) / user.s + W() / 2;
    const wy = (py - H() / 2 - user.y) / user.s + H() / 2;
    zoomed = true;
    user.s = next;
    user.x = px - W() / 2 - (wx - W() / 2) * next;
    user.y = py - H() / 2 - (wy - H() / 2) * next;
    schedule();
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
    const d = Number(readLvParams().daysPer);
    const lay = play();
    const label = d > 0
      ? monthLabel(model, view.scrollDay, view.scrollDay)
      : monthLabel(model, view.scrollDay, lay.marks.length ? playDay(lay.marks, view.scrollDay) : null);
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
    const d = model ? Number(readLvParams().daysPer) : 0;
    const hi = model ? (d > 0 ? model.days + 1 : play().playSpan + 2) : 0;
    view.scrollDay = Math.max(-2, Math.min(hi, day));
    syncMonth(view.scrollDay >= prev ? 1 : -1);
    schedule();
  }

  const pts = new Map();
  let pinch = null;
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    if (pts.size >= 2) {
      drag = null;
      const [a, b] = [...pts.values()];
      pinch = {
        d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
        s: user.s, x: user.x, y: user.y,
      };
      return;
    }
    if (panMode) drag = { pan: true, x: e.clientX, y: e.clientY, cx: user.x, cy: user.y };
    else drag = { y: e.clientY, day: view.scrollDay };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const p = local({ clientX: pinch.mx, clientY: pinch.my });
      user.s = pinch.s;
      user.x = pinch.x;
      user.y = pinch.y;
      zoomAt(p.x, p.y, d / pinch.d);
      user.x += mx - pinch.mx;
      user.y += my - pinch.my;
      return;
    }
    if (!drag) return;
    if (drag.pan) {
      user.x = drag.cx + (e.clientX - drag.x);
      user.y = drag.cy + (e.clientY - drag.y);
      schedule();
      return;
    }
    // 手指往上：更晚的日期进入，正放。
    const sens = readLvParams().scrub == null ? 0.6 : readLvParams().scrub;
    setScroll(drag.day - (e.clientY - drag.y) / ppd() * sens);
  });
  const end = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!pts.size) drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0014));
  }, { passive: false });

  for (const btn of section.querySelectorAll('[data-lv-zoom]')) {
    btn.addEventListener('click', () => {
      const z = Number(btn.getAttribute('data-lv-zoom') || 1);
      if (z === 1) {
        zoomed = false; user.s = 1; user.x = 0; user.y = 0; needFit = true; schedule(); return;
      }
      zoomAt(W() / 2, H() / 2, z);
    });
  }
  const panBtn = section.querySelector('[data-lv-pan]');
  if (panBtn) {
    panBtn.addEventListener('click', () => {
      panMode = !panMode;
      panBtn.classList.toggle('is-on', panMode);
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
      const d = Number(readLvParams().daysPer);
      view.scrollDay = d > 0 ? (model.todayDay || 0) : model.vspan / 2;
      view.ready = true;
      refit = false;
    }
    syncMonth(1);
    draw();
    ctx.setFooter('脉络 · 上拖正放，下拖倒回 · ' + (model.txCount || 0) + ' 笔');
  }

  return { render };
}
