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

/**
 * 写一个「单值」参数（不是按表拆的列宽数组）。
 *
 * 七张统计小表共用的分类列宽走这里：一个参数、一条 CSS 变量
 * （`分类统计/列宽` → `--nt-col-stat-cat`），七张表都读它。
 * 用户 2026-11 明确要求「不是调整一个其它表同步数值，而是本来就同一个」。
 *
 * @param {object} ctx
 * @param {string} key 参数键
 * @param {number|string} value
 */
export function saveUserValue(ctx, key, value) {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const user = { ...loadUserSettings(ctx, theme), [key]: String(value) };
  saveThemeSettings(ctx, theme, user, 'user');
  if (typeof ctx.saveNow === 'function') ctx.saveNow();
  return true;
}

/**
 * 整张表的列宽一起写进「用户设置」。
 *
 * 拖动一张表时，所有列都已经被固化成了实际 px（见 table-layout 的
 * enterCustomMode），只存被拖那一列会让其余列在重开时回到默认，
 * 整表比例就变了。
 *
 * @param {object} ctx
 * @param {string} table 表 key
 * @param {number[]} widths 每列一个 px（0 / 非法 = 交给默认）
 * @returns {boolean} 是否写入
 */
export function saveTableWidths(ctx, table, widths) {
  const t = TABLE_COLS[table];
  if (!t || !Array.isArray(widths) || !widths.length) return false;

  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const key = colWidthKey(table);
  const list = t.cols.map((_, i) => {
    const w = Math.round(Number(widths[i]));
    return Number.isFinite(w) && w > 0 ? w : 0;
  });

  const user = { ...loadUserSettings(ctx, theme), [key]: list.join(',') };
  saveThemeSettings(ctx, theme, user, 'user');
  if (typeof ctx.saveNow === 'function') ctx.saveNow();
  return true;
}
