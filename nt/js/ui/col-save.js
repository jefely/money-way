// 界面：把某张表某列的宽度存进「用户设置」
/**
 * 列宽保存
 * 层：第五层 · UI（薄胶水，只写不画）
 *
 * 三张表（table 的 th 拖动）和路径页（div grid 拖动）共用这一处，
 * 免得「拖动保存」在两处各写一遍、然后其中一处忘了按表拆。
 */

import { TABLE_COLS, parseTableWidths, colWidthKey } from '../core/table-cols.js';
import { loadMergedSettings, loadUserSettings, saveThemeSettings } from './debug-themes.js';

/**
 * @param {{getState:Function, setState:Function, saveNow?:Function}} ctx
 * @param {string} table TABLE_COLS 的 key（flow/cat/sum/query/path/plan/accounts）
 * @param {string} col   该表的列 key
 * @param {number} width 宽度（px）
 * @returns {boolean} 是否写入
 */
export function saveTableColWidth(ctx, table, col, width) {
  const t = TABLE_COLS[table];
  if (!t || !col) return false;

  const i = t.cols.indexOf(col);
  if (i < 0) return false;

  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const key = colWidthKey(table);

  const cur = loadMergedSettings(ctx, theme);
  const widths = parseTableWidths(cur[key], table);
  widths[i] = Math.max(0, Math.round(width));

  const user = { ...loadUserSettings(ctx, theme), [key]: widths.join(',') };
  saveThemeSettings(ctx, theme, user, 'user');
  if (typeof ctx.saveNow === 'function') ctx.saveNow();
  return true;
}
