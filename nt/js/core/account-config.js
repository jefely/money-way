/**
 * 账户配置（纯函数）
 * 层：第一层 · 数据基座
 *
 * 只搬账户表：类型 / 分类 / 简码 / 名称 / 期初 / 账单日 / 还款日。
 * 导入是「按名称匹配后更新 + 缺的新增」，**不删除任何账户** ——
 * 删除会连带删流水，不能由一次文本导入悄悄做掉。
 */

import { ledgerToText, applyAccounts } from './flow-text.js';
import { parseLedgerText } from './import-parser.js';
import { addTransaction, idOf } from './state-store.js';
import { OPENING_ACCOUNT_ID } from './schema.js';

/** 账户段的表头 */
export const ACCOUNT_HEADER = '类型，分类，简码，名称，期初，账单日，还款日，';

/**
 * state → 账户段文本（只有账户，不含流水）。
 * @param {object} state
 * @param {{withHeader?:boolean}} [opts]
 */
export function accountsToText(state, opts) {
  const o = opts || {};
  const full = ledgerToText(state);
  const lines = full.split('\n');

  // 取「账户：」到「流水：」之间
  const start = lines.findIndex((l) => l.trim() === '账户：');
  const end = lines.findIndex((l) => l.trim() === '流水：');
  const body = (start >= 0 && end > start)
    ? lines.slice(start, end).filter((l) => l.trim() !== '')
    : ['账户：', ACCOUNT_HEADER];

  if (o.withHeader === false) return body.join('\n');

  return [
    '# NT账本 · 账户配置',
    '# 只有账户，不含流水。粘回「配置」里即可套用。',
    '# 导入按名称匹配：已有的更新，缺的新增，不会删除账户。',
    '',
    ...body,
  ].join('\n');
}

/**
 * 把账户段文本套进 state。
 *
 * @param {object} state
 * @param {string} text
 * @returns {{state:object, added:number, updated:number,
 *            openingSet:number, errors:Array}}
 */
export function applyAccountsText(state, text) {
  const parsed = parseLedgerText(text);
  const rows = parsed.accounts || [];

  // ① 基础字段（名称判重、简码去重由 applyAccounts 负责）
  const r = applyAccounts(state, rows);
  let s = r.state;
  let openingSet = 0;

  // ② 期初：换掉该账户原有的 opening 流水
  for (const row of rows) {
    if (!row.opening) continue;
    const accId = idOf(s, row.name);
    if (!accId) continue;

    s = { ...s, transactions: (s.transactions || []).filter((t) => !(t.opening && t.to_id === accId)) };
    s = addTransaction(s, {
      date: '2000-01-01',
      from_id: OPENING_ACCOUNT_ID,
      to_id: accId,
      amount: row.opening,
      note: '期初',
      opening: true,
      seq: 0,
    });
    openingSet += 1;
  }

  return {
    state: s,
    added: r.added,
    updated: r.updated,
    openingSet,
    errors: parsed.errors,
  };
}
