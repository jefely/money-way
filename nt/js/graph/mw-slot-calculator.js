// 界面：（无界面）槽位计算
/**
 * 槽位角度计算器 ★核心
 * 层：第三层 · 数学引擎（纯计算）
 *
 * 把「一批单笔流水」变成「环上的角度」：
 *   · 单位数 N_UNITS = 笔数 × 2（每笔在转出端、转入端各占一个）
 *   · 每个统计分类之间固定留 GAP_DEG = 0.8° 的缝
 *   · 剩下角度平均分给所有单位
 *   · 排序：类型 → 统计分类 → 账户 → 时间（同类聚集）
 *   · 相邻同账户的槽位合并成弧块 blocks
 *
 * **两个键必须分清**（这里最容易搞错）：
 *   sortKey  = 类型|统计分类   → 决定**顺序与缝隙**（同类聚合、类间 0.8°）
 *   colorKey = 统计分类        → 决定**颜色**（全图颜色数 = 分类数，与类型无关）
 *
 * 还负责给下游两个数：
 *   unitDeg     单位角（度）
 *   unitArcLen  1 个单位的弧长（像素）—— 线宽的基准
 *
 * 输出**纯数据**（弧度 / 像素），不碰 SVG、不拼字符串。
 */

import { ACCOUNT_TYPE } from '../core/schema.js';

/** 类型顺序：9 点钟起顺时针（上面收入、下面权益） */
export const CAT_ORDER = [
  ACCOUNT_TYPE.INCOME,     // 收入类
  ACCOUNT_TYPE.ASSET,      // 资产类
  ACCOUNT_TYPE.EXPENSE,    // 费用类
  ACCOUNT_TYPE.LIABILITY,  // 负债类
  ACCOUNT_TYPE.EQUITY,     // 权益类
  '其它',
];

export const GAP_DEG = 0.8;
export const GAP_RAD = (GAP_DEG * Math.PI) / 180;
export const START_ANG = -Math.PI / 2;   // 9 点钟
export const UNCATEGORIZED = '未分类';

/**
 * 细粒度单位角（度）：(360 − 分类数 × 0.8) ÷ (笔数 × 2)
 * 这是用户给的公式，单独导出便于测试。
 */
export function unitDegree(groupCount, txCount) {
  const groups = Math.max(0, Math.floor(Number(groupCount) || 0));
  const units = Math.max(0, Math.floor(Number(txCount) || 0)) * 2;
  if (!units) return 0;
  return Math.max(60, 360 - groups * GAP_DEG) / units;
}

/**
 * @param {Array} txs 单笔流水（mw-data-fetcher 的输出）
 * @param {{accOf:(id:string)=>{type:string,category:string,name:string},
 *          outerRadius:number}} opts
 */
export function computeSlots(txs, opts) {
  const list = txs || [];
  const o = opts || {};
  const accOf = o.accOf || (() => null);
  const R = Number(o.outerRadius) || 640;

  /* ---------- ① 两个键 ---------- */

  /** 排序键：类型 + 统计分类 */
  const sortKeyOf = (id) => {
    const acc = accOf(id);
    if (!acc) return '其它|' + UNCATEGORIZED;
    const type = CAT_ORDER.includes(acc.type) ? acc.type : '其它';
    return type + '|' + (acc.category || UNCATEGORIZED);
  };

  /** 颜色键：**只有统计分类**，与账户类型无关 */
  const colorKeyOf = (id) => {
    const acc = accOf(id);
    return (acc && acc.category) || UNCATEGORIZED;
  };

  // 排序分组（决定顺序与缝隙）
  const groups = new Map();
  const colorKeys = new Set();
  for (const x of list) {
    for (const id of [x.from_id, x.to_id]) {
      if (!id) continue;
      const acc = accOf(id);
      if (!acc) continue;
      const type = CAT_ORDER.includes(acc.type) ? acc.type : '其它';
      const category = acc.category || UNCATEGORIZED;
      const sortKey = type + '|' + category;
      if (!groups.has(sortKey)) groups.set(sortKey, { key: sortKey, type, category });
      colorKeys.add(category);
    }
  }

  const groupList = [...groups.values()].sort((A, B) => {
    const ia = CAT_ORDER.indexOf(A.type);
    const ib = CAT_ORDER.indexOf(B.type);
    if (ia !== ib) return ia - ib;
    return A.category < B.category ? -1 : A.category > B.category ? 1 : 0;
  });
  const gRank = new Map(groupList.map((g, i) => [g.key, i]));

  // 颜色索引：按统计分类名字排序分配（稳定 → 颜色稳定）
  const colorList = [...colorKeys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const colorIndex = new Map(colorList.map((k, i) => [k, i]));

  /* ---------- ② 单位角 / 单位弧长 ---------- */
  const units = list.length * 2;
  const uDeg = unitDegree(groupList.length, list.length);
  const unit = (uDeg * Math.PI) / 180;
  const unitArcLen = unit * R;

  /* ---------- ③ 槽位 ---------- */
  const slots = [];
  list.forEach((x, i) => {
    slots.push(makeSlot(x, i, 'f', x.from_id, sortKeyOf, colorKeyOf, gRank));
    slots.push(makeSlot(x, i, 't', x.to_id, sortKeyOf, colorKeyOf, gRank));
  });

  /* ---------- ④ 排序：分组 → 账户 → 时间 ---------- */
  slots.sort((A, B) => {
    const ka = A.empty ? 9999 : (gRank.get(A.sortKey) ?? 9998);
    const kb = B.empty ? 9999 : (gRank.get(B.sortKey) ?? 9998);
    if (ka !== kb) return ka - kb;
    if (A.acc !== B.acc) return A.acc < B.acc ? -1 : 1;
    return A.txIdx - B.txIdx;
  });

  /* ---------- ⑤ 分配角度（跨组加缝） ---------- */
  let ang = START_ANG;
  let prevKey = null;
  for (const sl of slots) {
    if (prevKey !== null && sl.sortKey !== prevKey) ang += GAP_RAD;
    sl.a1 = ang;
    sl.a2 = ang + unit;
    sl.mid = ang + unit / 2;
    ang += unit;
    prevKey = sl.sortKey;
  }

  /* ---------- ⑥ 弧块：相邻同账户合并 ---------- */
  const blocks = [];
  for (const sl of slots) {
    if (!sl.acc) continue;
    const last = blocks[blocks.length - 1];
    if (last && last.acc === sl.acc) {
      last.a2 = sl.a2;
      last.n += 1;
    } else {
      blocks.push({
        acc: sl.acc,
        sortKey: sl.sortKey,
        colorKey: sl.colorKey,
        type: sl.type,
        category: sl.category,
        a1: sl.a1,
        a2: sl.a2,
        n: 1,
      });
    }
  }

  /* ---------- ⑦ 分组扇区（画类型/分类分界线） ---------- */
  const sectors = groupList.map((g, i) => {
    const groupSlots = slots.filter((s) => s.sortKey === g.key);
    return {
      key: g.key,
      type: g.type,
      category: g.category,
      colorKey: g.category,
      order: i,
      a1: groupSlots.length ? groupSlots[0].a1 : 0,
      a2: groupSlots.length ? groupSlots[groupSlots.length - 1].a2 : 0,
      count: groupSlots.length,
    };
  }).filter((s) => s.count > 0);

  return {
    slots,
    blocks,
    sectors,
    groupList,
    colorList,
    colorIndex,
    sortKeyOf,
    colorKeyOf,
    unit,
    unitDeg: uDeg,
    unitArcLen,
    units,
    gapRad: GAP_RAD,
    outerRadius: R,
  };
}

function makeSlot(x, txIdx, side, accountId, sortKeyOf, colorKeyOf, gRank) {
  const accId = accountId || null;
  const sortKey = accId ? sortKeyOf(accId) : '\u0000EMPTY';
  const parts = sortKey.split('|');
  return {
    acc: accId,
    sortKey,
    colorKey: accId ? colorKeyOf(accId) : '',
    type: parts[0] || '其它',
    category: parts[1] || '',
    txIdx,
    side,
    empty: !accId,
    amount: x.amount,
    date: x.date,
    gRank: accId ? (gRank.get(sortKey) ?? 9998) : 9999,
  };
}
