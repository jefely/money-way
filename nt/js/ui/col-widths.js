// 界面：列宽持久化（拖动 → 参数 → CSS 变量）
/**
 * 列宽保存
 * 层：第五层 · UI（薄胶水，只搬运不计算）
 *
 * 一条链路：
 *   拖动（ui/table-layout）→ 整表存进参数（ui/col-save）
 *   → applySettings 立刻把新宽度写回 --nt-col-*，
 *     并按参数切换统计三块表的 .cols-custom（见 ui/apply-settings。
 *
 * 为什么不再用 localStorage 镜像：
 *   镜像会在「参数已经改了、但表头还没重建」的窗口里压过参数，
 *   面板点「恢复默认」之后一重建表头，旧的 px 又被套回来。
 *   现在宽度只有一处真相 —— 参数；CSS 变量是它的直接投影，
 *   表头重建不影响变量，所以不需要任何缓存。
 */

import { loadMergedSettings } from './debug-themes.js';
import { saveTableWidths, saveUserValue } from './col-save.js';
import { tableIdOf } from './table-layout.js';
import { applySettings } from './apply-settings.js';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

/**
 * 清掉一张表上的内联宽度，让它重新跟随 CSS 变量（= 参数）。
 *
 * 拖动时 enterCustomMode 会把宽度固化到 th/col 的内联样式上。统计页同一组是
 * **多张小表**：如果只清被拖那张，其它表会保留上一次拖出来的内联宽度，
 * 之后拖任何一张都只动自己 —— 用户看到的就是「上下两张表列宽不同步」。
 */
export function clearInlineWidths(table) {  for (const c of table.querySelectorAll('col')) {
    // 恢复「参数表达式」而不是清空：统计页小表的 col 宽度只有内联的 var()，
    // 清空后没有 CSS 兜底，整表会塌成内容宽度（用户报「拖一张，另一张列宽乱了」）。
    c.style.width = c.dataset.w || '';
  }
  for (const th of table.querySelectorAll('thead .nt-th')) {
    th.style.width = '';
    th.style.minWidth = '';
    th.style.maxWidth = '';
  }
}

/**
 * 拖动手柄改列宽后，把**这一整张表**的列宽写进当前主题的「用户设置」。
 *
 * 为什么存整表而不是只存被拖的那一列：
 *   进入自定义模式时，所有列都被固化成了当时量到的 px（否则拖一列会带动一排）。
 *   只存一列的话，重开时其余列会回到默认 —— 整表的比例就变了。
 *   统计三块表默认宽度全是 0，更需要整表存才能判断「这张表自定义过」。
 *
 * 每张表一套列宽，拖哪张存哪张；列数与顺序由 TABLE_COLS[id].cols 决定。
 *
 * @param {object} ctx getState / setState / saveNow
 * @param {HTMLElement} tableEl 被拖的那张表
 * @param {string} [col] 被拖的列名（data-col）—— 目前只用于日志，宽度统一按整表存
 * @param {number} [width] 拖完后的列宽（px）
 */
/**
 * 保存一个「共享列宽」（单值参数 + 立刻把 CSS 变量刷新一遍）。
 *
 * 统计小表的第 1 列宽度走这里：分类表写 `分类统计/列宽`、节点表写 `节点统计/列宽`，
 * 同类六张表读同一条变量，所以拖一张 = 全部一起变。
 */
export function saveSharedWidth(ctx, key, width) {
  const theme = currentTheme();
  saveUserValue(ctx, key, Math.round(Number(width)) || 0);
  applySettings(loadMergedSettings(ctx, theme), theme);
}

export function onColResize(ctx, tableEl, col, width) {
  const id = tableIdOf(tableEl);
  if (!id) return;

  const theme = currentTheme();

  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  const widths = ths.map((th) => Math.round(th.getBoundingClientRect().width));

  saveTableWidths(ctx, id, widths);
  // 存完立刻把新宽度写回 CSS 变量：切 tab 时表头会重建、内联宽度随之丢失，
  // 只靠「下次启动」才生效的话，中途看着就是白调了。
  applySettings(loadMergedSettings(ctx, theme), theme);
  // 同组的小表（统计页一个合计一张表）全部回到变量驱动，这样它们始终一样宽
  for (const t of document.querySelectorAll('table.nt-table')) {
    if (t !== tableEl && tableIdOf(t) === id) clearInlineWidths(t);
  }
}
