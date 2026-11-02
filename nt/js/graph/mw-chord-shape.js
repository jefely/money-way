// 界面：路径 tab → 连线几何（变宽线 / 漏斗形）
/**
 * 变宽线几何（v4.0 §4.3「起点是金额基准宽，终点向目标账户收缩」）
 * 层：第三层 · Money Way 数学引擎
 *
 * 为什么不能用 stroke：SVG 的 `stroke-width` 整条线恒定，
 * 做不出「起点粗、终点细」的漏斗。只能画闭合 path。
 *
 * **2026-11 定稿：整条线的前 70% 保持等宽，后 30% 才开始收窄。**
 * 早先是线性插值（t=0 就是 6、t=1 是 1.2），中段掉到 3.6，看起来「中间会变细」。
 * 改成先平后收之后，中段一直是宽头宽度，只有靠近终点才收尖 —— 指向性还在，但不会糊。
 *
 * 几何用**采样**而不是两段贝塞尔：宽度函数不是线性的（t=0.7 处有个折点），
 * 两段贝塞尔画不出来。采样 16 段在圈上完全看不出折线。
 *
 * 本文件只算点，不碰 SVG 字符串（渲染器负责拼 M/L）。
 */

/** 后 30% 开始收窄 */
export const TAPER_START = 0.7;

/**
 * 采样段数。
 *
 * 16 段时曲率大的地方肉眼能看出「一折一折」（用户 2026-11 反馈）：
 * 一条跨 120° 的线约 2200 画布单位长，16 段每段 137 单位，弯折处就成折线了。
 * 48 段每段约 46 单位（显示约 7px），肉眼已经看不出折角，SVG 体积也只涨三倍
 * （追踪模式命中线通常十几条，可以接受）。
 */
const STEPS = 48;

/** 三次贝塞尔取点 */
function bezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

/** 三次贝塞尔切线（未归一化） */
function bezierTangent(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return [
    a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]),
    a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1]),
  ];
}

/** 宽度函数：前 taperStart 段恒定，之后线性收到 wTo */
export function widthAt(t, wFrom, wTo, taperStart = TAPER_START) {
  const a = Math.max(0, Number(wFrom) || 0);
  const b = Math.max(0, Number(wTo) || 0);
  const s = Math.min(1, Math.max(0, Number(taperStart)));
  if (!(s > 0) || !(s < 1)) {
    // 起点比例被推到 0 或 1 时退化成全程线性 / 全程等宽，不能让公式除零
    return s >= 1 ? a : a + (b - a) * t;
  }
  if (t <= s) return a;
  return a + (b - a) * ((t - s) / (1 - s));
}

/**
 * 变宽线的左右两侧点列（从起点到终点各 STEPS+1 个点）。
 *
 * 渲染器拼法：`M left[0] → L left[1..n] → L right[n..0] → Z`
 *
 * @param {number[]} from 起点
 * @param {number[]} c1   起点控制点
 * @param {number[]} c2   终点控制点
 * @param {number[]} to   终点
 * @param {number} wFrom  起点宽（前 taperStart 段都是这个宽度）
 * @param {number} wTo    终点宽
 * @param {number} [taperStart] 从这条线的百分之几开始收窄（默认 0.7）
 * @returns {{left:number[][], right:number[][]}}
 */
export function ribbonGeometry(from, c1, c2, to, wFrom, wTo, taperStart = TAPER_START) {
  const left = [];
  const right = [];
  const half = (w) => Math.max(0.35, Number(w) || 0) / 2;
  const taper = Number.isFinite(Number(taperStart)) ? Number(taperStart) : TAPER_START;

  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const p = bezierPoint(from, c1, c2, to, t);
    const d = bezierTangent(from, c1, c2, to, t);
    const len = Math.hypot(d[0], d[1]);
    // 切线与零（起终点重合）时给个默认法线，别让整条 path 变 NaN
    const nx = len > 1e-9 ? -d[1] / len : 0;
    const ny = len > 1e-9 ? d[0] / len : 0;
    const h = half(widthAt(t, wFrom, wTo, taper));
    left.push([p[0] + nx * h, p[1] + ny * h]);
    right.push([p[0] - nx * h, p[1] - ny * h]);
  }
  return { left, right };
}

/**
 * 线宽归一化：金额 → 宽度。
 *
 * 用 **平方根** 而不是线性：金额跨两个数量级时，线性会让小额线细到看不见、
 * 大额线糊成一片；面积感知本来就更接近开方。单调性不变，所以「谁粗谁细」仍然严格按金额。
 *
 * @param {number} amount 该笔金额
 * @param {number} maxAmount 当前图里最大的那笔
 * @param {{min?:number,max?:number}} [opt]
 * @returns {number} 像素宽（画布单位）
 */
export function widthByAmount(amount, maxAmount, opt) {
  const lo = Number((opt && opt.min) || 0) || 0.8;
  const hi = Number((opt && opt.max) || 0) || 8;
  const a = Math.max(0, Number(amount) || 0);
  const m = Math.max(a, Number(maxAmount) || 0);
  if (!(m > 0)) return lo;
  const t = Math.sqrt(a / m);
  return lo + (hi - lo) * t;
}

/** 终点收缩比例（旧口径，保留给调用方做默认值参考） */
export const TAPER = 0.35;
