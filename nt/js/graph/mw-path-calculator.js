/**
 * Money Way · 连线样式与几何计算
 * 层：第三层 · 数学引擎（纯计算）
 *
 * 三条铁律（用户定义，这里是唯一定义处）：
 *   ① 线粗由**转入账户类型**决定：费用 4× · 资产 3× · 负债 2× · 权益/收入 1×
 *   ② 线色由**转入账户的统计分类**决定（同分类同色）
 *   ③ 1 倍线粗 = 1 个细粒度单位对应的弧长 × 80%
 *
 * **本文件不出现任何字符串拼接**（不许有 '<path'），也不碰 DOM。
 */

import { ACCOUNT_TYPE } from '../core/schema.js';

/** 线宽权重：越靠近"钱真正花掉的地方"越粗 */
export const WEIGHT_MAP = {
  [ACCOUNT_TYPE.EXPENSE]: 4.0,    // 费用类：终点，最粗
  [ACCOUNT_TYPE.ASSET]: 3.0,      // 资产类：中转主动脉
  [ACCOUNT_TYPE.LIABILITY]: 2.0,  // 负债类：杠杆
  [ACCOUNT_TYPE.EQUITY]: 1.0,     // 权益类：期初/本金，背景板
  [ACCOUNT_TYPE.INCOME]: 1.0,     // 收入类：源头，背景板
};

/** 1 倍线粗 相对「单位弧长」的比例 */
export const UNIT_WIDTH_RATIO = 0.8;

/** 颜色饱和度/亮度（固定，保证同分类同色且可读） */
export const COLOR_SAT = 62;
export const COLOR_LIGHT = 52;

/** 黄金角：让相邻分类颜色差异最大 */
const GOLDEN_ANGLE = 137.508;

/**
 * 分类色：同一个 key（分类|子类）永远同一色。
 * @param {Map<string, number>} colorIndex groupKey → 序号
 * @param {string} groupKey
 */
export function categoryColor(colorIndex, groupKey) {
  const i = colorIndex instanceof Map ? (colorIndex.get(groupKey) || 0) : 0;
  const hue = (i * GOLDEN_ANGLE) % 360;
  return `hsl(${hue.toFixed(1)}, ${COLOR_SAT}%, ${COLOR_LIGHT}%)`;
}

/**
 * 一条线的样式。
 * @param {{to_id:string, from_id:string}} link
 * @param {{byId:Map, groupKeyOf:(id:string)=>string, colorIndex:Map}} ctx
 * @param {number} unitArcLen 1 个细粒度单位的弧长（由 slot calculator 给）
 * @returns {{strokeWidth:number, strokeColor:string, weight:number, targetType:string}}
 */
export function calcLinkStyle(link, ctx, unitArcLen) {
  const acc = ctx && ctx.byId ? ctx.byId.get(link && link.to_id) : null;
  const targetType = (acc && acc.type) || ACCOUNT_TYPE.ASSET;
  const weight = WEIGHT_MAP[targetType] || 1.0;

  const baseWidth = Math.max(0.4, (Number(unitArcLen) || 0) * UNIT_WIDTH_RATIO);
  const groupKey = ctx && ctx.groupKeyOf ? ctx.groupKeyOf(link && link.to_id) : '';
  const strokeColor = categoryColor(ctx && ctx.colorIndex, groupKey);

  return {
    strokeWidth: round2(baseWidth * weight),
    strokeColor,
    weight,
    targetType,
  };
}

/**
 * 极坐标 → 屏幕坐标。**这是整个项目唯一允许出现 Math.sin/cos 的地方**，
 * 渲染器只读结果。
 */
export function pointAt(cx, cy, r, angle) {
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

/** 三次贝塞尔的控制点：沿半径缩到 k */
export const BEZIER_K = 0.34;

/**
 * 一条 chord 的完整几何（起终点 + 两个控制点），全部算好交给渲染器。
 * @returns {{from:number[], to:number[], c1:number[], c2:number[]}}
 */
export function chordGeometry(cx, cy, rIn, aFrom, aTo, k = BEZIER_K) {
  const from = pointAt(cx, cy, rIn, aFrom);
  const to = pointAt(cx, cy, rIn, aTo);
  const c1 = [cx + (from[0] - cx) * k, cy + (from[1] - cy) * k];
  const c2 = [cx + (to[0] - cx) * k, cy + (to[1] - cy) * k];
  return { from, to, c1, c2 };
}

/**
 * 把几何 + 样式合成「一条待渲染的线」。**渲染器只读这个对象。**
 */
export function buildChord(input) {
  const {
    txIdx, from_id, to_id, aFrom, aTo,
    cx, cy, rIn, ctx, unitArcLen,
  } = input;

  const geo = chordGeometry(cx, cy, rIn, aFrom, aTo);
  const style = calcLinkStyle({ from_id, to_id }, ctx, unitArcLen);

  return {
    txIdx,
    from_id,
    to_id,
    path: {
      from: geo.from,
      c1: geo.c1,
      c2: geo.c2,
      to: geo.to,
    },
    strokeWidth: style.strokeWidth,
    strokeColor: style.strokeColor,
    weight: style.weight,
    targetType: style.targetType,
  };
}

/**
 * 聚焦模式的透明度（全局 vs 命中）。
 * 用户定义：全局 0.2；命中点亮，其余降到 0.02。
 */
export const OPACITY = {
  GLOBAL: 0.2,
  HIT: 0.95,
  RELATED: 0.55,
  DIM: 0.02,
};

/**
 * 按「是否命中 / 是否相关」给一条线定透明度。
 * @param {{hit:boolean, related:boolean}} state
 */
export function linkOpacity(state) {
  if (!state || !state.active) return OPACITY.GLOBAL;
  if (state.hit) return OPACITY.HIT;
  if (state.related) return OPACITY.RELATED;
  return OPACITY.DIM;
}

/** 细粒度单位角（度）——用户给的公式 */
export function unitDegree(groupCount, txCount) {
  const groups = Math.max(0, Math.floor(Number(groupCount) || 0));
  const txs = Math.max(0, Math.floor(Number(txCount) || 0));
  const units = txs * 2;
  if (!units) return 0;
  const avail = Math.max(60, 360 - groups * 0.8);
  return avail / units;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
