// 界面：（无界面）路径计算
/**
 * Money Way · 连线样式与几何计算
 * 层：第三层 · 数学引擎（纯计算）
 *
 * 三条铁律（用户定义，这里是唯一定义处）：
 *   ① 线粗由**转入账户类型**决定：费用 4× · 资产 3× · 负债 2× · 权益/收入 1×
 *   ② 线色由**转入账户的统计分类**决定（同分类同色；**颜色数 = 分类数**，与类型无关）
 *   ③ 1 倍线粗 = 1 个细粒度单位对应的弧长 × 80%
 *
 * **本文件不出现任何字符串拼接**（不许有 '<path'），也不碰 DOM。
 */

import { ACCOUNT_TYPE } from '../core/schema.js';

/** 线宽权重：越靠近"钱真正花掉的地方"越粗 */
export const WEIGHT_MAP = {
  [ACCOUNT_TYPE.EXPENSE]: 4.0,
  [ACCOUNT_TYPE.ASSET]: 3.0,
  [ACCOUNT_TYPE.LIABILITY]: 2.0,
  [ACCOUNT_TYPE.EQUITY]: 1.0,
  [ACCOUNT_TYPE.INCOME]: 1.0,
};

/** 1 倍线粗 相对「单位弧长」的比例 */
export const UNIT_WIDTH_RATIO = 0.8;

/**
 * 线宽上限（像素，SVG 坐标）。
 *
 * 为什么必须有：公式 `unitArcLen × 0.8 × weight` 在**单位很少**时会失控 ——
 * 只有 3 笔时每个单位占 59.6° 弧长 ≈ 620px，费用类 4 倍就得到 1984px 的线，
 * 比整张画布还粗，直接把图糊死。
 * 真实数据（几百笔）时单位弧长只有几 px，永远碰不到这个上限。
 */
export const MAX_STROKE_WIDTH = 14;

/** 线宽下限：再细也要看得见 */
export const MIN_STROKE_WIDTH = 0.4;

export const COLOR_SAT = 62;
export const COLOR_LIGHT = 52;

/** 黄金角：让相邻分类颜色差异最大 */
const GOLDEN_ANGLE = 137.508;

/**
 * 统计分类色：同一个分类（如"餐饮"）永远同一色，**不管它属于哪个账户类型**。
 * @param {Map<string, number>} colorIndex 分类 → 序号
 * @param {string} colorKey 统计分类
 */
export function categoryColor(colorIndex, colorKey) {
  const i = colorIndex instanceof Map ? (colorIndex.get(colorKey) || 0) : 0;
  const hue = (i * GOLDEN_ANGLE) % 360;
  return `hsl(${hue.toFixed(1)}, ${COLOR_SAT}%, ${COLOR_LIGHT}%)`;
}

/**
 * 一条线的样式。
 * @param {{to_id:string, from_id:string}} link
 * @param {{byId:Map, colorKeyOf:(id:string)=>string, colorIndex:Map}} ctx
 * @param {number} unitArcLen 1 个细粒度单位的弧长（由 slot calculator 给）
 */
export function calcLinkStyle(link, ctx, unitArcLen) {
  const acc = ctx && ctx.byId ? ctx.byId.get(link && link.to_id) : null;
  const targetType = (acc && acc.type) || ACCOUNT_TYPE.ASSET;
  const weight = WEIGHT_MAP[targetType] || 1.0;

  const unit = Number(unitArcLen) || 0;
  const raw = unit * UNIT_WIDTH_RATIO * weight;
  const strokeWidth = clamp(raw, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH);

  // 颜色只认统计分类
  const colorKey = ctx && ctx.colorKeyOf ? ctx.colorKeyOf(link && link.to_id) : '';
  const strokeColor = categoryColor(ctx && ctx.colorIndex, colorKey);

  return {
    strokeWidth: round2(strokeWidth),
    strokeColor,
    colorKey,
    weight,
    targetType,
    clamped: raw > MAX_STROKE_WIDTH,
  };
}

/**
 * 极坐标 → 屏幕坐标。**整个项目唯一允许出现三角函数的地方**，
 * 渲染器只读结果。
 */
export function pointAt(cx, cy, r, angle) {
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

export const BEZIER_K = 0.34;

export function chordGeometry(cx, cy, rIn, aFrom, aTo, k = BEZIER_K) {
  const from = pointAt(cx, cy, rIn, aFrom);
  const to = pointAt(cx, cy, rIn, aTo);
  const c1 = [cx + (from[0] - cx) * k, cy + (from[1] - cy) * k];
  const c2 = [cx + (to[0] - cx) * k, cy + (to[1] - cy) * k];
  return { from, to, c1, c2 };
}

/**
 * 把几何 + 样式合成「一条待渲染的线」。渲染器只读这个对象。
 */
export function buildChord(input) {
  const { txIdx, from_id, to_id, aFrom, aTo, cx, cy, rIn, ctx, unitArcLen } = input;

  const geo = chordGeometry(cx, cy, rIn, aFrom, aTo);
  const style = calcLinkStyle({ from_id, to_id }, ctx, unitArcLen);

  return {
    txIdx,
    from_id,
    to_id,
    path: { from: geo.from, c1: geo.c1, c2: geo.c2, to: geo.to },
    strokeWidth: style.strokeWidth,
    strokeColor: style.strokeColor,
    colorKey: style.colorKey,
    weight: style.weight,
    targetType: style.targetType,
  };
}

export const OPACITY = {
  GLOBAL: 0.2,
  HIT: 0.95,
  RELATED: 0.55,
  DIM: 0.02,
};

export function linkOpacity(state) {
  if (!state || !state.active) return OPACITY.GLOBAL;
  if (state.hit) return OPACITY.HIT;
  if (state.related) return OPACITY.RELATED;
  return OPACITY.DIM;
}

/** 细粒度单位角（度）——与 slot calculator 保持同一公式 */
export function unitDegree(groupCount, txCount) {
  const groups = Math.max(0, Math.floor(Number(groupCount) || 0));
  const units = Math.max(0, Math.floor(Number(txCount) || 0)) * 2;
  if (!units) return 0;
  return Math.max(60, 360 - groups * 0.8) / units;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function clamp(v, lo, hi) {
  const n = Number(v) || 0;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
