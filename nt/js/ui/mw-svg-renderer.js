// 界面：路径 tab / path.html → SVG 渲染
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
 *
 * 尺寸：`params` 里的值都是**基准单位**（单文件版 1800 画布下的像素），
 * 这里统一 × RATIO 换成 6000 画布的单位。面板上写 44，画出来是 147。
 * 早先这些数是写死的常量，改一次要改代码 + 升版本 + 等部署；
 * 现在它们全部来自 core/mw-settings.js 的 SCHEMA，运行时的值由
 * ui/mw-params.js 从 --nt-mw-* 读出来 —— 面板改一项，图立刻重排。
 */

import { MW_DEFAULTS, MW_SIZE } from '../core/mw-settings.js';

/**
 * 单文件版的基准画布是 1800（`SIZE = 1800`、`R_OUT = 640`、`THICK = 44`），
 * 我们按用户要求把画布提到 6000（= 基准的 3.33 倍），所有像素量
 * （环半径、环厚、线宽、字号、描边、文字外移距离）等比放大 ——
 * 只放大画布而线宽字号不变，放大后的图会显得线更细、字更小。
 */
export const BASE_SIZE = 1800;
export const RATIO = MW_SIZE / BASE_SIZE;

/** 当前是否浅色主题（决定弧块边框的颜色） */
function isLightTheme() {
  if (typeof document === 'undefined') return true;
  const t = document.documentElement.dataset.theme;
  return !t || t === 'light';
}

/**
 * 参数 → 画布尺寸。
 * @param {object} [params] ui/mw-params 的读数（基准单位）
 * @returns {{size:number, rOut:number, rIn:number}}
 */
export function chartSize(params) {
  const p = params || {};
  // 坏值（NaN / undefined / 字符串）落回默认，而不是把整张图打成 0 半径
  const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);
  const size = MW_SIZE;
  const rOut = Math.round(num(p.rOut, MW_DEFAULTS.rOut) * RATIO);
  const thick = Math.round(num(p.thick, MW_DEFAULTS.thick) * RATIO);
  // 环厚 ≥ 环半径时 rIn 会变负 —— 内弧反向缠绕，图看着像散架。
  // 参数层（core/settings 的 min/max）已经钳过，这里再兜一次底，
  // 因为 params 也可能由调用方直接构造（测试、外部脚本）。
  const rIn = Math.max(1, rOut - thick);
  return { size, rOut, rIn };
}

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
 *   highlight?:Set<number>|null,
 *   params?:object,          // ui/mw-params 的读数；缺省用 MW_DEFAULTS
 *   maskOpacity?:number
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
  const p = d.params || MW_DEFAULTS;

  const { size, rOut, rIn } = chartSize(p);
  const U = RATIO;
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
      + ` fill="none" stroke="currentColor" stroke-width="${f(p.sectorW * U)}" stroke-opacity="${p.sectorOp}"/>`);
  }

  // ② 连线分两趟：先画「背景线」，再按需要压一层遮罩，最后画「命中线」。
  //    这样单线模式下非选中线被遮罩盖住、选中线浮在遮罩之上。
  const below = [];
  const above = [];
  for (const c of chords) (c.above ? above : below).push(c);

  const drawChord = (c) => {
    const op = typeof c.opacity === 'number'
      ? c.opacity
      : (d.opacityOf ? d.opacityOf(c) : 0.2);
    const dd = chordPath(c.path);
    // 可见的那条线（细）
    let out = `<path class="mw-chord" d="${dd}"`
      + ` fill="none" stroke="${c.strokeColor}"`
      + ` stroke-width="${c.strokeWidth}" stroke-opacity="${op}"`
      + ` stroke-linecap="round" data-tx="${c.txIdx}"/>`;
    // 一条透明的粗线盖在上面：线只有 1-2px，直接点很难点中。
    // pointer-events="stroke" 让它的整条描边都成为命中区。
    out += `<path class="mw-hitarea" d="${dd}" fill="none" stroke="transparent"`
      + ` stroke-width="${f(Math.max(c.strokeWidth, p.hitBand * U))}"`
      + ` stroke-linecap="round" pointer-events="stroke" data-tx="${c.txIdx}"/>`;
    return out;
  };

  for (const c of below) parts.push(drawChord(c));

  // 遮罩只在下述情况画：基本模式不画（用户要求「不要黑色遮罩」）
  const maskOp = typeof d.maskOpacity === 'number' ? d.maskOpacity : 0;
  if (maskOp > 0) {
    parts.push(`<circle class="mw-mask" cx="${cx}" cy="${cy}" r="${rIn}"`
      + ` fill-opacity="${maskOp}" pointer-events="none"/>`);
  }

  for (const c of above) parts.push(drawChord(c));

  // ④ 弧块
  // 分隔线：浅色主题纯白 / 深色主题纯黑，2.4×RATIO（约 0.45 显示像素）、75% 不透明。
  // 早先用 0.9×RATIO，同分类的两个**同色**弧块挨在一起时几乎看不见分界。
  for (const b of blocks) {
    parts.push(`<path class="mw-ring" d="${arcPath(rOut, rIn, b.a1, b.a2, pointAt, cx, cy)}"`
      + ` fill="${colorOf(b.colorKey)}" fill-opacity="1"`
      + ` stroke="${isLightTheme() ? '#ffffff' : '#000000'}"`
      + ` stroke-width="${f(p.ringW * U)}" stroke-opacity="${p.ringOp}"`
      + ` data-node="${esc(b.acc)}"/>`);
  }

  // ④ 弧块文字：沿半径向外排（照单文件版）
  //    放得下就贴外沿；放不下就往外挪一段并缩字号
  //
  // 「上一个弧块是否也需要锥形」—— 连续需要锥形时交替 46 / 115，把标签错开。
  // ⚠️ 这个声明必须留在循环**外面**：上一版只加了引用没加声明，
  //    渲染时抛 ReferenceError，整个 render 中断 —— 表现就是「侧边栏数据是空的」。
  let prevCrowded = false;

  for (const b of blocks) {
    const name = String(b.label || '');
    if (!name) continue;
    // 标签 = 账户名 + 金额（金额由调用方格式化成字符串传进来，
    // 渲染器不引 core/format，保持「只拼字符串」的职责）
    const label = b.amountText ? `${name} ${b.amountText}` : name;

    const span = b.a2 - b.a1;
    const midA = (b.a1 + b.a2) / 2;
    const arcLen = span * rOut;

    // 字号：下限抬到 12×RATIO —— 侧栏展开时图区只有 400 多 px，
    // 画布 6000 缩下来字号会小到看不清；太窄的块干脆不标字，避免糊成一片
    let fs = Math.max(p.fsMin * U, Math.min(p.fsMax * U,
      (arcLen / Math.max(1, label.length)) * 1.05,
      (rOut - rIn) * 0.58));

    // 文字大概多宽（中文 1em、西文 0.55em）
    let textW = 0;
    for (const ch of label) textW += (ch.charCodeAt(0) > 255 ? 1 : 0.55) * fs;

    // 不再「太窄就跳过」—— 单文件版每个弧块都有标签，
    // 窄块是靠锥形引线把它们错开，而不是干脆不显示。
    const crowded = arcLen < textW * p.crowdedK;
    // 走锥形的标签被推到环外、周围没有别的元件，字号可以给得更足
    if (crowded) fs = Math.max(p.fsCrowd * U, fs * 1.0);
    let rText = rOut + p.labelGap * U;
    if (crowded) {
      // 连续需要锥形时交替：第一个 46、第二个 115（2.5 倍）、第三个又回 46…
      // 这样一串极窄块的标签会分两层排开，不会全挤在同一圈上。
      const coneLen = prevCrowded ? p.coneB * U : p.coneA * U;
      prevCrowded = !prevCrowded;
      rText = rOut + coneLen;
    } else {
      prevCrowded = false;
    }

    // 放不下的弧块：画单文件版那种**尖锥形引线**，把弧块和外面的文字连起来
    //（照 mwDrawSvg：锥尖贴 rOut 的中点，锥底在文字所在半径上、以 mid 对称，
    //  半宽 5px 换算成角度 = 5 / rText）
    if (crowded) {
      const halfAngle = (p.coneHalfW * U) / Math.max(1, rText);
      const tip = pointAt(cx, cy, rOut, midA);
      const base1 = pointAt(cx, cy, rText, midA - halfAngle);
      const base2 = pointAt(cx, cy, rText, midA + halfAngle);
      parts.push(`<path d="M ${tip[0].toFixed(1)} ${tip[1].toFixed(1)}`
        + ` L ${base1[0].toFixed(1)} ${base1[1].toFixed(1)}`
        + ` L ${base2[0].toFixed(1)} ${base2[1].toFixed(1)} Z"`
        + ` fill="${colorOf(b.colorKey)}" fill-opacity="${p.coneOp}"`
        + ` stroke="none" pointer-events="none"/>`);
    }

    // 锥形底部在 rText；文字再往外让 10px，避免贴着锥底「压着」
    const rLabel = crowded ? rText + p.coneTextGap * U : rText;
    const pt = pointAt(cx, cy, rLabel, midA);
    let theta = (midA * 180) / Math.PI - 90;
    const upside = theta > 90 || theta < -90;
    if (upside) theta += 180;

    parts.push(`<text x="${pt[0].toFixed(1)}" y="${pt[1].toFixed(1)}"`
      + ` text-anchor="${upside ? 'end' : 'start'}" dominant-baseline="middle"`
      + ` font-size="${fs.toFixed(1)}" font-weight="600" fill="currentColor" fill-opacity="0.9"`
      + ` transform="rotate(${theta.toFixed(1)} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)})"`
      + ` style="pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none"`
      + `>${esc(label)}</text>`);
  }

  // ⑤ 圆心的拖动把手：直径 = 环直径的 25%，**完全透明**，只作为命中区。
  //    放在最上层，所以这一带的指针事件全被它吃掉 —— 不会误触到下面的线，
  //    按住拖动就是平移（手势的排除列表里没有它）。
  //    用 fill="transparent" 而不是 "none"：前者有填充（整面命中），
  //    后者没有填充，只有描边能命中，圆内部会漏到线上去。
  parts.push(`<circle class="mw-grab" cx="${cx}" cy="${cy}"`
    + ` r="${Math.round(rOut * p.grabRatio)}"`
    + ` fill="transparent" pointer-events="all"/>`);

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
