// 界面：路径 tab
﻿/**
 * 路径页视图（UI 层）
 *
 * 只做「把算好的数据摆到 DOM 上」，不含任何几何/金额计算。
 */

import { renderChart, RATIO } from './mw-svg-renderer.js';
import {
  categoryColor, pointAt, OPACITY, DEPTH_WIDTHS, W_MID, PICK_BOOST, PICK_SHRINK,
} from '../graph/mw-path-calculator.js';

const el = (id) => document.getElementById(id);

/** 画图 + 绑事件 */
export function paintChart(host, data, hits, onPick, mode) {
  const colorOf = (key) => categoryColor(data.colorIndex, key);

  // 线宽照单文件版：
  //   没追踪 → 全部统一 W_MID(2.4)
  //   追踪中 → 命中线用「离费用端几跳」的档位 × PICK_BOOST，其它线收细
  //
  // 注意：这里**没有**按笔数做密度补偿。曾经加过一版（250 笔时把线调细 0.6 倍），
  // 但在 v0.50 把「图尺寸只由高度决定」修好之后，250 笔在侧栏收起时已经不糊了 ——
  // 线宽恢复成单文件版的 2.4 才是一致的样子。
  /**
   * 追踪模式的四档线宽 —— **固定参数**（基准单位，×RATIO 后生效）。
   *
   * 定标依据：250 笔真实数据时 unitArcLen ≈ 27.74 画布，
   *   费用 6 / 资产 3.6 / 负债 2.4 / 收入·权益 1.2（用户定稿值）。
   *
   * 改成固定值的原因：按 unitArcLen 标定的话，笔数少的时候
   * 单位角变大会把线撑到比环还厚（2 笔时算出来是 183 显示像素），
   * 笔数多又细成发丝。固定之后任何数据量都是这四档。
   */
  const TRACE_WIDTH = { 费用: 6, 资产: 3.6, 负债: 2.4, 收入: 1.2, 权益: 1.2 };
  const traceWidth = (type) => {
    const s = String(type || '');
    for (const k of Object.keys(TRACE_WIDTH)) if (s.includes(k)) return TRACE_WIDTH[k];
    return TRACE_WIDTH.收入;
  };

  const chords = data.chords.map((c) => {
    const hit = hits ? hits.has(c.txIdx) : false;
    // 线宽按 RATIO 等比放大：画布从 1800 提到 6000，线还是 2.4px 就显得更细
    // 四种模式的线宽互不干扰：
    //   基本  → W_MID × 0.75（细一级），不画遮罩
    //   单线  → 命中 W_MID × 1.0（粗一级），其它同级但被遮罩盖住
    //   色块  → 沿用层级档位（不动）
    //   追踪  → 固定四档 6 / 3.6 / 2.4 / 1.2
    let strokeWidth = W_MID * RATIO * 0.75;
    if (mode === 'tx') {
      strokeWidth = W_MID * RATIO * (hit ? 1.0 : 0.75);
    } else if (mode === 'trace') {
      // 模式 4：追踪 —— 单位 1 = 0.9 个单位角对应的弧长，
      // 再按「转入方类型」乘倍率（费用 1 / 储蓄 0.5 / 负债 0.25 / 收入·权益 0.12）。
      // 这样线宽和「一笔流水在环上占多宽」是同一个量纲，笔数越多线越细。
      strokeWidth = (hit ? traceWidth(c.toType) : TRACE_WIDTH.收入) * RATIO;
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
