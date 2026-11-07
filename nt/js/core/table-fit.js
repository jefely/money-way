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
 *   ① fitWidths —— 屏太窄、固定列加起来放不下时，按原比例压进预算
 *   ② maxDragWidth —— 拖一列时它最多能到多宽（不能被它挤死的「剩余列」定上限）
 *
 * 拆出来的理由：这两条是纯算术，必须能在 node 里直接测
 *（见 tests/table-fit.test.mjs），不能埋在 DOM 代码里靠截图对。
 */

/**
 * 把一组固定列按比例压进预算。
 *
 * 为什么是「按比例」而不是「各列压到各自的够用宽度」：
 * 用户 2026-11 直接给了这一组值（48/37/58/49/97），那就是他要的比例；
 * 屏幕比他这组窄的时候，等比缩才保持他的取舍。下限只用来兜住
 * 「缩到字都放不下」的极端情况。
 *
 * @param {number[]} widths 参数里的列宽（px）
 * @param {number} budget   这几个列能用的总宽（= 容器宽 - 吃剩余列的下限 - 按钮列）
 * @param {Object<string,number>|number[]} [mins] 每列下限（按列名或按下标）
 * @param {string[]} [keys] mins 是对象时，这里给下标对应的列名
 * @returns {number[]|null} 压过之后的宽度；不需要压时返回 null
 */
export function fitWidths(widths, budget, mins, keys) {
  const n = widths.length;
  if (!n) return null;
  const total = widths.reduce((s, w) => s + w, 0);
  // 够宽：一个像素都不动
  if (total <= budget) return null;

  const k = budget / (total || 1);
  const out = widths.map((w, i) => Math.max(minOf(mins, keys ? keys[i] : i), Math.round(w * k)));

  // 下限兜底之后可能又超了（屏特别窄）：从最宽的那列往下扣，扣到刚好为止。
  // 全部到了下限还超，就认了 —— 表略微溢出、出现横滑，总比把列压成看不清强。
  let over = out.reduce((s, w) => s + w, 0) - budget;
  while (over > 0) {
    let widest = -1;
    for (let i = 0; i < n; i += 1) {
      const floor = minOf(mins, keys ? keys[i] : i);
      if (out[i] > floor && (widest < 0 || out[i] > out[widest])) widest = i;
    }
    if (widest < 0) break;
    out[widest] -= 1;
    over -= 1;
  }
  return out;
}

function minOf(mins, key) {
  if (Array.isArray(mins)) {
    const v = mins[key];
    return Number.isFinite(v) ? v : 0;
  }
  const v = mins ? mins[key] : null;
  return Number.isFinite(v) ? v : 0;
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
