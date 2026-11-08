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

/** 六条泳道，从左到右 = 钱的动线：来源 → 中转 → 终点。w = 相对宽度（%） */
export const LANES = [
  { key: 'equity', name: '权益', type: ACCOUNT_TYPE.EQUITY, w: 10 },
  { key: 'income', name: '收入', type: ACCOUNT_TYPE.INCOME, w: 18 },
  { key: 'liability', name: '负债', type: ACCOUNT_TYPE.LIABILITY, w: 16 },
  { key: 'asset', name: '资产', type: ACCOUNT_TYPE.ASSET, w: 26 },
  { key: 'expense', name: '费用', type: ACCOUNT_TYPE.EXPENSE, w: 20 },
  { key: 'cost', name: '成本', type: ACCOUNT_TYPE.COST, w: 10 },
];

const LANE_INDEX = new Map(LANES.map((l, i) => [l.type, i]));

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
      day: Math.max(0, Math.min(days - 1, dayOf(t.date))),
      fromId: t.from_id || '',
      toId: t.to_id || '',
      fromLane: from ? laneOfType(from.type) : -1,
      toLane: to ? laneOfType(to.type) : -1,
      amount,
      opening: !!t.opening,
    };
    events.push(e);
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }

  /* 账户：带泳道与颜色槽位（同一泳道内按出现顺序错开） */
  const laneCount = new Array(LANES.length).fill(0);
  const accs = [];
  for (const a of accounts) {
    const lane = laneOfType(a.type);
    if (lane < 0) continue;
    const slot = laneCount[lane];
    laneCount[lane] += 1;
    accs.push({
      id: a.id, name: String(a.name || ''), lane, slot,
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

  return {
    days,
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

/** 只在测试里用：把天翻回 ISO */
export function isoOfDay(model, day) {
  return isoOf(msOf(model.startIso) + Math.round(day) * DAY_MS);
}
