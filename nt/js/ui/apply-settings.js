// 界面：全局：把界面参数写成 CSS 变量（主题/列宽）
/**
 * 把界面参数写到对应作用域的 CSS 变量上（UI 层）
 *
 * **只写变量，不碰列宽、不碰表宽、不碰冻结偏移**。
 * 列宽/表宽/冻结全部由 CSS 负责：
 *   · 列宽   → shell.css 的 `[data-col]` 读 `--nt-col-*`
 *   · 表宽   → `.nt-table { width: max-content }`（= 各列之和）
 *   · 冻结   → `position: sticky`（设置页账户表 left:0，JS 不写）
 * 之前这里也写 <col> 宽度和 table.style.width，和 col-resize.js 打架，
 * 导致「拖一列动一排」「列宽乱跳」。现在职责切开：
 *
 *   applySettings  →  写 --nt-* 变量
 *   table-layout    →  只管拖动（th.style.width）与多列冻结的 left 累加
 */

import { toCssList, GROUP_SCOPE, normalize } from '../core/settings.js';
import { TABLE_COLS, TABLE_DEFAULT_WIDTHS, parseTableWidths, colWidthKey } from '../core/table-cols.js';
import { syncAllFrozen, tableIdOf } from './table-layout.js';

/**
 * 统计三块表（存量 / 流量 / 分类查询）的「自定义列宽」开关。
 *
 * 它们的默认外观是「CSS 百分比铺满容器」（宽度参数全 0）；
 * 用户拖过之后参数里全是 px，必须同时切到 .cols-custom（表宽 = 列宽之和），
 * 否则 `width:100%` 会把 px 列按比例放大 —— 看着就是「调整结果没了」。
 *
 * 放在这里的原因：列宽模式是参数的函数，而本文件是**唯一**写列宽变量的地方。
 * 参数面板手工输入列宽、点「恢复默认」、撤销，都要立刻反映到模式上。
 */
function syncColModes(settings, theme) {
  const s = normalize(settings, theme);
  for (const table of document.querySelectorAll('table.nt-table')) {
    const id = tableIdOf(table);
    const t = TABLE_COLS[id];
    if (!t || !(t.growByWidth || t.fill)) continue;
    const widths = parseTableWidths(s[colWidthKey(id)], id);
    // 两种判定，都是「参数说了算」：
    //   growByWidth（统计三块）：0 = 还没自定义（CSS 百分比铺满），有非 0 = 拖过
    //   fill（流水表）：参数与默认值不同 = 拖过（默认时仍走 CSS 的 width:100%）
    const custom = t.growByWidth
      ? widths.some((w) => w > 0)
      : widths.join(',') !== String(TABLE_DEFAULT_WIDTHS[id] || '');
    table.classList.toggle('cols-custom', custom);
  }
}

/**
 * @param {object} settings 完整设置（normalize 过的）
 */
export function applySettings(settings, theme) {
  const root = document.documentElement;
  if (!root) return;

  for (const item of toCssList(settings, theme)) {
    const scope = GROUP_SCOPE[item.group] || 'global';
    const target = scope === 'global' ? root : document.querySelector('[data-view="' + scope + '"]');
    if (!target) continue;

    if (item.attr) target.setAttribute(item.attr, item.value);
    // 空值 = 「这项不该有变量」（统计三块表默认铺满容器，宽度参数是 0）。
    // 必须 removeProperty，不能跳过：跳过会让上一次拖出来的 px 残留在 :root 上，
    // 面板点「恢复默认」后表还是旧的宽 —— 看着像按钮没反应。
    else if (item.cssVar && item.value === '') target.style.removeProperty(item.cssVar);
    else if (item.cssVar) target.style.setProperty(item.cssVar, item.value);
  }

  // 列宽变量变了，冻结列的 left 要跟着重算
  syncAllFrozen();
  // 参数里的列宽决定「铺满」还是「按 px 排」—— 统计三块表靠这个类切换
  syncColModes(settings, theme);

  // 参数变了 → 通知消费方重画。环图（路径页）靠这个做到「面板一改，图立刻变」：
  // 它的半径、字号、线宽都不是 CSS 能表达的，只能在 JS 里重排一次 SVG。
  // 没有订阅者时 dispatch 是空操作（启动时 applySettings 早于 mountViews）。
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('nt-layout'));
  }
}
