// 核心：同一账户的接触按顺序排开
/**
 * 账上的日期不动。同一笔存量账户上，上一笔飞完下一笔才开始，
 * 多出来的距离只拉长滚动，标尺仍标原来的那一天。
 */

import { isDebitType } from './schema.js';
import { flowFractions } from './bubble-motion.js';

export function playLayout(model, ppd, height, winPx, opt) {
  const lock = !!(opt && opt.lockDay);
  const events = (model && model.events) || [];
  const stock = new Set(((model && model.accounts) || []).filter((a) => a.stock).map((a) => a.id));
  for (const a of (model && model.accounts) || []) {
    if (a.type === '权益类' && a.id !== '__OPENING__') stock.add(a.id);
  }
  const px = Math.max(1, ppd || 1);
  const full = (Number(winPx) > 0 ? Number(winPx) : (height || 700) * 0.8) / px;
  const span = lock ? Math.min(full, 0.9) : full;
  const ordered = events.slice().sort((a, b) => a.day - b.day || (a.key || 0) - (b.key || 0));
  const load = new Map();
  if (lock) {
    for (const e of ordered) {
      for (const id of [e.fromId, e.toId]) {
        if (!stock.has(id)) continue;
        const k = id + ':' + e.day;
        load.set(k, (load.get(k) || 0) + 1);
      }
    }
  }
  const last = new Map();
  const slot = new Map();
  const dur = new Map();
  const extras = [];
  let shift = 0;
  for (const e of ordered) {
    const natural = lock ? e.day : (e.vday == null ? e.day : e.vday);
    let t0 = lock ? natural : natural + shift;
    const ids = [];
    if (stock.has(e.fromId)) ids.push(e.fromId);
    if (stock.has(e.toId) && e.toId !== e.fromId) ids.push(e.toId);
    for (const id of ids) t0 = Math.max(t0, last.has(id) ? last.get(id) : -1e9);
    let step = span;
    if (lock) {
      let n = 1;
      for (const id of ids) n = Math.max(n, load.get(id + ':' + e.day) || 1);
      step = Math.min(span, 0.9 / n);
      if (t0 > e.day + 0.92) t0 = e.day + 0.92;
      step = Math.min(step, Math.max(0.05, e.day + 0.98 - t0));
    }
    const extra = lock ? 0 : t0 - (natural + shift);
    if (!lock && extra > 1e-6) {
      shift += extra;
      extras.push({ vday: natural, extra });
    }
    slot.set(e.key, t0);
    dur.set(e.key, step * px);
    for (const id of ids) last.set(id, t0 + step);
  }
  const marks = [];
  const vm = (model && model.vmarks) || [];
  const before = (v) => extras.reduce((s, ex) => s + (ex.vday < v - 1e-9 ? ex.extra : 0), 0);
  for (const m of vm) {
    let play = m.vday + before(m.vday);
    marks.push({ play, day: m.day });
    for (const ex of extras) {
      if (Math.abs(ex.vday - m.vday) < 1e-6) {
        play += ex.extra;
        marks.push({ play, day: m.day });
      }
    }
  }
  let maxSlot = 0;
  slot.forEach((v) => { if (v > maxSlot) maxSlot = v; });
  const tail = vm.length ? vm[vm.length - 1].vday + shift : shift;
  return { slot, marks, span, dur, playSpan: Math.max(tail, maxSlot + span) };
}

/** 拉长后的滚动位置 → 账上的日历日。拉开的那一段不另编日期。 */
export function playDay(marks, play) {
  if (!marks || !marks.length) return 0;
  if (play <= marks[0].play) return marks[0].day;
  for (let i = 1; i < marks.length; i += 1) {
    const a = marks[i - 1];
    const b = marks[i];
    if (play <= b.play) {
      if (a.day === b.day || !(b.play > a.play)) return a.day;
      return a.day + (b.day - a.day) * ((play - a.play) / (b.play - a.play));
    }
  }
  return marks[marks.length - 1].day;
}

/** 费用泡钉在这笔账的日期线上，不钉在被拉长的飞行终点。 */
export function dayLine(play, e) {
  const natural = e.vday == null ? e.day : e.vday;
  for (const m of play.marks || []) {
    if (Math.abs(m.day - e.day) < 0.51) return m.play;
  }
  const at = play.slot && play.slot.get(e.key);
  return at == null ? natural : at;
}

/** 整屏高度对应若干日历日时，标尺按日历日均匀排，不吃空档压缩。 */
export function screenDayMarks(model, scroll, daysPer, pxPer) {
  const n = Number(daysPer);
  if (!(n > 0) || !model || !model.startIso) return [];
  const top = scroll - n / 2;
  const bot = scroll + n / 2;
  const days = [];
  for (let d = Math.floor(top); d <= Math.ceil(bot); d += 1) days.push(d);
  const px = Number(pxPer) || 40;
  const out = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    if (px < 14) {
      while (j + 1 < days.length && (j + 1 - i) * px < 14) j += 1;
    }
    const a = dayNum(model, days[i]);
    const b = dayNum(model, days[j]);
    if (a) {
      out.push(j === i || a === b
        ? { vday: days[i], label: a, span: false }
        : { vday: (days[i] + days[j]) / 2, label: a + '–' + b, span: true });
    }
    i = j + 1;
  }
  return out;
}

function dayNum(model, d) {
  const dt = new Date(Date.parse(model.startIso + 'T00:00:00') + d * 86400000);
  return Number.isNaN(dt.getTime()) ? '' : String(dt.getDate());
}

/** 标尺。拉开的同一天会重复出现，空档仍可写成「14–22」。 */
export function rulerFromPlay(model, marks, vTop, vBot, pxPer) {
  if (!model || !model.startIso || !marks || !marks.length) return [];
  const px = Math.max(0.01, Number(pxPer) || 1);
  const ticks = [];
  for (const m of marks) {
    if (m.play < vTop - 0.2 || m.play > vBot + 0.2) continue;
    const label = dayNum(model, m.day);
    if (label) ticks.push({ vday: m.play, label, day: m.day });
  }
  for (let i = 1; i < marks.length; i += 1) {
    const a = marks[i - 1];
    const b = marks[i];
    if (!(b.day > a.day + 0.5) || !(b.play > a.play)) continue;
    for (let d = Math.floor(a.day) + 1; d < b.day; d += 1) {
      const v = a.play + (b.play - a.play) * ((d - a.day) / (b.day - a.day));
      if (v < vTop - 0.05 || v > vBot + 0.05) continue;
      const label = dayNum(model, d);
      if (label) ticks.push({ vday: v, label, day: d });
    }
  }
  ticks.sort((a, b) => a.vday - b.vday);
  const out = [];
  let i = 0;
  while (i < ticks.length) {
    let j = i;
    while (j + 1 < ticks.length && (ticks[j + 1].vday - ticks[j].vday) * px < 14) j += 1;
    const la = ticks[i].label;
    const lb = ticks[j].label;
    out.push(i === j || la === lb
      ? { vday: ticks[i].vday, label: la, span: false }
      : { vday: (ticks[i].vday + ticks[j].vday) / 2, label: la + '–' + lb, span: true });
    i = j + 1;
  }
  return out;
}

/** 半径用进度里的存量，标签只用已经飞完的精确余额。 */
export function stockBooks(events, accounts, prog) {
  const out = new Map();
  for (const a of accounts || []) {
    if (a.id === '__OPENING__') continue;
    if (!a.stock && a.type !== '权益类') continue;
    const debit = isDebitType(a.type);
    let size = 0;
    let label = 0;
    let live = false;
    for (const e of events) {
      if (e.toId !== a.id && e.fromId !== a.id) continue;
      const p = prog(e);
      if (p > 0 && p < 1) live = true;
      const fr = flowFractions(e.kind, p);
      if (e.toId === a.id) {
        if (fr.dst) size += (debit ? e.amount : -e.amount) * fr.dst;
        if (p >= 1) label += debit ? e.amount : -e.amount;
      }
      if (e.fromId === a.id) {
        if (fr.src) size += (debit ? -e.amount : e.amount) * fr.src;
        if (p >= 1) label += debit ? -e.amount : e.amount;
      }
    }
    out.set(a.id, { size, label, live });
  }
  return out;
}
