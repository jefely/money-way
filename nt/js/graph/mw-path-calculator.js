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

/**
 * 线宽档位（照单文件版 DEPTH_W）：**只在激活追踪时**才按「离费用端几跳」取档。
 * 0 级（费用类本身）最粗，往上逐级变细。
 */
export const DEPTH_WIDTHS = [6, 4.8, 3.6, 2.4, 1.2];

/** 默认线宽：单文件版所有线统一 2.4（W_MID），不是按弧长算出来的 */
export const W_MID = 2.4;
/** 追踪命中时在 depth 宽度上再加权 */
export const PICK_BOOST = 1.35;
/** 追踪时其它线的收缩系数 */
export const PICK_SHRINK = 0.45;

/**
 * 逆流 / 顺流 = **两套完全独立的样式规则**，不是同一条规则的镜像。
 *
 * 每一套自己决定：
 *   colorBy     连线颜色取哪一端的统计分类（转入方 / 转出方）
 *   traceWidth  第 4 模式（追踪）的线宽表，看那一端的账户类型
 *
 * 其它模式的线宽（基本 / 单线 / 色块）两套方向**相同**，只有颜色跟着换。
 * 线宽是基准单位，渲染时 × RATIO；非命中线一律压到 TRACE_FLOOR。
 *
 * 顺流表里的「储蓄」= 账户类型里的资产类（本账本只有这五个类型）。
 */
export const STYLE_UP = {
  // 逆流：看转入方。越接近「钱真正花掉的地方」越粗。
  colorBy: 'to',
  traceWidth: { 费用: 6, 资产: 3.6, 负债: 2.4, 收入: 1.2, 权益: 1.2 },
};

export const STYLE_DOWN = {
  // 顺流：看转出方。越接近「钱从哪来」越粗。
  colorBy: 'from',
  traceWidth: { 收入: 6, 权益: 6, 负债: 4, 资产: 2.4, 费用: 1.2 },
};

/** 追踪模式下非命中线 / 认不出类型的兜底线宽 */
export const TRACE_FLOOR = 1.2;

/**
 * 取某一方向的整套样式规则。
 * @param {'up'|'down'} dir up = 逆流，down = 顺流
 */
export function styleOf(dir) {
  return dir === 'down' ? STYLE_DOWN : STYLE_UP;
}

/**
 * 追踪模式的线宽：在那一套规则里，按这一端的账户类型查表。
 * @param {string} type 账户类型（费用类 / 资产类 / 负债类 / 收入类 / 权益类）
 * @param {'up'|'down'} dir 逆流看转入方、顺流看转出方
 */
export function traceWidthOf(type, dir) {
  const table = styleOf(dir).traceWidth;
  const s = String(type || '');
  for (const k of Object.keys(table)) if (s.includes(k)) return table[k];
  return TRACE_FLOOR;
}

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
 * @param {{colorBy?:'to'|'from'}} opts 颜色取哪一端的统计分类：
 *   逆流（默认）看转入方，顺流看转出方。**只影响颜色，不改线宽权重**。
 */
export function calcLinkStyle(link, ctx, unitArcLen, opts) {
  const colorBy = opts && opts.colorBy === 'from' ? 'from' : 'to';
  const colorId = colorBy === 'from'
    ? (link && link.from_id)
    : (link && link.to_id);
  const acc = ctx && ctx.byId ? ctx.byId.get(link && link.to_id) : null;
  const targetType = (acc && acc.type) || ACCOUNT_TYPE.ASSET;
  const weight = WEIGHT_MAP[targetType] || 1.0;

  const unit = Number(unitArcLen) || 0;
  const raw = unit * UNIT_WIDTH_RATIO * weight;
  const strokeWidth = clamp(raw, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH);

  // 颜色只认统计分类（哪一端由方向决定）
  const colorKey = ctx && ctx.colorKeyOf ? ctx.colorKeyOf(colorId) : '';
  const strokeColor = categoryColor(ctx && ctx.colorIndex, colorKey);

  return {
    strokeWidth: round2(strokeWidth),
    strokeColor,
    colorKey,
    colorBy,
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
 *
 * `colorBy` 决定颜色取哪一端（逆流看转入方 / 顺流看转出方）；
 * `fromType` / `toType` 都给出来，第 4 模式的线宽按方向选一端。
 */
export function buildChord(input) {
  const { txIdx, from_id, to_id, aFrom, aTo, cx, cy, rIn, ctx, unitArcLen, colorBy } = input;

  const geo = chordGeometry(cx, cy, rIn, aFrom, aTo);
  const style = calcLinkStyle({ from_id, to_id }, ctx, unitArcLen, { colorBy });

  // 线宽：**默认统一 W_MID**（单文件版就是这么画的）。
  // 只有激活追踪（有 hits）时，渲染层才按 DEPTH_WIDTHS 按层级调 —— 见 ui/path-view.js。
  let strokeWidth = style.strokeWidth;
  let depth = null;
  const depthOf = ctx && ctx.depthOf;
  if (depthOf && typeof depthOf.get === 'function') {
    const dv = depthOf.get(String(to_id));
    if (Number.isFinite(dv)) {
      depth = dv;
      strokeWidth = DEPTH_WIDTHS[Math.min(dv, DEPTH_WIDTHS.length - 1)];
    }
  }

  const fromAcc = (ctx && ctx.byId && ctx.byId.get(String(from_id))) || {};
  const toAcc = (ctx && ctx.byId && ctx.byId.get(String(to_id))) || {};

  return {
    txIdx,
    from_id,
    to_id,
    depth,
    path: { from: geo.from, c1: geo.c1, c2: geo.c2, to: geo.to },
    strokeWidth,
    strokeColor: style.strokeColor,
    // 两端的账户类型都给出来：第 4 模式逆流看 toType、顺流看 fromType
    fromType: fromAcc.type || '',
    toType: toAcc.type || '',
    colorKey: style.colorKey,
    colorBy: style.colorBy,
    weight: style.weight,
    targetType: style.targetType,
  };
}

export const OPACITY = {
  GLOBAL: 0.52,
  HIT: 0.95,
  RELATED: 0.55,
  DIM: 0.25,
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
