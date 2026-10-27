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
import { money, shortDate } from '../core/format.js';

const el = (id) => document.getElementById(id);

/** 画图 + 绑事件 */
export function paintChart(host, data, hits, onPick) {
  const colorOf = (key) => categoryColor(data.colorIndex, key);

  // 线宽照单文件版：
  //   没追踪 → 全部统一 W_MID(2.4)
  //   追踪中 → 命中线用「离费用端几跳」的档位 × PICK_BOOST，其它线收细
  //
  // 注意：这里**没有**按笔数做密度补偿。曾经加过一版（250 笔时把线调细 0.6 倍），
  // 但在 v0.50 把「图尺寸只由高度决定」修好之后，250 笔在侧栏收起时已经不糊了 ——
  // 线宽恢复成单文件版的 2.4 才是一致的样子。
  const chords = data.chords.map((c) => {
    const hit = hits ? hits.has(c.txIdx) : false;
    // 线宽按 RATIO 等比放大：画布从 1800 提到 6000，线还是 2.4px 就显得更细
    let strokeWidth = W_MID * RATIO;
    if (hits) {
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
  });

  host.classList.toggle('has-focus', !!hits);

  host.querySelectorAll('.mw-ring').forEach((node) => {
    node.addEventListener('click', () => {
      const acc = node.getAttribute('data-node');
      if (acc) onPick(acc);
    });
  });
}

/** 追踪列表 */
export function paintList(host, data, hits, nameOf, onPickTx) {
  host.textContent = '';
  const tpl = document.getElementById('tpl-pw-row');
  if (!tpl) return;

  const rows = data.txs
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => !hits || hits.has(i))
    .sort((a, b) => (String(b.t.date) < String(a.t.date) ? -1 : 1));

  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'pw-empty-row';
    li.textContent = '没有命中的流水';
    host.appendChild(li);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const { t, i } of rows.slice(0, 400)) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.tx = String(i);
    node.querySelector('.pw-cell-date').textContent = shortDate(t.date);
    node.querySelector('.pw-cell-from').textContent = nameOf(t.from_id);
    node.querySelector('.pw-cell-to').textContent = nameOf(t.to_id);
    node.querySelector('.pw-cell-amount').textContent = money(t.amount);
    frag.appendChild(node);
  }
  host.appendChild(frag);

  host.onclick = (ev) => {
    const row = ev.target.closest('.pw-row[data-tx]');
    if (!row) return;
    const i = Number(row.dataset.tx);
    if (!Number.isNaN(i)) onPickTx(i);
  };
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
  // 图的参数已经合并进页脚，没有 #pw-stats 这个元素了。
  setText('pw-flow-body', '');
  setText('pw-side-title', '暂无数据');
}
