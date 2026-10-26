/**
 * ☐8 和弦路径与层级计算器 ★核心
 * 层：第三层 · Money Way 数学引擎
 *
 * 两件事，都是纯几何：
 *   ① 每笔流水一条三次贝塞尔 —— 控制点沿半径缩到 k = 0.34
 *   ② 从费用类出发 BFS 算 depth，映射线宽 [6, 4.8, 3.6, 2.4, 1.2]
 *
 * 输出**只含坐标点 / depth / 颜色**的纯数据 JSON。
 * **本文件里不许出现 '<path' 之类的字符串拼接。**
 */

export const BEZIER_K = 0.34;
export const DEPTH_W = [6, 4.8, 3.6, 2.4, 1.2];

/** 极坐标 → 屏幕坐标（12 点起顺时针）。 */
export function pointAt(cx, cy, r, a) {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/**
 * 从费用类账户出发，向上游 BFS 算层级。
 * @returns {Map<string, number>} name → depth（费用类 = 0）
 */
export function computeDepth(txs, catOf) {
  const byTo = new Map();
  for (const x of txs || []) {
    if (!x.to || !x.from) continue;
    if (!byTo.has(x.to)) byTo.set(x.to, []);
    byTo.get(x.to).push(x.from);
  }
  const depth = new Map();
  const queue = [];
  for (const x of txs || []) {
    for (const nm of [x.from, x.to]) {
      if (nm && catOf && catOf(nm) === '费用类' && !depth.has(nm)) {
        depth.set(nm, 0);
        queue.push(nm);
      }
    }
  }
  let guard = 0;
  while (queue.length && guard++ < 5000) {
    const cur = queue.shift();
    for (const up of byTo.get(cur) || []) {
      if (up && !depth.has(up)) { depth.set(up, depth.get(cur) + 1); queue.push(up); }
    }
  }
  let maxD = 0;
  for (const v of depth.values()) if (v > maxD) maxD = v;
  return { depth, maxD, fallback: maxD + 1 };
}

/** depth → 线宽。 */
export function widthByDepth(depth, d) {
  const v = d === undefined ? DEPTH_W.length - 1 : d;
  return DEPTH_W[Math.min(v, DEPTH_W.length - 1)];
}

/**
 * 生成和弦路径数据。
 * @param {{slots:Array, cx:number, cy:number, rIn:number, txs:Array}} input
 * @returns {{chords:Array<{txIdx:number, from:[number,number], c1:[number,number],
 *            c2:[number,number], to:[number,number], cat:string, width:number, depth:number}>}}
 */
export function computeChords(input) {
  const { slots, cx, cy, rIn, txs } = input;
  const byTx = new Map();
  for (const sl of slots) {
    if (!byTx.has(sl.txIdx)) byTx.set(sl.txIdx, {});
    byTx.get(sl.txIdx)[sl.side] = sl;
  }

  const chords = [];
  for (const [txIdx, pair] of byTx) {
    const sf = pair.f;
    const st = pair.t;
    if (!sf || !st || sf.empty || st.empty) continue;   // 单边流水：占槽不画线

    const p1 = pointAt(cx, cy, rIn, sf.mid);
    const p2 = pointAt(cx, cy, rIn, st.mid);
    const c1 = [cx + (p1[0] - cx) * BEZIER_K, cy + (p1[1] - cy) * BEZIER_K];
    const c2 = [cx + (p2[0] - cx) * BEZIER_K, cy + (p2[1] - cy) * BEZIER_K];

    chords.push({
      txIdx,
      from: p1,
      c1,
      c2,
      to: p2,
      cat: st.cat,
      amount: (txs && txs[txIdx] && txs[txIdx].amount) || 0,
      width: DEPTH_W[0],
      depth: 0,
    });
  }
  return { chords };
}
