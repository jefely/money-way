// 界面：LifeVein tab（时间流里的泡 · Canvas 渲染）
/**
 * LifeVein 视图
 * 层：第五层 · UI
 *
 * **三根轴线，每根一个固定基准位置，左右两侧各吸附一种会计类型**（3 × 2 = 6 类）：
 *   左轴 收入（左）/ 权益（右） · 中轴 负债（左）/ 资产（右） · 右轴 费用（左）/ 成本（右）
 *
 * 一张静态的时间图 + 一个视口：
 *   · 停域（屏幕偏上的绿线）=「现在」；存量泡驻留成一串，同侧从上往下排；
 *   · 流水泡钉在时间里，从下面升上来，穿过停域继续往上；
 *   · 线连着两端，只在发生日前后出现，越近越亮 —— 那就是「注入」；
 *   · 所有泡一直存在，滚动只裁视口，反向拖能退回去。
 *
 * 不算钱：余额、事件、轴与侧全在 core/lifevein-model.js。
 */

import { buildLifeVein, balanceAt, AXES } from '../core/lifevein-model.js';

const STOP = 0.26;        // 停域线在屏幕高度的 26%
const BASE_PPD = 64;      // 一天多少像素（zoom = 1）

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/** 定值统一：**1 元 = 1 平方像素**（面积映射，乘 zoom²）。r = √(金额/π) × zoom */
function radiusOf(v, zoom) {
  const n = Math.abs(Number(v) || 0);
  if (n < 0.005) return 1.5;                 // 归零 = 质点，不删除
  return Math.max(1, Math.sqrt(n / Math.PI) * zoom);
}

function shortMoney(v) {
  const n = Math.abs(Math.round(v));
  const sign = v < 0 ? '−' : '';
  if (n >= 1e6) return sign + '¥' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return sign + '¥' + Math.round(n / 1e3) + 'k';
  if (n >= 1e3) return sign + '¥' + (n / 1e3).toFixed(1) + 'k';
  return sign + '¥' + n;
}

const LANE_COLORS = ['#12b76a', '#0e8a57', '#ef4444', '#3b5bdb', '#e8890c', '#b8860b'];

export function mountLifeVein(section, ctx) {
  const canvas = section.querySelector('[data-lv-canvas]');
  if (!canvas) return { render() {} };
  const g = canvas.getContext('2d');

  const view = { scrollDay: 0, zoom: 0.35, ready: false };
  let model = null;
  let drag = null;

  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;
  const stopY = () => H() * STOP;
  const ppd = () => BASE_PPD * view.zoom;
  const yOf = (day) => stopY() + (day - view.scrollDay) * ppd();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  /** 三根轴的固定基准位置 */
  function axisX(axis) {
    const t = AXES[axis] || AXES[1];
    return W() * t.x;
  }

  function sideOf(lane) {
    return lane % 2 === 0 ? -1 : 1;
  }

  /** 一进来按「最挤的那一侧」算缩放：让那一串泡纵向排得下 */
  function fitZoom(now) {
    const avail = H() * 0.66;
    const groups = new Map();
    for (const a of model.accounts) {
      if (!a.stock) continue;
      const v = Math.abs(balanceAt(model, a.id, now));
      if (v < 0.5) continue;
      if (!groups.has(a.lane)) groups.set(a.lane, []);
      groups.get(a.lane).push(Math.sqrt(v / Math.PI));
    }
    let z = 1;
    for (const g of groups.values()) {
      const sumR = g.reduce((t, x) => t + x, 0);
      const need = (avail - g.length * 6) / Math.max(1, 2 * sumR);
      if (need < z) z = need;
    }
    return Math.max(0.02, Math.min(1, z));
  }

  /**
   * 存量泡布局：**同一侧的泡沿轴线从上往下排**（磁吸），彼此不重叠（排斥）。
   * x 由「轴基准 ± 自身半径」决定 —— 大泡离轴远，小泡贴着轴。
   */
  function layoutStocks(now) {
    const groups = new Map();
    for (const a of model.accounts) {
      if (!a.stock) continue;
      const v = balanceAt(model, a.id, now);
      if (Math.abs(v) < 0.5) continue;          // 有存量才有泡
      if (!groups.has(a.lane)) groups.set(a.lane, []);
      groups.get(a.lane).push({ a, v });
    }

    const out = new Map();
    const gap = 6;
    for (const [lane, group] of groups) {
      const axis = Math.floor(lane / 2);
      const side = sideOf(lane);
      group.sort((p, q) => p.a.slot - q.a.slot);
      let total = 0;
      for (const s of group) total += 2 * radiusOf(s.v, view.zoom) + gap;
      let y = stopY() - total / 2;
      for (const s of group) {
        const r = radiusOf(s.v, view.zoom);
        y += r;
        out.set(s.a.id, { x: axisX(axis) + side * (r + 7), y, r, v: s.v, axis, side });
        y += r + gap;
      }
    }
    return out;
  }

  function draw() {
    if (!model || !resize()) return;
    const w = W();
    const h = H();
    const now = view.scrollDay;
    g.clearRect(0, 0, w, h);

    /* 三根轴 */
    g.font = '10px sans-serif';
    g.textAlign = 'center';
    for (let i = 0; i < AXES.length; i += 1) {
      const x = axisX(i);
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.setLineDash([4, 7]);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(185,178,208,0.30)';
      g.fillText(AXES[i].name, x, 15);
    }

    /* 日期刻度 */
    g.textAlign = 'left';
    g.font = '9px monospace';
    const top = now - stopY() / ppd();
    const bottom = now + (h - stopY()) / ppd();
    for (let d = Math.max(0, Math.floor(top)); d <= Math.min(model.days - 1, Math.ceil(bottom)); d += 1) {
      const y = yOf(d);
      if (y < 22 || y > h - 22) continue;
      const dt = new Date(Date.parse(model.startIso + 'T00:00:00') + d * 86400000);
      g.fillStyle = 'rgba(139,132,168,0.40)';
      g.fillText(String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'), 3, y + 3);
      g.strokeStyle = 'rgba(255,255,255,0.03)';
      g.beginPath(); g.moveTo(24, y); g.lineTo(w, y); g.stroke();
    }

    const stocks = layoutStocks(now);

    /* 线：只在发生日前后出现 */
    const WIN = 1.4;
    for (const e of model.events) {
      if (e.day > now + 0.02) continue;
      const age = now - e.day;
      if (age > WIN) continue;
      const fade = 1 - age / WIN;
      const a = model.accounts.find((x) => x.id === e.fromId);
      const b = model.accounts.find((x) => x.id === e.toId);
      if (!a || !b || a.lane < 0 || b.lane < 0) continue;

      const fa = stocks.get(a.id);
      const fb = stocks.get(b.id);
      if (!fa && (yOf(e.day) < -24 || yOf(e.day) > h + 24)) continue;
      if (!fb && (yOf(e.day) < -24 || yOf(e.day) > h + 24)) continue;

      const fx = fa ? fa.x : axisX(a.axis) + a.side * 10;
      const tx2 = fb ? fb.x : axisX(b.axis) + b.side * 10;
      const fy = fa ? fa.y : yOf(e.day);
      const ty = fb ? fb.y : yOf(e.day);
      const fr = fa ? fa.r : radiusOf(e.amount, view.zoom);
      const trr = fb ? fb.r : radiusOf(e.amount, view.zoom);
      if (Math.max(fy, ty) < -60 || Math.min(fy, ty) > h + 60) continue;

      const dist = Math.abs(fy - ty);
      const glow = Math.max(0, 1 - dist / 200);
      const color = LANE_COLORS[a.lane];
      const dir = tx2 > fx ? 1 : -1;
      const x1 = fx + dir * fr;
      const x2 = tx2 - dir * trr;
      const bend = Math.min(80, Math.max(18, Math.abs(x2 - x1) * 0.5));

      g.save();
      g.shadowColor = rgba(color, 0.85);
      g.shadowBlur = 12 * glow * fade;
      g.strokeStyle = rgba(color, (0.14 + 0.58 * glow) * fade);
      g.lineWidth = (1 + 1.6 * glow) * (0.45 + 0.55 * fade);
      g.beginPath();
      g.moveTo(x1, fy);
      g.bezierCurveTo(x1 + dir * bend, fy, x2 - dir * bend, ty, x2, ty);
      g.stroke();
      g.restore();
    }

    /* 流水泡：收入 / 费用 / 成本，钉在时间上；同一天同一侧多笔横向错开 */
    const seq = new Map();
    for (const e of model.events) {
      for (const side of ['fromId', 'toId']) {
        const acc = model.accounts.find((x) => x.id === e[side]);
        if (!acc || acc.stock) continue;
        const y = yOf(e.day);
        if (y < -50 || y > h + 50) continue;
        const key = acc.lane + '|' + e.day;
        const k = seq.get(key) || 0;
        seq.set(key, k + 1);
        const r = radiusOf(e.amount, view.zoom);
        const x = axisX(acc.axis) + acc.side * (r + 7 + (k % 3) * 13);
        const near = Math.max(0, 1 - Math.abs(y - stopY()) / 160);
        const fut = e.day > now ? 0.42 : 1;
        const color = LANE_COLORS[acc.lane];

        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = rgba(color, (0.16 + 0.30 * near) * fut);
        g.fill();
        g.strokeStyle = rgba(color, (0.45 + 0.45 * near) * fut);
        g.lineWidth = 1;
        g.stroke();
      }
    }

    /* 存量泡 */
    for (const acc of model.accounts) {
      const pos = stocks.get(acc.id);
      if (!pos) continue;
      const color = LANE_COLORS[pos.axis * 2 + (pos.side > 0 ? 1 : 0)];

      g.save();
      g.shadowColor = rgba(color, 0.55);
      g.shadowBlur = 10;
      g.beginPath();
      g.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
      g.fillStyle = rgba(color, 0.26);
      g.fill();
      g.restore();

      g.beginPath();
      g.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
      g.strokeStyle = rgba(color, 0.85);
      g.lineWidth = 1.1;
      g.stroke();

      if (pos.r >= 9) {
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.font = Math.max(7, Math.min(9, pos.r * 0.4)) + 'px sans-serif';
        g.textAlign = 'center';
        g.fillText(acc.name.slice(0, 3), pos.x, pos.y + 3);
      }
      if (pos.r >= 15) {
        g.fillStyle = rgba(color, 0.85);
        g.font = '9px monospace';
        g.textAlign = 'center';
        g.fillText(shortMoney(pos.v), pos.x, pos.y + pos.r + 10);
      }
    }

    /* 停域线 */
    g.strokeStyle = 'rgba(18,183,106,0.30)';
    g.setLineDash([2, 5]);
    g.beginPath(); g.moveTo(0, stopY()); g.lineTo(w, stopY()); g.stroke();
    g.setLineDash([]);
  }

  function setScroll(day) {
    const hi = model ? Math.max(0, model.days - 1) : 0;
    view.scrollDay = Math.max(0, Math.min(hi, day));
    draw();
  }

  canvas.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, day: view.scrollDay };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
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
      view.zoom = Math.max(0.02, Math.min(3, view.zoom * Number(btn.getAttribute('data-lv-zoom') || 1)));
      draw();
    });
  }

  window.addEventListener('resize', draw);

  function render() {
    model = buildLifeVein(ctx.getState());
    if (!view.ready) {
      const last = model.events.length ? Math.max(...model.events.map((e) => e.day)) : model.todayDay;
      view.scrollDay = Math.min(model.todayDay, last + 1);
      view.zoom = fitZoom(view.scrollDay);     // 让最挤的那一侧排得下
      view.ready = true;
    }
    draw();
    const stocksN = model.accounts.filter((a) => a.stock).length;
    ctx.setFooter(`LifeVein · ${stocksN} 个存量节点 / ${model.events.length} 笔流水 · ${model.startIso} ~ ${model.endIso}`);
  }

  return { render };
}
