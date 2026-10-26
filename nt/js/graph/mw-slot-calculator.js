/**
 * 槽位角度计算器 ★核心
 * 层：第三层 · 数学引擎（纯计算）
 *
 * 把「一批单笔流水」变成「环上的角度」：
 *   · 单位数 N_UNITS = 笔数 × 2（每笔在转出端、转入端各占一个）
 *   · 每个统计分类之间固定留 GAP_DEG = 0.8° 的缝
 *   · 剩下角度平均分给所有单位
 *   · 排序：类型 → 分类 → 账户 → 时间（同类聚集，类间留缝）
 *   · 相邻同账户的槽位合并成弧块 blocks
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
 * @param {{accOf:(id:string)=>{type:string,category:string,code:string,name:string},
 *          outerRadius:number}} opts
 */
export function computeSlots(txs, opts) {
  const list = txs || [];
  const o = opts || {};
  const accOf = o.accOf || (() => null);
  const R = Number(o.outerRadius) || 640;

  // ① 分类组（类型|分类），按 CAT_ORDER 再按分类名排
  const groups = new Map();
  for (const x of list) {
    for (const id of [x.from_id, x.to_id]) {
      if (!id) continue;
      const acc = accOf(id);
      if (!acc) continue;
      const type = CAT_ORDER.includes(acc.type) ? acc.type : '其它';
      const key = type + '|' + (acc.category || '未分类');
      if (!groups.has(key)) groups.set(key, { key, type, category: acc.category || '未分类' });
    }
  }
  const groupList = [...groups.values()].sort((A, B) => {
    const ia = CAT_ORDER.indexOf(A.type);
    const ib = CAT_ORDER.indexOf(B.type);
    if (ia !== ib) return ia - ib;
    return A.category < B.category ? -1 : A.category > B.category ? 1 : 0;
  });
  const gRank = new Map(groupList.map((g, i) => [g.key, i]));

  const groupKeyOf = (id) => {
    const acc = accOf(id);
    if (!acc) return '其它|未分类';
    const type = CAT_ORDER.includes(acc.type) ? acc.type : '其它';
    return type + '|' + (acc.category || '未分类');
  };

  // ② 单位角 / 单位弧长
  const units = list.length * 2;
  const uDeg = unitDegree(groupList.length, list.length);
  const unit = (uDeg * Math.PI) / 180;
  const unitArcLen = unit * R;     // 1 个单位的弧长

  // ③ 槽位
  const slots = [];
  list.forEach((x, i) => {
    slots.push(makeSlot(x, i, 'f', x.from_id, groupKeyOf, gRank));
    slots.push(makeSlot(x, i, 't', x.to_id, groupKeyOf, gRank));
  });

  // ④ 排序：分组 → 账户 → 时间
  slots.sort((A, B) => {
    const ka = A.empty ? 9999 : (gRank.get(A.groupKey) ?? 9998);
    const kb = B.empty ? 9999 : (gRank.get(B.groupKey) ?? 9998);
    if (ka !== kb) return ka - kb;
    if (A.acc !== B.acc) return A.acc < B.acc ? -1 : 1;
    return A.txIdx - B.txIdx;
  });

  // ⑤ 分配角度（跨组加缝）
  let ang = START_ANG;
  let prevKey = null;
  for (const sl of slots) {
    if (prevKey !== null && sl.groupKey !== prevKey) ang += GAP_RAD;
    sl.a1 = ang;
    sl.a2 = ang + unit;
    sl.mid = ang + unit / 2;
    ang += unit;
    prevKey = sl.groupKey;
  }

  // ⑥ 弧块：相邻同账户合并
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
        groupKey: sl.groupKey,
        type: sl.type,
        category: sl.category,
        a1: sl.a1,
        a2: sl.a2,
        n: 1,
      });
    }
  }

  // ⑦ 分组扇区（给「类型分界线」用）
  const sectors = groupList.map((g, i) => {
    const groupSlots = slots.filter((s) => s.groupKey === g.key);
    return {
      ...g,
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
    colorIndex: new Map(groupList.map((g, i) => [g.key, i])),
    groupKeyOf,
    unit,          // 弧度
    unitDeg: uDeg, // 度
    unitArcLen,    // 像素：线宽基准
    units,
    gapRad: GAP_RAD,
    outerRadius: R,
  };
}

function makeSlot(x, txIdx, side, accountId, groupKeyOf, gRank) {
  const accId = accountId || null;
  const key = accId ? groupKeyOf(accId) : '\u0000EMPTY';
  const [type, category] = key.split('|');
  return {
    acc: accId,
    groupKey: key,
    type: type || '其它',
    category: category || '',
    txIdx,
    side,
    empty: !accId,
    amount: x.amount,
    date: x.date,
    gRank: accId ? (gRank.get(key) ?? 9998) : 9999,
  };
}
