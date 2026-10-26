/**
 * ☐13 Money Way 纯 SVG 渲染器
 * 层：第五层 · UI 渲染
 *
 * 消费第三层算好的 JSON（slots / blocks / chords），拼出 <path>。
 *
 * 硬性验收（CODE-RULES / CHECKLIST ☐13）：
 *   **代码里绝对找不到 Math.sin、Math.cos 或任何角度计算公式。**
 *   弧块端点直接读 item.a1 / item.mid 经 pointAt 换算 —— 而 pointAt 属于第三层。
 *   本文件只做：读坐标、拼字符串、绑交互。
 */

import { pointAt } from '../graph/mw-path-calculator.js';

export const SVG = {
  size: 1800,
  rOut: 640,
  thick: 44,
  get rIn() { return this.rOut - this.thick; },
};

/** 环形扇区路径（只用传入的四个点，不做三角函数）。 */
export function arcPath(cx, cy, rOut, rIn, a1, a2) {
  const [x1, y1] = pointAt(cx, cy, rOut, a1);
  const [x2, y2] = pointAt(cx, cy, rOut, a2);
  const [x3, y3] = pointAt(cx, cy, rIn, a2);
  const [x4, y4] = pointAt(cx, cy, rIn, a1);
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M ${f(x1)} ${f(y1)} A ${rOut} ${rOut} 0 ${large} 1 ${f(x2)} ${f(y2)}`
    + ` L ${f(x3)} ${f(y3)} A ${rIn} ${rIn} 0 ${large} 0 ${f(x4)} ${f(y4)} Z`;
}

/** 和弦路径：四个点全部来自第三层，这里只拼 C 指令。 */
export function chordPath(c) {
  return `M ${f(c.from[0])} ${f(c.from[1])}`
    + ` C ${f(c.c1[0])} ${f(c.c1[1])}, ${f(c.c2[0])} ${f(c.c2[1])}, ${f(c.to[0])} ${f(c.to[1])}`;
}

/**
 * 渲染整张图。
 * @param {{slots:Array, blocks:Array, chords:Array, colorOf:(cat:string)=>string}} data
 * @returns {string} SVG 字符串
 */
export function renderChart(data) {
  const { blocks = [], chords = [], colorOf } = data || {};
  const { size, rOut, rIn } = SVG;
  const cx = size / 2;
  const cy = size / 2;
  const parts = [];

  parts.push(`<svg viewBox="0 0 ${size} ${size}" width="100%" preserveAspectRatio="xMidYMid meet">`);

  // 弦
  for (const c of chords) {
    parts.push(`<path d="${chordPath(c)}" fill="none" stroke="${colorOf ? colorOf(c.cat) : '#888'}"`
      + ` stroke-width="${c.width}" stroke-opacity="0.52" stroke-linecap="round"`
      + ` class="mw-edge" data-tx="${c.txIdx}"/>`);
  }

  // 弧块
  for (const b of blocks) {
    parts.push(`<path d="${arcPath(cx, cy, rOut, rIn, b.a1, b.a2)}"`
      + ` fill="${colorOf ? colorOf(b.cat) : '#888'}" stroke="#6b7280" stroke-width="0.6"`
      + ` class="mw-ring" data-node="${b.acc}"/>`);
  }

  parts.push('</svg>');
  return parts.join('');
}

/** 数字固定一位小数（减少 SVG 体积）。 */
function f(n) {
  return Number(n).toFixed(1);
}
