// 界面：路径 tab / path.html → SVG 渲染
﻿/**
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

/**
 * 画布与环的尺寸。
 *
 * 单文件版的基准：`SIZE = 1800`、`R_OUT = 640`、`THICK = 44`（mwDrawSvg 里写死）。
 * 我们按用户要求把画布提到 6000（= 基准的 3.33 倍），所有像素量
 * （环半径、环厚、线宽、字号、描边、文字外移距离）等比放大 ——
 * 只放大画布而线宽字号不变，放大后的图会显得线更细、字更小。
 */
export const BASE_SIZE = 1800;
export const RATIO = 6000 / BASE_SIZE;

export const SVG = {
  size: 6000,
  rOut: Math.round(640 * RATIO),
  thick: Math.round(44 * RATIO),
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
    + ` shape-rendering="geometricPrecision" style="overflow:visible">`);

  // 所有内容包在 <g class="mw-zoom"> 里。
  // 手势的平移/旋转/缩放作用在**这个 g** 上，而不是 <svg> 根元素 ——
  // 对根元素用 CSS transform 时，Chrome 会把它光栅化成一张位图再拉伸，
  // 放大就糊；对内部 <g> 变换是矢量重绘，放到多大都清晰。
  parts.push('<g class="mw-zoom">');

  // ① 分类扇区的分界线（同类聚合、类间 0.8° 的视觉呈现）
  for (const s of sectors) {
    parts.push(`<path class="mw-sector-line"`
      + ` d="${arcPath(rOut, rIn, s.a1, s.a2, pointAt, cx, cy)}"`
      + ` fill="none" stroke="currentColor" stroke-width="${f(0.6 * RATIO)}" stroke-opacity="0.28"/>`);
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
  // 描边照单文件版用中性灰（#6b7280）+ 55% 不透明 ——
  // 之前用 --nt-bg-line（背景色），两个**同色**弧块挨在一起时根本看不出分界。
  for (const b of blocks) {
    parts.push(`<path class="mw-ring" d="${arcPath(rOut, rIn, b.a1, b.a2, pointAt, cx, cy)}"`
      + ` fill="${colorOf(b.colorKey)}" fill-opacity="1"`
      + ` stroke="#6b7280" stroke-width="${f(0.9 * RATIO)}" stroke-opacity="0.55"`
      + ` data-node="${esc(b.acc)}"/>`);
  }

  // ④ 弧块文字：沿半径向外排（照单文件版）
  //    放得下就贴外沿；放不下就往外挪一段并缩字号
  for (const b of blocks) {
    const label = String(b.label || '');
    if (!label) continue;

    const span = b.a2 - b.a1;
    const midA = (b.a1 + b.a2) / 2;
    const arcLen = span * rOut;

    // 字号：下限抬到 13×RATIO —— 侧栏展开时图区只有 400 多 px，
    // 画布 3000 缩下来字号会小到看不清；太窄的块干脆不标字，避免糊成一片
    let fs = Math.max(13 * RATIO, Math.min(28 * RATIO,
      (arcLen / Math.max(1, label.length)) * 1.05,
      (rOut - rIn) * 0.58));

    // 文字大概多宽（中文 1em、西文 0.55em）
    let textW = 0;
    for (const ch of label) textW += (ch.charCodeAt(0) > 255 ? 1 : 0.55) * fs;

    // 放不下就别画了：挤在一起比没有更糟
    if (arcLen < textW * 0.9 && fs < 15 * RATIO) continue;

    const crowded = arcLen < textW * 1.5;
    if (crowded) fs = Math.max(12 * RATIO, fs * 0.85);
    const rText = crowded ? rOut + 46 * RATIO : rOut + 8 * RATIO;

    const p = pointAt(cx, cy, rText, midA);
    let theta = (midA * 180) / Math.PI - 90;
    const upside = theta > 90 || theta < -90;
    if (upside) theta += 180;

    parts.push(`<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}"`
      + ` text-anchor="${upside ? 'end' : 'start'}" dominant-baseline="middle"`
      + ` font-size="${fs.toFixed(1)}" font-weight="600" fill="currentColor" fill-opacity="0.9"`
      + ` transform="rotate(${theta.toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)})"`
      + ` style="pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none"`
      + `>${esc(label)}</text>`);
  }

  parts.push('</g></svg>');
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
