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

/**
 * 类型顺序：9 点钟起顺时针（照单文件版 mwDrawSvg 的 CAT_ORDER）
 *   权益 → 负债 → 费用 → 成本 → 资产 → 收入 → 其它
 * 之前这里是反的（收入在最前），整张图的弧块位置全错 —— 这是「计算不对」最直接的一条。
 * 成本类（2026-11）贴着资产放：它在报表上最终结转到库存商品，两者是一段连续的路。
 */
export const CAT_ORDER = [
  ACCOUNT_TYPE.EQUITY,     // 权益类
  ACCOUNT_TYPE.LIABILITY,  // 负债类
  ACCOUNT_TYPE.EXPENSE,    // 费用类
  ACCOUNT_TYPE.COST,       // 成本类
  ACCOUNT_TYPE.ASSET,      // 资产类
  ACCOUNT_TYPE.INCOME,     // 收入类
  '其它',
];

export const GAP_DEG = 0.8;
export const GAP_RAD = (GAP_DEG * Math.PI) / 180;
export const START_ANG = -Math.PI / 2;   // 9 点钟
export const UNCATEGORIZED = '未分类';

/**
 * 细粒度单位角（度）：(360 − 分类数 × 间隙) ÷ (笔数 × 2)
 * 这是用户给的公式，单独导出便于测试。
 * `gapDeg` 来自环图参数（面板「分类间隙角」，默认 0.8°）；不传就用常量。
 */
export function unitDegree(groupCount, txCount, gapDeg) {
  const gap = Number.isFinite(Number(gapDeg)) && gapDeg !== '' ? Number(gapDeg) : GAP_DEG;
  const groups = Math.max(0, Math.floor(Number(groupCount) || 0));
  const units = Math.max(0, Math.floor(Number(txCount) || 0)) * 2;
  if (!units) return 0;
  return Math.max(60, 360 - groups * gap) / units;
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
  // 分类之间的缝：面板「分类间隙角」。0 是合法的（分类贴在一起），
  // 但 null / '' / NaN 要走默认，否则一次误传就把缝隙清成 0。
  const gapDeg = o.gapDeg == null || o.gapDeg === ''
    ? GAP_DEG
    : (Number.isFinite(Number(o.gapDeg)) ? Number(o.gapDeg) : GAP_DEG);
  const gapRad = (gapDeg * Math.PI) / 180;
  /**
   * 粒度模式：
   *   count  —— 一笔流水占 2 个单位（转出端 + 转入端），每单位角相同（旧行为，默认）
   *   amount —— 弧段按金额占比分配（用户 2026-11 加的第二套）
   * 面板传 0/1，代码里也认 'count' / 'amount' 两个字面量。
   */
  const mode = (o.unitMode === 'amount' || Number(o.unitMode) >= 0.5) ? 'amount' : 'count';

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
  const uDeg = unitDegree(groupList.length, list.length, gapDeg);
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
  //
  // 两套粒度模式（用户 2026-11 定）：
  //   count（默认）：一个槽位 = 一个固定单位角，公式在 unitDegree() 里
  //   amount       ：槽位角度 ∝ 金额，两级分配 ——
  //                  组角 ∝ 组金额；组内节点角 ∝ 节点金额；节点内各槽位均分
  //                  组角合计 = 可用角，所以整圈就是「金额配置」本身
  const spanOf = mode === 'amount' ? spansByAmount(slots, groupList, gapDeg) : null;
  const useAmount = !!spanOf;

  // 缝的位置：笔数模式按「类型|分类」留（每一类一条缝）；
  // 金额模式按「类型」留 —— 类型内部跨分类不留缝，否则类型角会被缝吃掉，环就不满了。
  const gapKeyOf = useAmount ? (sl) => sl.type : (sl) => sl.sortKey;

  let ang = START_ANG;
  let prevKey = null;
  for (const sl of slots) {
    const key = gapKeyOf(sl);
    if (prevKey !== null && key !== prevKey) ang += gapRad;
    const span = useAmount ? (spanOf.get(sl) || 0) : unit;
    sl.a1 = ang;
    sl.a2 = ang + span;
    sl.mid = ang + span / 2;
    sl.span = span;
    sl.arcLen = span * R;
    ang += span;
    prevKey = key;
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
    // 实际生效的模式：请求 amount 但一分钱都没有时会退回 count，别让调用方误会
    mode: useAmount ? 'amount' : 'count',
    unit,
    unitDeg: uDeg,
    unitArcLen,
    units,
    gapRad,
    gapDeg,
    outerRadius: R,
  };
}

/**
 * 金额粒度：每个槽位该占多少**弧度**（用户 2026-11 定的口径）。
 *
 *  ① **六大节点类型之间均分**，而且只分**出现过的**类型：
 *     只出现一类 → 它占整圈；两类 → 各占一半；三类 → 各占三分之一。
 *  ② **类型内按净额占比**：节点角 = 类型角 × (|该节点净额| ÷ 该类型内 |净额| 之和)，
 *     净额 = 转入 − 转出（余额变动），不是收付合计。
 *  ③ 节点内各槽位均分。
 *
 * 注意中间那一层「统计分类」**不参与角度分配**：它只管颜色和排序，
 * 类型内部跨分类不再留缝（缝只留在类型之间），所以整圈永远是满的。
 *
 * 净额为 0 的中转账户不再消失：在所属类型里留一条至少约 1.2° 的细弧
 * （类型里这种账户很多时，细弧合计不超过该类型角度的 35%）。
 * 整个类型净额都是 0 时，这一段在类型内部均分，仍然看得见。
 *
 * ⚠️ 返回值必须和 count 模式的 `unit` 同量纲（弧度）。
 * 这里曾经返回「度」并被直接加到弧度累加器上，一个块跨了 9731°（27 圈），
 * SVG 的 A 命令碰到超 360° 的弧会把半径悄悄放大 —— 图上就是几个飘在外面的大圆环。
 *
 * @returns {Map<object, number>|null} null 表示没有可比金额（净额全为 0），调用方退回 count
 */
function spansByAmount(slots, groupList, gapDeg) {
  const RAD = Math.PI / 180;

  // ① 出现过的类型（顺序即 CAT_ORDER，由 slots 的排序决定）
  const types = [];
  const typeOfAcc = new Map();
  for (const sl of slots) {
    if (!sl.acc) continue;
    typeOfAcc.set(sl.acc, sl.type);
    if (types.indexOf(sl.type) < 0) types.push(sl.type);
  }
  if (!types.length) return null;

  const availRad = Math.max(60, 360 - types.length * gapDeg) * RAD;
  const typeRad = availRad / types.length;

  // ② 净额 = 转入 − 转出
  const net = new Map();
  const accSlots = new Map();
  for (const sl of slots) {
    if (!sl.acc) continue;
    const amt = Number(sl.amount) || 0;
    net.set(sl.acc, (net.get(sl.acc) || 0) + (sl.side === 't' ? amt : -amt));
    accSlots.set(sl.acc, (accSlots.get(sl.acc) || 0) + 1);
  }

  const typeNet = new Map();
  for (const [acc, v] of net) {
    const tp = typeOfAcc.get(acc);
    typeNet.set(tp, (typeNet.get(tp) || 0) + Math.abs(v));
  }

  let totalNet = 0;
  for (const v of typeNet.values()) totalNet += v;
  // 一笔净额都没有：退回笔数模式，避免整圈被细弧规则拆碎
  if (!(totalNet > 0)) return null;

  // 净额为 0 的账户至少留这么宽，保证弧块、标签和点击还在
  const MIN_RAD = 1.2 * RAD;
  const accRad = new Map();
  for (const type of types) {
    const ids = [];
    for (const [acc, tp] of typeOfAcc) {
      if (tp === type && ids.indexOf(acc) < 0) ids.push(acc);
    }
    if (!ids.length) continue;
    const weights = ids.map((id) => Math.abs(net.get(id)) || 0);
    const sumW = weights.reduce((s, w) => s + w, 0);
    if (!(sumW > 0)) {
      const each = typeRad / ids.length;
      for (const id of ids) accRad.set(id, each);
      continue;
    }
    let floors = weights.map((w) => (w > 0 ? 0 : MIN_RAD));
    let floorSum = floors.reduce((s, w) => s + w, 0);
    const cap = typeRad * 0.35;
    if (floorSum > cap && floorSum > 0) {
      const scale = cap / floorSum;
      floors = floors.map((f) => f * scale);
      floorSum = cap;
    }
    if (floorSum > typeRad) {
      const scale = typeRad / floorSum;
      floors = floors.map((f) => f * scale);
      floorSum = typeRad;
    }
    const rest = typeRad - floorSum;
    ids.forEach((id, i) => {
      const share = weights[i] > 0 ? rest * (weights[i] / sumW) : 0;
      accRad.set(id, floors[i] + share);
    });
  }

  const spans = new Map();
  for (const sl of slots) {
    if (!sl.acc) { spans.set(sl, 0); continue; }
    const cnt = accSlots.get(sl.acc) || 1;
    spans.set(sl, (accRad.get(sl.acc) || 0) / cnt);
  }
  return spans;
}

function makeSlot(x, txIdx, side, accountId, sortKeyOf, colorKeyOf, gRank) {  const accId = accountId || null;
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
