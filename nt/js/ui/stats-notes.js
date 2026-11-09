// 界面：统计页的第三块切换页（备注统计）
/**
 * 备注统计（统计页内嵌版）
 * 层：第五层 · UI
 *
 * 用户 2026-11-09：统计页的「分类 / 节点」之后加第三块「备注」，
 * 内容 = 两个小表（备注分类 / 备注），日期筛选沿用统计页的 range。
 */

import { renderNoteStats } from './note-stats.js';

export function mountStatsNotes(ctx, pane, getRange) {
  return function renderNotes() {
    pane.hidden = false;
    renderNoteStats(ctx, pane, getRange ? getRange() : null);
    ctx.setFooter('备注统计 · 两个小表（备注分类 / 备注）· 只累加不平账');
  };
}
