// 界面：统计页的第三块切换页（备注统计）
/**
 * 备注统计（统计页内嵌版）
 * 层：第五层 · UI
 *
 * 用户 2026-11-09：统计页的「分类 / 节点」之后加第三块「备注」，
 * 内容就是原来节点设置页「备注统计」弹窗里的那张表（只累加不平账）。
 */

import { renderNoteStats } from './note-stats.js';

export function mountStatsNotes(ctx, pane) {
  return function renderNotes() {
    pane.hidden = false;
    renderNoteStats(ctx, pane);
    ctx.setFooter('备注统计 · 只累加不平账');
  };
}
