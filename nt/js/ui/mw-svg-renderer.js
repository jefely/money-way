/**
 * Money Way · 纯 SVG 渲染器
 * 层：第五层 · UI（只拼字符串）
 *
 * 硬性约束（用户要求）：
 *   **本文件里绝对不能出现三角函数（sin / cos）或任何角度计算。**
 *   所有坐标、线宽、颜色、透明度都由第三层算好，这里只做字符串拼接。
 *
 * 它认识的输入（全部来自 graph/）：
 *   blocks[]  { acc, a1, a2, type, category }
 *   chords[]  { txIdx, from_id, to_id, path:{from,c1,c2,to}, strokeWidth, strokeColor, opacity }
 *   sectors[] { a1, a2, key, type }
 */

export const SVG = {
  size: 1800,
  rOut: 640,
  thick: 44,
  get rIn() { return this.rOut - this.thick; },
};

/** 环形扇区：只用四个点，不做三角函数 */
export function arcPath(rOut, rIn, a1, a2, pointAt, cx, cy) {
  const [x1, y1] = pointAt(cx, cy, rOut, a1);
  const [x2, y2] = pointAt(cx, cy, rOut, a2);
  const [x3, y3] = pointAt(cx, cy, rIn, a2);
  const [x4, y4] = pointAt(cx, cy, rIn, a1);
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M ${f(x1)} ${f(y1)} A ${rOut} ${rOut} 0 ${large} 1 ${f(x2)} ${f(y2)}`
    + ` L ${f(x3)} ${f(y3)} A ${rIn} ${rIn} 0 ${large} 0 ${f(x4)} ${f(y4)} Z`;
}

/** 和弦：坐标全在 path 里，这里只拼 C 指令 */
export function chordPath(p) {
  return `M ${f(p.from[0])} ${f(p.from[1])}`
    + ` C ${f(p.c1[0])} ${f(p.c1[1])}, ${f(p.c2[0])} ${f(p.c2[1])}, ${f(p.to[0])} ${f(p.to[1])}`;
}

/**
 * 渲染整张图。
 * @param {{
 *   blocks:Array, chords:Array, sectors?:Array,
 *   pointAt:(cx:number,cy:number,r:number,a:number)=>number[],
 *   colorOf:(colorKey:string)=>string,
 *   opacityOf?:(chord:object)=>number,
 *   highlight?:Set<number>|null
 * }} data
 * @returns {string} SVG 字符串
 */
export function renderChart(data) {
  const d = data || {};
  const blocks = d.blocks || [];
  const chords = d.chords || [];
  const sectors = d.sectors || [];
  const pointAt = d.pointAt;
  const colorOf = d.colorOf || (() => '#888');

  const { size, rOut, rIn } = SVG;
  const cx = size / 2;
  const cy = size / 2;
  const parts = [];

  parts.push(`<svg viewBox="0 0 ${size} ${size}" width="100%" preserveAspectRatio="xMidYMid meet"`
    + ` shape-rendering="geometricPrecision">`);

  // ① 分类扇区的分界线（同类聚合、类间 0.8° 的视觉呈现）
  for (const s of sectors) {
    parts.push(`<path class="mw-sector-line"`
      + ` d="${arcPath(rOut, rIn, s.a1, s.a2, pointAt, cx, cy)}"`
      + ` fill="none" stroke="currentColor" stroke-width="0.6" stroke-opacity="0.18"/>`);
  }

  // ② 连线：坐标 / 线宽 / 颜色 / 透明度全部现成
  for (const c of chords) {
    const op = typeof c.opacity === 'number'
      ? c.opacity
      : (d.opacityOf ? d.opacityOf(c) : 0.2);
    parts.push(`<path class="mw-chord" d="${chordPath(c.path)}"`
      + ` fill="none" stroke="${c.strokeColor}"`
      + ` stroke-width="${c.strokeWidth}" stroke-opacity="${op}"`
      + ` stroke-linecap="round" data-tx="${c.txIdx}"/>`);
  }

  // ③ 弧块
  for (const b of blocks) {
    parts.push(`<path class="mw-ring" d="${arcPath(rOut, rIn, b.a1, b.a2, pointAt, cx, cy)}"`
      + ` fill="${colorOf(b.colorKey)}" fill-opacity="1"`
      + ` stroke="var(--nt-bg-line)" stroke-width="0.6"`
      + ` data-node="${esc(b.acc)}"/>`);
  }

  parts.push('</svg>');
  return parts.join('');
}

/** 数字固定一位小数，减小 SVG 体积 */
function f(n) {
  return Number(n).toFixed(1);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
