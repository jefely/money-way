// 界面：路径 tab
﻿/**
 * 路径页视图（UI 层）
 *
 * 只做「把算好的数据摆到 DOM 上」，不含任何几何/金额计算。
 */

import { renderChart, RATIO } from './mw-svg-renderer.js';
import {
  categoryColor, pointAt, OPACITY, DEPTH_WIDTHS, W_MID, PICK_BOOST, PICK_SHRINK,
  traceWidthOf, TRACE_FLOOR,
} from '../graph/mw-path-calculator.js';

const el = (id) => document.getElementById(id);

/**
 * 画图 + 绑事件。
 *
 * @param {HTMLElement} host #pw-chart
 * @param {object} data build() 的结果
 * @param {Set<number>|null} hits 命中连线（data.txs 下标）
 * @param {(kind:string, value:any)=>void} onPick
 * @param {{mode?:string|null, dir?:'up'|'down'}} view
 *   mode：null 基本 / 'acc' 色块 / 'tx' 单线 / 'trace' 追踪
 *   dir ：逆流（up）看转入方、顺流（down）看转出方 —— **只影响颜色与第 4 模式线宽**
 */
export function paintChart(host, data, hits, onPick, view) {
  const colorOf = (key) => categoryColor(data.colorIndex, key);
  const mode = (view && view.mode) || null;
  const dir = view && view.dir === 'down' ? 'down' : 'up';

  // 线宽照单文件版：
  //   没追踪 → 全部统一 W_MID(2.4)
  //   追踪中 → 命中线用「离费用端几跳」的档位 × PICK_BOOST，其它线收细
  //
  // 注意：这里**没有**按笔数做密度补偿。曾经加过一版（250 笔时把线调细 0.6 倍），
  // 但在 v0.50 把「图尺寸只由高度决定」修好之后，250 笔在侧栏收起时已经不糊了 ——
  // 线宽恢复成单文件版的 2.4 才是一致的样子。

  const chords = data.chords.map((c) => {
    const hit = hits ? hits.has(c.txIdx) : false;
    // 点弧块：颜色取**远端** —— 逆流看流入（远端=转出方），顺流看流出（远端=转入方）。
    // 弧块自己的颜色当锚点没有信息量（整组线同色，看不出是谁给的钱 / 钱去了哪类）。
    const strokeColor = (mode === 'acc' && hit)
      ? categoryColor(data.colorIndex, dir === 'down' ? c.colorKeyTo : c.colorKeyFrom)
      : c.strokeColor;
    // 线宽按 RATIO 等比放大：画布从 1800 提到 6000，线还是 2.4px 就显得更细
    // 四种模式的线宽互不干扰：
    //   基本  → W_MID × 0.75（细一级），不画遮罩
    //   单线  → 命中 W_MID × 1.0（粗一级），其它同级但被遮罩盖住
    //   色块  → 沿用层级档位（不动）
    //   追踪  → 按方向取那一端的四个类型档（见 mw-path-calculator 的 STYLE_UP / STYLE_DOWN）
    let strokeWidth = W_MID * RATIO * 0.75;
    if (mode === 'tx') {
      strokeWidth = W_MID * RATIO * (hit ? 1.0 : 0.75);
    } else if (mode === 'trace') {
      // 第 4 模式：逆流看**转入方**的类型（费用最粗 → 收入最细），
      // 顺流看**转出方**的类型（收入·权益最粗 → 费用最细）。
      // 非命中线压到最细一档，链才浮出来。
      const endType = dir === 'down' ? c.fromType : c.toType;
      strokeWidth = (hit ? traceWidthOf(endType, dir) : TRACE_FLOOR) * RATIO;
    } else if (hits) {
      if (hit) {
        const dep = Number.isFinite(c.depth) ? c.depth : DEPTH_WIDTHS.length - 1;
        // 再 ×0.35：用户反馈选中线还是偏粗，继续收细
        strokeWidth = DEPTH_WIDTHS[Math.min(dep, DEPTH_WIDTHS.length - 1)]
          * PICK_BOOST * RATIO * 0.35;
      } else {
        strokeWidth = W_MID * PICK_SHRINK * RATIO;
      }
    }
    return {
      ...c,
      strokeColor,
      // 命中线要在遮罩**之上**（单线模式用它浮出来）
      above: mode === 'tx' && hit,
      strokeWidth,
      opacity: !hits ? OPACITY.GLOBAL : (hit ? OPACITY.HIT : OPACITY.DIM),
    };
  });

  host.innerHTML = renderChart({
    blocks: data.blocks,
    chords,
    sectors: data.sectors,
    pointAt,
    colorOf,
    // 遮罩只在单线模式出现：基本模式 0（不要黑遮罩），色块/追踪维持原来的 0.48
    maskOpacity: mode === 'tx' ? 0.55 : 0,
  });

  host.classList.toggle('has-focus', !!hits);

  host.querySelectorAll('.mw-ring').forEach((node) => {
    node.addEventListener('click', () => {
      const acc = node.getAttribute('data-node');
      if (acc) onPick('acc', acc);
    });
  });

  // 线也能点：命中带和可见线都绑同一个回调
  host.querySelectorAll('.mw-hitarea, .mw-chord').forEach((node) => {
    node.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const idx = Number(node.getAttribute('data-tx'));
      if (Number.isFinite(idx)) onPick('tx', idx);
    });
  });
}

/** 安全写文本：元素不存在就跳过（渲染不该因为一个可选元素中断） */
function setText(id, text) {
  const node = el(id);
  if (node) node.textContent = text;
}

/** 空状态（把内部数字也显示出来，便于定位是哪一步变空的） */
export function paintEmpty(info) {
  const i = info || {};
  const detail = [
    `账本流水 ${i.totalTx != null ? i.totalTx : '?'} 笔`,
    `区间 ${i.range ? (i.range.start || '空') + ' ~ ' + (i.range.end || '空') : '?'}`,
    `切片后 ${i.picked != null ? i.picked : '?'} 笔`,
  ].join(' · ');
  el('pw-chart').innerHTML =
    '<div class="pw-empty">这段时间没有可画的流水<br>先在「流水」页记几笔'
    + '<br><small>' + detail + '</small></div>';
  // 左栏现在是流水查询表（#pw-flow-body），原来的 #pw-list 已删；
  // 标题「路径追踪」已由左上角常驻工具条取代，也没有 #pw-stats 这个元素了。
  setText('pw-flow-body', '');
}
