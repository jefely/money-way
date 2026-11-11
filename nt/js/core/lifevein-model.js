// 核心：LifeVein 页（时间流里的泡）
/**
 * LifeVein 模型：账户分域 + 每日余额 + 流水事件
 * 层：第一层 · core
 *
 * 口径（见 nt/LIFEVEIN-PAGE.md）：
 *   · **泡 = 节点在一刻的存量**。资产 / 负债按天算余额；收入 / 费用 / 成本不持有存量，
 *     它们的泡就是「这一笔」的金额。
 *   · **停域 = 「现在」**。视图把停域线对到某个时刻，存量泡的半径就取那一刻的余额。
 *   · 余额方向沿用 isDebitType（借增贷减）：负债「转出」= 欠款增加。
 *   · 草稿（status:'draft'）不参与：不进余额、不出泡。
 *   · 缺端照出泡（项目裁决：绝不自动跳过），另一端留空。
 *
 * 纯函数：不碰 DOM、不碰浏览器 API，Node 可直接测。
 */

import { ACCOUNT_TYPE, isDebitType, isPosted } from './schema.js';
import { classifyFlow } from './bubble-motion.js';

/** 三根轴线：每根一个固定基准位置，左右两侧各吸附一种类型（3 轴 × 2 侧 = 6 类） */
export const AXES = [
  { key: 'left', name: '收入 / 权益', x: 0.22 },
  { key: 'mid', name: '负债 / 资产', x: 0.50 },
  { key: 'right', name: '费用 / 成本', x: 0.78 },
];

/** 类型 → [轴下标, 哪一侧（-1 左 / +1 右）] */
export const TYPE_PLACE = {
  [ACCOUNT_TYPE.INCOME]: [0, -1],
  [ACCOUNT_TYPE.EQUITY]: [0, 1],
  [ACCOUNT_TYPE.LIABILITY]: [1, -1],
  [ACCOUNT_TYPE.ASSET]: [1, 1],
  [ACCOUNT_TYPE.EXPENSE]: [2, -1],
  [ACCOUNT_TYPE.COST]: [2, 1],
};

const LANE_INDEX = new Map(
  Object.entries(TYPE_PLACE).map(([type, [axis, side]]) => [type, axis * 2 + (side > 0 ? 1 : 0)]),
);

/** 账户类型 → 泳道下标；空类型（U 区）/未知 → -1（不画） */
export function laneOfType(type) {
  const i = LANE_INDEX.get(type);
  return i == null ? -1 : i;
}

/** 这一类是不是「持有存量」的（资产 / 负债按天算余额） */
export function isStockType(type) {
  return type === ACCOUNT_TYPE.ASSET || type === ACCOUNT_TYPE.LIABILITY;
}

const DAY_MS = 86400000;
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const msOf = (iso) => Date.parse(String(iso).slice(0, 10) + 'T00:00:00');

/**
 * @param {{accounts?:Array, transactions?:Array}} state
 * @param {string} [todayIso] 今天（测试注入；默认取系统日期）
 * @returns {{
 *   days:number, startIso:string, endIso:string, todayDay:number,
 *   accounts:Array<{id:string,name:string,lane:number,stock:boolean,color:string}>,
 *   stock:Map<string,Float64Array>,
 *   events:Array<{day:number,fromId:string,toId:string,fromLane:number,toLane:number,amount:number,opening:boolean}>,
 *   txCount:number
 * }}
 */
export function buildLifeVein(state, todayIso) {
  const accounts = ((state && state.accounts) || []).filter((a) => a && a.id);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const list = ((state && state.transactions) || [])
    .filter(isPosted)
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))
      || (Number(a.seq) || 0) - (Number(b.seq) || 0));

  const today = String(todayIso || new Date().toISOString().slice(0, 10));
  const firstIso = list.length ? String(list[0].date || '').slice(0, 10) : today;
  const lastIso = list.length ? String(list[list.length - 1].date || '').slice(0, 10) : today;
  const startIso = firstIso && firstIso < today ? firstIso : today;
  const endIso = lastIso > today ? lastIso : today;
  const days = Math.max(1, Math.round((msOf(endIso) - msOf(startIso)) / DAY_MS) + 1);
  const dayOf = (iso) => Math.round((msOf(iso) - msOf(startIso)) / DAY_MS);

  /* 事件：按天分桶，供余额累加 */
  const events = [];
  const byDay = new Map();
  for (const t of list) {
    const from = byId.get(t.from_id);
    const to = byId.get(t.to_id);
    const amount = Number(t.amount) || 0;
    if (!amount) continue;
    const e = {
      key: events.length,
      day: Math.max(0, Math.min(days - 1, dayOf(t.date))),
      fromId: t.from_id || '',
      toId: t.to_id || '',
      fromType: from ? from.type : '',
      toType: to ? to.type : '',
      fromLane: from ? laneOfType(from.type) : -1,
      toLane: to ? laneOfType(to.type) : -1,
      amount,
      opening: !!t.opening,
      kind: classifyFlow(from && from.type, to && to.type),
    };
    events.push(e);
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }

  /* 账户：带泳道与颜色槽位（同一泳道内按出现顺序错开） */
  const laneCount = new Array(AXES.length * 2).fill(0);
  const accs = [];
  for (const a of accounts) {
    const lane = laneOfType(a.type);
    if (lane < 0) continue;
    const slot = laneCount[lane];
    laneCount[lane] += 1;
    accs.push({
      id: a.id, name: String(a.name || ''), type: a.type, lane, slot,
      axis: Math.floor(lane / 2),
      side: lane % 2 === 0 ? -1 : 1,
      stock: isStockType(a.type),
    });
  }

  /* 存量：每个资产 / 负债账户一条每日余额曲线 */
  const stock = new Map();
  for (const a of accs) {
    if (!a.stock) continue;
    const arr = new Float64Array(days);
    let run = 0;
    const debit = isDebitType((byId.get(a.id) || {}).type);
    for (let d = 0; d < days; d += 1) {
      const bucket = byDay.get(d);
      if (bucket) {
        for (const e of bucket) {
          if (e.toId === a.id) run += debit ? e.amount : -e.amount;
          if (e.fromId === a.id) run += debit ? -e.amount : e.amount;
        }
      }
      arr[d] = run;
    }
    stock.set(a.id, arr);
  }

  let maxStock = 0;
  for (const arr of stock.values()) {
    for (let i = 0; i < arr.length; i += 1) {
      const v = Math.abs(arr[i]);
      if (v > maxStock) maxStock = v;
    }
  }

  // 空档超过两天就压短：八月账本接到「今天」时，中间的空月不再把时间轴拉成一片空白。
  // 有流水的日子仍按真实间隔排，顺序不变。
  const uniq = [...new Set(events.map((e) => e.day))].sort((a, b) => a - b);
  const vmap = new Map();
  const vmarks = [];
  let cursor = 0;
  let prev = uniq.length ? uniq[0] : 0;
  if (uniq.length) {
    vmap.set(uniq[0], 0);
    vmarks.push({ day: uniq[0], vday: 0 });
  }
  for (let i = 1; i < uniq.length; i += 1) {
    const d = uniq[i];
    const gap = d - prev;
    cursor += gap <= 2 ? gap : 2 + Math.log2(gap);
    vmap.set(d, cursor);
    vmarks.push({ day: d, vday: cursor });
    prev = d;
  }
  for (const e of events) e.vday = vmap.get(e.day) || 0;

  // 右缘：同一天、同一费用/成本分类收成一颗。左缘：收入/权益同理。
  // 同一天的多笔按流水顺序排队，飞的时候一笔接一笔，不并成一颗飞泡。
  const catName = (a) => {
    if (!a) return '';
    const c = String(a.category || '').trim();
    return c || String(a.name || '');
  };
  const queues = new Map();
  for (const e of events) {
    const from = byId.get(e.fromId);
    const to = byId.get(e.toId);
    const right = e.toType === ACCOUNT_TYPE.EXPENSE || e.toType === ACCOUNT_TYPE.COST;
    const left = !right && (e.fromType === ACCOUNT_TYPE.INCOME || e.fromType === ACCOUNT_TYPE.EQUITY);
    e.edge = right ? 'R' : (left ? 'L' : '');
    e.cat = right ? (catName(to) || '费用') : (left ? (catName(from) || '收入') : '');
    e.queue = 0;
    e.queueN = 1;
    if (!e.edge) continue;
    const qk = e.edge + ':' + e.day;
    if (!queues.has(qk)) queues.set(qk, []);
    queues.get(qk).push(e);
  }
  for (const list of queues.values()) {
    for (let i = 0; i < list.length; i += 1) {
      list[i].queue = i;
      list[i].queueN = list.length;
    }
  }

  return {
    days,
    vspan: Math.max(1, cursor),
    vmarks,
    maxStock,
    startIso,
    endIso,
    todayDay: Math.max(0, Math.min(days - 1, dayOf(today))),
    accounts: accs,
    stock,
    events,
    txCount: list.length,
  };
}

/** 某一天的余额（浮点日：在两日之间线性插值） */
export function balanceAt(model, id, day) {
  const arr = model.stock.get(id);
  if (!arr) return 0;
  const d = Math.max(0, Math.min(model.days - 1, day));
  const i = Math.floor(d);
  const f = d - i;
  const a = arr[i] || 0;
  const b = arr[Math.min(model.days - 1, i + 1)] || 0;
  return a + (b - a) * f;
}

/** 把 ISO 日期翻成浮点日（视图给「今天」定位用） */
export function dayOfIso(model, iso) {
  return Math.round((msOf(iso) - msOf(model.startIso)) / DAY_MS);
}

/** 视觉日 → 日历日（空月被压短之后，用两端的刻度插值） */
export function calendarDayAt(model, vday) {
  const marks = (model && model.vmarks) || [];
  if (!marks.length) return 0;
  if (vday <= marks[0].vday) return marks[0].day;
  for (let i = 1; i < marks.length; i += 1) {
    const a = marks[i - 1];
    const b = marks[i];
    if (vday <= b.vday) {
      const t = (vday - a.vday) / Math.max(1e-6, b.vday - a.vday);
      return a.day + (b.day - a.day) * t;
    }
  }
  return marks[marks.length - 1].day;
}

/** 正中那一天所在的年月，形如 26年 1月 */
export function monthLabel(model, vday) {
  const cal = calendarDayAt(model, vday);
  const dt = new Date(Date.parse(model.startIso + 'T00:00:00') + Math.round(cal) * 86400000);
  if (Number.isNaN(dt.getTime())) return '';
  return String(dt.getFullYear()).slice(2) + '年 ' + (dt.getMonth() + 1) + '月';
}

/** 只在测试里用：把天翻回 ISO */
export function isoOfDay(model, day) {
  return isoOf(msOf(model.startIso) + Math.round(day) * DAY_MS);
}
