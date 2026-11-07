// 界面：（无界面）列宽压缩与拖动上限的纯计算
/**
 * 列宽计算
 * 层：第一层 · 数据基座（纯函数，零依赖、不碰 DOM）
 *
 * 「铺满型」表格（节点设置、流水记录）都是同一个模型：
 *
 *   表宽 = max(容器宽, 最小宽度)
 *   一部分列有独立列宽（参数里的 px），可拖
 *   剩下的列不写宽度，吃剩余空间
 *
 * 本文件只管这个模型里需要算的两件事：
 *   ① fitWidths —— 屏太窄、固定列加起来放不下时，把它们压进预算
 *   ② maxDragWidth —— 拖一列时它最多能到多宽（不能被它挤死的「剩余列」定上限）
 *
 * 拆出来的理由：这两条是纯算术，必须能在 node 里直接测
 *（见 tests/table-fit.test.mjs），不能埋在 DOM 代码里靠截图对。
 */

/** 压到极限时的默认下限：再窄就连一个字都放不下 */
const FLOOR = 30;

/**
 * 把一组固定列压进预算。
 *
 * 两级：caps 能压进就按 caps（手机上的「够用宽度」）；还不行就等比缩到刚好。
 *
 * @param {number[]} widths 参数里的列宽（px）
 * @param {number[]} caps   这一列在窄屏上最多需要多宽（Infinity = 不限）
 * @param {number} budget   这几个列能用的总宽（= 容器宽 - 吃剩余列的下限 - 按钮列）
 * @param {number} [floor]  等比缩时的绝对下限
 * @returns {number[]|null} 压过之后的宽度；不需要压时返回 null
 */
export function fitWidths(widths, caps, budget, floor) {
  const n = widths.length;
  if (!n) return null;
  const lo = Number.isFinite(floor) ? floor : FLOOR;
  const total = widths.reduce((s, w) => s + w, 0);
  // 够宽：一个像素都不动
  if (total <= budget) return null;

  const capped = widths.map((w, i) => Math.min(w, capOf(caps, i)));
  const cappedTotal = capped.reduce((s, w) => s + w, 0);
  if (cappedTotal <= budget) return capped.map((w) => Math.round(w));

  const k = budget / (cappedTotal || 1);
  const out = capped.map((w) => Math.max(lo, Math.round(w * k)));

  // 四舍五入会让总和比预算多 1~2px；在手机上那就是一条 1px 宽的横向滚动条。
  // 从最宽的那列往下扣，扣到刚好为止（扣不动 = 全部到了下限，认了）。
  let over = out.reduce((s, w) => s + w, 0) - budget;
  while (over > 0) {
    let widest = -1;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] > lo && (widest < 0 || out[i] > out[widest])) widest = i;
    }
    if (widest < 0) break;
    out[widest] -= 1;
    over -= 1;
  }
  return out;
}

function capOf(caps, i) {
  const c = caps && caps[i];
  return Number.isFinite(c) ? c : Infinity;
}

/**
 * 拖一列时它能到的最大宽度。
 *
 * 「吃剩余」的那一列是表里唯一的弹性来源：把谁拖宽，它就变窄。
 * 所以上限 = 这一列现在的宽度 + 剩余列还有多少余量（现在 - 下限）。
 * 拖到头时表宽仍然恰好等于容器宽 —— **不会拖出横滑**。
 *
 * @param {number} startW 拖动开始时这一列的宽度
 * @param {number} shareNow 吃剩余的列现在的宽度
 * @param {number} shareMin 吃剩余的列的下限
 */
export function maxDragWidth(startW, shareNow, shareMin) {
  const slack = Math.max(0, Number(shareNow || 0) - Number(shareMin || 0));
  return Math.round(startW + slack);
}
