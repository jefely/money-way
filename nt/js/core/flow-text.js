/**
 * 流水 ↔ 文本（纯函数）
 * 层：第一层 · 数据基座
 *
 * 「整页 txt 编辑器」的数学部分：
 *   流水 → 文本（供编辑器显示，用户直接改）
 *   文本 → 流水（保存时整体替换或追加）
 *
 * 不碰 DOM，所以能完整测试「导出再导入，账不变」。
 */

import { shortDate } from './format.js';
import { parseImportText } from './import-parser.js';
import { addTransaction, createState, idOf, nextSeq } from './state-store.js';
import { indexAccounts } from './schema.js';

/**
 * 把流水导成编辑器里的文本。
 * 列：日期 | 转出 | 转入 | 金额 | 备注，Tab 分隔。
 * @param {object} state
 * @returns {string}
 */
export function transactionsToText(state) {
  const s = state || {};
  const accById = indexAccounts(s.accounts || []);
  const nameOf = (id) => {
    const a = accById.get(id);
    return a ? a.name : '';
  };

  const rows = (s.transactions || []).slice()
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));

  return rows.map((t) => [
    shortDate(t.date).replace(/-/g, ''),      // 260820
    nameOf(t.from_id),
    nameOf(t.to_id),
    Number(t.amount) ? String(Number(t.amount)) : '',
    t.note || '',
  ].join('\t')).join('\n');
}

/**
 * 把编辑器的文本整体替换成新流水。
 *
 * 账户按名字复用；编辑器里出现的新名字会**自动建账户**（默认资产类 / 未分类）。
 *
 * @param {object} state
 * @param {string} text
 * @returns {{state:object, added:number, removed:number, created:string[], errors:Array}}
 */
export function replaceTransactionsFromText(state, text) {
  const parsed = parseImportText(text);

  // ① 账户：先补新的
  let s = { ...state, accounts: (state.accounts || []).slice() };
  const created = [];
  for (const a of parsed.accounts) {
    if (idOf(s, a.display)) continue;
    const code = uniqueCode(s.accounts, a.display);
    s = {
      ...s,
      accounts: s.accounts.concat([{
        id: 'acc_' + Math.random().toString(36).slice(2, 9),
        code,
        name: a.display,
        type: '资产类',
        category: '未分类',
        isHidden: false,
      }]),
    };
    created.push(a.display);
  }

  // ② 清空旧流水，按文本重建（保持行序）
  const removed = (s.transactions || []).length;
  s = { ...s, transactions: [] };
  let seq = 0;
  let added = 0;
  for (const r of parsed.rows) {
    seq += 1;
    const fromId = idOf(s, r.from);
    const toId = idOf(s, r.to);
    if (!fromId && !toId) continue;
    s = addTransaction(s, {
      date: r.date,
      from_id: fromId,
      to_id: toId,
      amount: r.amount,
      note: r.note || '',
      seq,
    });
    added += 1;
  }

  return { state: s, added, removed, created, errors: parsed.errors };
}

/**
 * 把文本**追加**到现有流水末尾（不删旧的）。
 * @param {object} state
 * @param {string} text
 */
export function appendTransactionsFromText(state, text) {
  const parsed = parseImportText(text);

  let s = { ...state, accounts: (state.accounts || []).slice() };
  const created = [];
  for (const a of parsed.accounts) {
    if (idOf(s, a.display)) continue;
    const code = uniqueCode(s.accounts, a.display);
    s = {
      ...s,
      accounts: s.accounts.concat([{
        id: 'acc_' + Math.random().toString(36).slice(2, 9),
        code,
        name: a.display,
        type: '资产类',
        category: '未分类',
        isHidden: false,
      }]),
    };
    created.push(a.display);
  }

  let added = 0;
  for (const r of parsed.rows) {
    const fromId = idOf(s, r.from);
    const toId = idOf(s, r.to);
    if (!fromId && !toId) continue;
    s = addTransaction(s, {
      date: r.date,
      from_id: fromId,
      to_id: toId,
      amount: r.amount,
      note: r.note || '',
      seq: nextSeq(s),
    });
    added += 1;
  }

  return { state: s, added, removed: 0, created, errors: parsed.errors };
}

/** 简码去重 */
function uniqueCode(accounts, name) {
  const used = new Set((accounts || []).map((a) => String(a.code || '').toUpperCase()));
  const base = String(name || 'ACC').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'ACC';
  if (base.length >= 2 && !used.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const c = (base + i).slice(0, 5);
    if (!used.has(c)) return c;
  }
  return 'ACC' + String(Date.now()).slice(-2);
}

/** 空账本的种子（编辑器首次打开时用） */
export function emptyStateForEditor() {
  return createState();
}
