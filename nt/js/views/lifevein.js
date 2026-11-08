// 界面：LifeVein tab（时间流里的泡 · Canvas 渲染）
/**
 * LifeVein 视图
 * 层：第五层 · UI
 *
 * 一张静态的时间图 + 一个视口：
 *   · 停域（屏幕偏上的绿线）= 「现在」；存量泡驻留成一条带，同泳道从上往下排；
 *   · 流水泡钉在时间里，从下面（未来）升上来，穿过停域继续往上（历史）；
 *   · 线连着两端，被拉长/压短，越接近停域光晕越亮 —— 那就是「注入」；
 *   · 所有泡一直存在，滚动只裁视口，反向拖能退回去。
 *
 * 不算钱：余额、事件、泳道全在 core/lifevein-model.js。
 */

import { buildLifeVein, balanceAt, LANES } from '../core/lifevein-model.js';

const STOP = 0.24;        // 停域线在屏幕高度的 24%
const BASE_PPD = 64;      // 每天多少像素（1×）
const ZONE_H = 0.26;      // 停域带的可用高度（占屏高）

const LANE_COLORS = ['#9ca3af', '#12b76a', '#ef4444', '#3b5bdb', '#e8890c', '#b8860b'];
const MAXV = 12000;

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function radiusOf(v, cap, maxV) {
  const n = Math.abs(Number(v) || 0);
  if (n < 0.005) return 2;                       // 归零 = 质点，不是删除
  const lo = 5;                                  // 下限抬到 5：小钱也看得出在变大变小
  const hi = Math.max(lo + 2, cap);
  const k = Math.sqrt(Math.min(1, n / Math.max(1, maxV || MAXV)));
  return lo + (hi - lo) * k;
}

/** 金额简写：¥1.2k / ¥12k / ¥1.2M */
function shortMoney(v) {
  const n = Math.abs(Math.round(v));
  const sign = v < 0 ? '−' : '';
  if (n >= 1e6) return sign + '¥' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return sign + '¥' + Math.round(n / 1e3) + 'k';
  if (n >= 1e3) return sign + '¥' + (n / 1e3).toFixed(1) + 'k';
  return sign + '¥' + n;
}

export function mountLifeVein(section, ctx) {
  const canvas = section.querySelector('[data-lv-canvas]');
  if (!canvas) return { render() {} };
  const g = canvas.getContext('2d');

  const view = { scrollDay: 0, ppd: BASE_PPD, ready: false };
  let model = null;
  let drag = null;

  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;
  const stopY = () => H() * STOP;
  const yOf = (day) => stopY() + (day - view.scrollDay) * view.ppd;

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

  function laneBox(lane) {
    const total = LANES.reduce((s, l) => s + l.w, 0);
    const pad = 16;
    const usable = W() - pad * 2;
    let x = pad;
    for (let i = 0; i < lane; i += 1) x += (LANES[i].w / total) * usable;
    const w = (LANES[lane].w / total) * usable;
    return { x: x + w / 2, w };
  }

  /**
   * 存量泡的布局：按泳道分组，**每类给 3 个横向轨道**，超过 3 个换行，
   * 奇数行错开半格 —— 泡泡像蜂巢一样互相咬合，不重叠也不排成死板一列。
   * 顺序按账户的固定 slot（不按余额排序）：滚动时位置不跳，只有半径在变。
   */
  function layoutStocks(now) {
    const list = model.accounts
      .filter((a) => a.stock)
      .map((a) => ({ a, v: balanceAt(model, a.id, now) }))
      .filter((s) => Math.abs(s.v) >= 0.5);

    const byLane = new Map();
    for (const s of list) {
      if (!byLane.has(s.a.lane)) byLane.set(s.a.lane, []);
      byLane.get(s.a.lane).push(s);
    }

    const out = new Map();
    for (const [lane, group] of byLane) {
      group.sort((p, q) => p.a.slot - q.a.slot);
      const box = laneBox(lane);
      const laneW = Math.max(28, box.w * 0.92);
      const cell = laneW / 3;                            // 3 个轨道
      const cap = Math.max(4, Math.min(15, cell * 0.46));
      const rowH = cap * 1.72;                           // 蜂巢行距（略小于 2r）
      const rows = Math.ceil(group.length / 3);
      const y0 = stopY() - ((rows - 1) * rowH) / 2;
      group.forEach((s, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const shift = row % 2 ? cell * 0.5 : 0;          // 奇数行错开半格
        out.set(s.a.id, {
          x: box.x - laneW / 2 + cell * (col + 0.5) + shift - cell * 0.25,
          y: y0 + row * rowH,
          r: radiusOf(s.v, cap, model.maxStock),
          v: s.v,
          cap,
        });
      });
    }
    return out;
  }

  function draw() {
    if (!model || !resize()) return;
    const w = W();
    const h = H();
    const now = view.scrollDay;
    g.clearRect(0, 0, w, h);

    /* 轴 + 泳道名 */
    g.font = '10px sans-serif';
    g.textAlign = 'center';
    for (let i = 0; i < LANES.length; i += 1) {
      const box = laneBox(i);
      g.strokeStyle = 'rgba(255,255,255,0.04)';
      g.setLineDash([4, 7]);
      g.beginPath(); g.moveTo(box.x, 0); g.lineTo(box.x, h); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(185,178,208,0.28)';
      g.fillText(LANES[i].name, box.x, 15);
    }

    /* 日期刻度 */
    g.textAlign = 'left';
    g.font = '9px monospace';
    const top = view.scrollDay - stopY() / view.ppd;
    const bottom = view.scrollDay + (h - stopY()) / view.ppd;
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

    /* 线：只在发生日前后出现 —— 钱在流的那一下才连线，流完就散开 */
    const WIN = 1.4;
    for (const e of model.events) {
      if (e.day > now + 0.02) continue;
      const age = now - e.day;
      if (age > WIN) continue;                    // 滚过发生日就消失
      const fade = 1 - age / WIN;                 // 越接近发生日越实
      const a = model.accounts.find((x) => x.id === e.fromId);
      const b = model.accounts.find((x) => x.id === e.toId);
      if (!a || !b || a.lane < 0 || b.lane < 0) continue;

      const fa = stocks.get(a.id);
      const fb = stocks.get(b.id);
      // 流水泡在视口外就不画线：否则 400 笔历史会从屏幕外垂下来盖住停域
      if (!fa && (yOf(e.day) < -24 || yOf(e.day) > h + 24)) continue;
      if (!fb && (yOf(e.day) < -24 || yOf(e.day) > h + 24)) continue;
      const fx = fa ? fa.x : laneBox(a.lane).x;
      const tx2 = fb ? fb.x : laneBox(b.lane).x;
      const fy = fa ? fa.y : yOf(e.day);
      const ty = fb ? fb.y : yOf(e.day);
      const fr = fa ? fa.r : radiusOf(e.amount, 12, model.maxStock);
      const tr = fb ? fb.r : radiusOf(e.amount, 12, model.maxStock);
      if (Math.max(fy, ty) < -60 || Math.min(fy, ty) > h + 60) continue;

      const dist = Math.abs(fy - ty);
      const glow = Math.max(0, 1 - dist / 200);
      const color = LANE_COLORS[a.lane];
      const dir = tx2 > fx ? 1 : -1;
      const x1 = fx + dir * fr;
      const x2 = tx2 - dir * tr;
      const bend = Math.min(80, Math.max(20, Math.abs(x2 - x1) * 0.5));

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

    /* 流水泡：收入 / 费用 / 成本，钉在时间上；同一天同一泳道按 3 轨道错开 */
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
        const box = laneBox(acc.lane);
        const laneW = Math.max(28, box.w * 0.92);
        const cell = laneW / 3;
        const x = box.x - laneW / 2 + cell * ((k % 3) + 0.5) - cell * 0.25;
        const r = radiusOf(e.amount, Math.max(4, Math.min(13, cell * 0.46)), model.maxStock);
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

    /* 存量泡：驻留在停域带，同泳道从上往下排 */
    for (const acc of model.accounts) {
      const pos = stocks.get(acc.id);
      if (!pos) continue;
      const color = LANE_COLORS[acc.lane];

      g.save();
      g.shadowColor = rgba(color, 0.6);
      g.shadowBlur = 12;
      g.beginPath();
      g.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
      g.fillStyle = rgba(color, 0.28);
      g.fill();
      g.restore();

      g.beginPath();
      g.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
      g.strokeStyle = rgba(color, 0.9);
      g.lineWidth = 1.2;
      g.stroke();

      if (pos.r >= 7) {
        g.fillStyle = 'rgba(255,255,255,0.78)';
        g.font = Math.max(6, Math.min(8.5, pos.r * 0.85)) + 'px sans-serif';
        g.textAlign = 'center';
        g.fillText(acc.name.slice(0, 2), pos.x, pos.y + 2.5);
      }
      if (pos.r >= 12) {
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
    setScroll(drag.day - (e.clientY - drag.y) / view.ppd);
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    setScroll(view.scrollDay - e.deltaY / view.ppd);
  }, { passive: false });

  for (const btn of section.querySelectorAll('[data-lv-zoom]')) {
    btn.addEventListener('click', () => {
      view.ppd = BASE_PPD * Number(btn.getAttribute('data-lv-zoom') || 1);
      draw();
    });
  }

  window.addEventListener('resize', draw);

  function render() {
    model = buildLifeVein(ctx.getState());
    if (!view.ready) {
      // 一进来停在「最近一次活动」，而不是今天：多数账本今天并没有流水
      const last = model.events.length ? Math.max(...model.events.map((e) => e.day)) : model.todayDay;
      view.scrollDay = Math.min(model.todayDay, last + 1);
      view.ready = true;
    }
    draw();
    const stocks = model.accounts.filter((a) => a.stock).length;
    ctx.setFooter(`LifeVein · ${stocks} 个存量节点 / ${model.events.length} 笔流水 · ${model.startIso} ~ ${model.endIso}`);
  }

  return { render };
}
