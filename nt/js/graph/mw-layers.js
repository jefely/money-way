// 界面：路径 tab → 三层套娃（类型 / 分类 / 实体）的几何与配色
/**
 * Money Way 三层套娃（v4.0 第四部分落地）
 * 层：第三层 · Money Way 数学引擎
 *
 * 从外到内三圈，**共用同一套角度**：
 *
 *   外层（类型）  —— 把内层节点按「类型」聚合成连续弧段
 *   中层（分类）  —— 按「类型|分类」聚合成连续弧段
 *   内层（实体）  —— 具体节点的弧块
 *
 * 不另算角度：外层/中层只是内层的**聚合视图**，边界天然对齐。
 * 现有缝隙本来就留在分类之间，也就顺便把类型分开了 ——
 * 三层各自再算一套缝隙只会让三圈对不齐。
 *
 * 配色（v4.0 §4.2）：
 *   外层 全局固定色系（费用红 / 资产蓝 / 收入绿 / 负债橙 / 权益紫 / 成本灰）
 *   中层 同色系微调（在所属类型的色相上动明度与饱和度）
 *   内层 每个节点一个专属色（maximin 调色板；超过 24 个退黄金角）
 *
 * 内层没用「哈希 + 137.5°」：那是 2026-10 实测否掉的方案（第 10 个分类撞两个绿），
 * 用户 2026-11 已裁决保持 maximin。要改回黄金角只需动 nodeColor 一处。
 */

/**
 * 环的两层厚度比例：外 10% · 内 90%。
 *
 * 中层（统计分类）2026-11 拿掉了：分类本身在角度上就有 0.8° 的缝，
 * 聚合后再画一圈同色系的分类带，等于把「分类边界」说两遍，还多出一整圈颜色。
 * 现在外层只留一条**细线**表示六大类型，其余全给节点弧块。
 */
const BAND = { type: 0.1, gap: 0.05, node: 0.85 };

/**
 * 两层同心环的半径。
 *
 * @param {number} rOut 最外沿
 * @param {number} rIn  最内沿（= R_connect，连线从这里射出）
 * @param {{typeWidth?:number, typeGap?:number}} [opts]
 *        typeWidth 外圈细线占环厚的比例（默认 0.1）
 *        typeGap   细线与节点环之间的空隙，同样是**环厚的比例**（默认 0.05）
 *        两个都在面板「环图·几何」里可调（2026-11 用户要求）。
 * @returns {{r3:number,r2:number,r1:number,r0:number,typeBand:number,catBand:number,nodeBand:number}}
 */
export function ringRadii(rOut, rIn, opts) {
  const out = Number(rOut) || 0;
  const inn = Number(rIn) || 0;
  const thick = Math.max(1, out - inn);
  const clamp01 = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(0.9, Math.max(0, n)) : d;
  };
  const tw = clamp01(opts && opts.typeWidth, BAND.type);
  const tg = clamp01(opts && opts.typeGap, BAND.gap);
  const typeBand = thick * tw;
  // 节点环的外沿：细线内沿再往里让出 typeGap；
  // 上界受 r2 约束（再大的间距也不能把 r1 顶到细线外面去）
  const r2 = out - typeBand;
  const r1 = Math.min(r2, Math.max(r2 - thick * tg, inn));
  const nodeBand = Math.max(1, r1 - inn);
  // r1 曾经是「分类与节点的分界」，分类圈撤掉后它就是节点环的外沿
  return {
    r3: out,
    r2,
    r1,
    r0: Math.max(0, r1 - nodeBand),
    typeBand,
    catBand: 0,
    nodeBand,
  };
}

/** 类型固定色（色相 / 饱和度 / 明度） */
export const TYPE_HSL = {
  资产类: [214, 85, 56],
  费用类: [2, 80, 52],
  收入类: [150, 65, 42],
  负债类: [28, 85, 55],
  权益类: [272, 55, 55],
  成本类: [220, 14, 52],
  其它: [0, 0, 52],
};

function hsl(h, s, l) {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/**
 * 弦线颜色 = 转出节点的弧色。
 * 两边必须走这一个函数，避免弧块用一套、弦又用分类色。
 */
export function outgoingArcColor(nodeColorOf, fromId) {
  const colorOf = nodeColorOf || (() => '');
  return colorOf(fromId);
}

/** 外层：类型固定色 */
export function typeColor(type) {
  const c = TYPE_HSL[type] || TYPE_HSL['其它'];
  return hsl(c[0], c[1], c[2]);
}

/**
 * 中层：同色系微调。
 *
 * **2026-11 起界面不再使用**（分类圈已取消，见 BAND 的注释）。
 * 函数留着是因为「分类聚合」本身仍由 buildArcs 提供，
 * 将来若要把分类圈加回来，配色只需要这一个函数。
 *
 * @param {string} type 类型
 * @param {number} index 该类型内部的分类序号
 */
export function categoryTint(type, index) {
  const c = TYPE_HSL[type] || TYPE_HSL['其它'];
  const i = Math.max(0, Math.floor(Number(index) || 0));
  // 只做轻微的明度/饱和度呼吸：幅度太大时红系会飘成黄/粉，看着像串了色
  const dl = ((i % 4) - 1.5) * 6;          // −9 … +9
  const ds = (Math.floor(i / 4) % 2 ? 1 : -1) * 8;
  return hsl(c[0], Math.min(95, Math.max(18, c[1] + ds)), Math.min(82, Math.max(26, c[2] + dl)));
}

/**
 * 统计分类调色板 —— **24 色，任意两色的 CIELAB ΔE76 ≥ 24**。
 *
 * 为什么不用「黄金角按序取色」：分类到 10 个左右时，第 1 个和第 9 个会撞成
 * 两个差不多的绿色（137.5° 与 283.5° 的补角），用户实测「两个绿色是一对，
 * 线也几乎同色，分不清」。这张表是离线在 HSL 网格里用**贪心 maximin** 挑的：
 * 每加一个分类取「离已选颜色最远」的那一个，所以它的每个前缀都是好分布。
 */
export const CATEGORY_PALETTE = [
  [0, 66, 52], [120, 85, 48], [240, 85, 48], [190, 85, 48],
  [50, 85, 76], [300, 85, 76], [150, 75, 34], [250, 55, 34],
  [35, 55, 34], [330, 65, 34], [295, 85, 48], [350, 55, 76],
  [215, 85, 62], [65, 85, 48], [35, 85, 48], [160, 85, 76],
  [70, 65, 34], [320, 85, 48], [205, 55, 34], [140, 85, 62],
  [260, 75, 62], [5, 55, 34], [15, 65, 62], [225, 55, 76],
];

const GOLDEN_ANGLE = 137.508;

/**
 * 内层：节点专属色。
 *
 * **2026-11 修正（第三次）：同一个类型里，任意两个节点都要分得开，不只是相邻。**
 *
 * 前两版都不够：
 *   ① 按全局序号取 maximin 调色板 —— 同类型相邻拿「浅蓝 / 蓝」，缠成一团；
 *   ② 黄金角 137.5° —— 相邻确实差了 137°，但**隔 5 个就绕回来**：
 *      i=1 是 137°、i=6 是 105°，都是绿。资产类一旦有 7 个账户就出现「两个绿」，
 *      而资产类内部本来就有互转，这两团绿线会在环里交叉。
 *
 * 现在改成**按类型内的节点总数均匀分布色相**：
 *
 *     第 i 个（共 n 个）= 色相 offset + i × 360/n，明度按 i 三档轮转
 *
 * n=3 → 0°/120°/240°；n=6 → 每 60° 一个，再叠明度 44/62/36 交替。
 * 均匀分布是「n 个点铺满色相环」的最优解，任意两点的最小间隔就是 360/n。
 *
 * @param {number} index 类型内序号
 * @param {number} count 该类型的节点总数（n；不传按 12 处理）
 * @param {number} offset 类型的色相起点（不同类型错开，避免两类共用一组颜色）
 */
export function nodeColor(index, count, offset) {
  const n = Math.max(1, Math.floor(Number(count) || 0) || 12);
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const k = i % n;
  const ring = Math.floor(i / n);
  const hue = ((Number(offset) || 0) + (k * 360) / n) % 360;
  const light = [44, 62, 36][(k + ring) % 3];
  const sat = 72 + (k % 2) * 12;
  return hsl(hue, sat, light);
}

/**
/**
 * 把排好序的槽位聚合成外层（类型）与中层（分类）的弧段。
 * 槽位已按 `类型|分类 → 账户 → 时间` 排过，所以同类型/同分类必然连续。
 *
 * @param {Array<{a1:number,a2:number,type:string,category:string,sortKey:string,acc:string}>} slots
 * @returns {{types:Array, cats:Array}}
 */
export function buildArcs(slots) {
  const types = [];
  const cats = [];
  for (const sl of slots) {
    if (!sl || !sl.acc) continue;
    const lastT = types[types.length - 1];
    if (lastT && lastT.type === sl.type) lastT.a2 = sl.a2;
    else types.push({ type: sl.type, a1: sl.a1, a2: sl.a2 });

    const lastC = cats[cats.length - 1];
    if (lastC && lastC.sortKey === sl.sortKey) lastC.a2 = sl.a2;
    else {
      cats.push({
        sortKey: sl.sortKey, type: sl.type, category: sl.category, a1: sl.a1, a2: sl.a2,
      });
    }
  }
  return { types, cats };
}
