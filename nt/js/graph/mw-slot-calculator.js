/**
 * ☐7 槽位角度计算器 ★核心
 * 层：第三层 · Money Way 数学引擎
 *
 * 把「一批单笔流水」变成「环上的角度」：
 *   · 单位数 N_UNITS = 笔数 × 2（每笔在转出端、转入端各占一个）
 *   · 每个统计分类之间固定留 GAP_DEG = 0.8° 的缝
 *   · 剩下角度平均分给所有单位
 *   · 排序键：分类 → 账户 → 时间
 *   · 相邻同账户的槽位合并成弧块 blocks
 *
 * 输出**纯数据**（弧度），不碰 SVG、不拼字符串。
 * 验收：Σ(单位角) + Σ(间隙角) = 2π（误差 < 1e-9）。
 */

export const CAT_ORDER = ['权益类', '负债类', '费用类', '资产类', '收入类', '其它'];
export const GAP_DEG = 0.8;
export const START_ANG = -Math.PI / 2;   // 9 点钟

/**
 * @param {Array<{from:string,to:string,catFrom:string,catTo:string,date:string,amount:number,id:any}>} txs
 * @param {(name:string)=>string} subOf 取账户的统计子类
 * @returns {{slots:Array, blocks:Array, unit:number, gapRad:number, units:number, unitDeg:number}}
 */
export function computeSlots(txs, subOf) {
  const list = txs || [];
  const gapRad = (GAP_DEG * Math.PI) / 180;

  // ① 分类组（cat|sub），按 CAT_ORDER 再按 sub 排
  const groups = new Map();
  for (const x of list) {
    const add = (name, cat) => {
      if (!name) return;
      const c = CAT_ORDER.includes(cat) ? cat : '其它';
      const key = c + '|' + (subOf ? subOf(name) : '未分类');
      if (!groups.has(key)) groups.set(key, { key, cat: c, sub: subOf ? subOf(name) : '未分类' });
    };
    add(x.from, x.catFrom);
    add(x.to, x.catTo);
  }
  const groupList = [...groups.values()].sort((A, B) => {
    const ia = CAT_ORDER.indexOf(A.cat);
    const ib = CAT_ORDER.indexOf(B.cat);
    if (ia !== ib) return ia - ib;
    return A.sub < B.sub ? -1 : A.sub > B.sub ? 1 : 0;
  });
  const gRank = new Map(groupList.map((g, i) => [g.key, i]));

  // ② 单位数与单位角
  const units = list.length * 2;
  const availDeg = Math.max(60, 360 - groupList.length * GAP_DEG);
  const unitDeg = units > 0 ? availDeg / units : 0;
  const unit = (unitDeg * Math.PI) / 180;

  // ③ 槽位：每笔两个（f = 转出端，t = 转入端）
  const slots = [];
  list.forEach((x, i) => {
    slots.push(makeSlot(x, i, 'f', x.from, x.catFrom, subOf, gRank));
    slots.push(makeSlot(x, i, 't', x.to, x.catTo, subOf, gRank));
  });

  // ④ 排序：分类组 → 账户名 → 时间/索引
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
    if (prevKey !== null && sl.groupKey !== prevKey) ang += gapRad;
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
    if (last && last.acc === sl.acc) { last.a2 = sl.a2; last.n += 1; }
    else blocks.push({ acc: sl.acc, cat: sl.cat, sub: sl.sub, a1: sl.a1, a2: sl.a2, n: 1 });
  }

  return { slots, blocks, unit, gapRad, units, unitDeg, groupList };
}

function makeSlot(x, txIdx, side, name, cat, subOf, gRank) {
  const c = CAT_ORDER.includes(cat) ? cat : '其它';
  const sub = name && subOf ? subOf(name) : '';
  return {
    acc: name || null,
    cat: c,
    sub,
    groupKey: name ? c + '|' + sub : '\u0000EMPTY',
    txIdx,
    side,
    empty: !name,
    amount: x.amount,
    date: x.date,
    gRank: name ? (gRank.get(c + '|' + sub) ?? 9998) : 9999,
  };
}
