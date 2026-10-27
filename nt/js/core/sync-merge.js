/**
 * 合并远端记录（纯函数）
 * 层：第一层 · 数据基座
 *
 * 两条来源都要能并进来：
 *   ① 账本文本（同步码解出来的）—— 走 appendLedgerFromText
 *   ② 解包出来的流水行（二维码 #m=）—— 先转成文本，再走同一个入口
 *
 * 之所以统一走「文本」这条路：账户判重、简码补全、未定义账户自动建，
 * 这些逻辑只在 import-parser + flow-text 里有一份，别再造第二套。
 */

import { appendLedgerFromText } from './flow-text.js';

/** '2026-08-01' 或 '260801' → '260801' */
export function toYmdShort(date) {
  const s = String(date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(2).replace(/-/g, '');
  if (/^\d{6}$/.test(s)) return s;
  return '';
}

/**
 * 流水行 → 账本文本的「流水段」。
 * @param {Array<{date:string,from:string,to:string,amount:number,note:string}>} rows
 */
export function rowsToFlowText(rows) {
  const lines = ['流水：', '日期，转出，转入，金额，备注，'];
  for (const r of rows || []) {
    const d = toYmdShort(r.date);
    if (!d) continue;
    const amount = Number(r.amount) || 0;
    if (!(amount > 0)) continue;
    const note = String(r.note || '').replace(/[，,\r\n]+/g, ' ').trim();
    lines.push([d, r.from || '', r.to || '', String(amount), note, ''].join('，'));
  }
  return lines.join('\n');
}

/**
 * 把一段账本文本追加进 state。
 * @returns {{state:object, added:number, created:string[], errors:Array}}
 */
export function mergeFlowText(state, text) {
  const r = appendLedgerFromText(state, text);
  return { state: r.state, added: r.txAdded, created: r.created, errors: r.errors };
}

/**
 * 把解包出来的流水行合并进 state。
 * @returns {{state:object, added:number, created:string[], errors:Array}}
 */
export function mergeRows(state, rows) {
  if (!rows || !rows.length) {
    return { state, added: 0, created: [], errors: [] };
  }
  return mergeFlowText(state, rowsToFlowText(rows));
}
