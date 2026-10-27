// 界面：账户表的只读统计列
/**
 * 账户统计列（UI 层）
 *
 * 账户表里有一半的列是**只读**的统计值：
 *   当前结余 / 转出 / 转入 / 转出历史 / 转入历史
 * 它们的口径（当期=本月、历史=本月之前）和单元格名集中在这里，
 * 免得 account-table.js 一边管内联编辑一边管统计，膨胀到 300 行以上。
 */

import { setCell } from './table.js';
import { money } from '../core/format.js';
import { summariesForAccounts, currentMonthRange } from '../core/ledger-stats.js';

/** 只读统计列的字段名，顺序与模板一致 */
export const STAT_FIELDS = ['balance', 'out', 'iin', 'histOut', 'histIn'];

/**
 * 先把范围内所有账户的统计算成 Map，避免每行重算一遍。
 * @param {Array} accounts
 * @param {object} state
 * @returns {Map<string, object>}
 */
export function buildStatMap(accounts, state) {
  const range = currentMonthRange();
  const map = new Map();
  for (const item of summariesForAccounts(accounts, state.transactions || [], range)) {
    map.set(item.acc.id, item.s);
  }
  return map;
}

/**
 * 把统计值填进一行的只读格。
 * @param {HTMLTableRowElement} tr
 * @param {object} sum 来自 buildStatMap 的值
 */
export function fillStatCells(tr, sum) {
  const s = sum || {};
  setCell(tr, 'balance', money(s.balance));
  setCell(tr, 'out', money(s.periodOut));
  setCell(tr, 'iin', money(s.periodIn));
  setCell(tr, 'histOut', money(s.historyOut));
  setCell(tr, 'histIn', money(s.historyIn));
}
