/**
 * 账本文本 ↔ state（纯函数）
 * 层：第一层 · 数据基座
 *
 * 「整页 txt 编辑器」的数学部分，格式与 core/import-parser.js 一致：
 *
 *   账户：
 *   类型，分类，简码，名称，期初，账单日，还款日，
 *   资产类，现金，XJ，现金，200，
 *
 *   流水：
 *   日期，转出，转入，金额，备注，
 *   260801，XJ，餐饮，3.5，午饭，
 *
 * 不碰 DOM，所以能测「导出再导入，账一分不差」。
 */

import { shortDate } from './format.js';
import { parseLedgerText } from './import-parser.js';
import { addTransaction, idOf, nextSeq } from './state-store.js';
import { createAccount, normalizeCode, indexAccounts, OPENING_ACCOUNT_ID } from './schema.js';

const SEP = '，';
const HEAD_ACC = '账户：';
const HEAD_TX = '流水：';
const COLS_ACC = ['类型', '分类', '简码', '名称', '期初', '账单日', '还款日'];
const COLS_TX = ['日期', '转出', '转入', '金额', '备注'];

/**
 * state → 编辑器文本（两段式）。
 * 期初从 opening 流水反查（v2 结构里账户本身不存期初）。
 */
export function ledgerToText(state) {
  const s = state || {};
  const accById = indexAccounts(s.accounts || []);
  const visible = (s.accounts || []).filter((a) => !a.isHidden);

  const openingOf = new Map();
  for (const t of s.transactions || []) {
    if (t.opening && t.to_id) openingOf.set(t.to_id, Number(t.amount) || 0);
  }

  const accLines = visible.map((a) => [
    a.type || '',
    a.category || '',
    a.code || '',
    a.name || '',
    openingOf.get(a.id) ? String(openingOf.get(a.id)) : '',
    a.billDay || '',
    a.repayDay || '',
    '',
  ].join(SEP));

  const nameOf = (id) => {
    const a = accById.get(id);
    return a ? a.name : '';
  };

  const rows = (s.transactions || [])
    .filter((t) => !t.opening)
    .slice()
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));

  const txLines = rows.map((t) => [
    shortDate(t.date).replace(/-/g, ''),
    nameOf(t.from_id),
    nameOf(t.to_id),
    Number(t.amount) ? String(Number(t.amount)) : '',
    t.note || '',
    '',
  ].join(SEP));

  return [
    HEAD_ACC,
    COLS_ACC.join(SEP) + SEP,
    ...accLines,
    '',
    HEAD_TX,
    COLS_TX.join(SEP) + SEP,
    ...txLines,
  ].join('\n');
}

/**
 * 解析一个「账户引用」：**名字 → 简码 → 自动建**。
 *
 * 用户写流水时经常混着来（`XJ` 是简码、`现金` 是名字），
 * 而且在账户段没定义过的账户也会直接写进流水里 ——
 * 这类必须自动建，否则那笔流水会凭空消失。
 *
 * @returns {{id:string, state:object, created:boolean}}
 */
export function resolveRef(state, ref) {
  const v = String(ref || '').trim();
  if (!v) return { id: null, state, created: false };

  // ① 名字精确
  const byName = idOf(state, v);
  if (byName) return { id: byName, state, created: false };

  // ② 简码（大小写不敏感）
  const code = normalizeCode(v);
  if (code) {
    const hit = (state.accounts || []).find((a) => normalizeCode(a.code) === code);
    if (hit) return { id: hit.id, state, created: false };
  }

  // ③ 都没有 → 建一个
  const acc = createAccount({
    name: v,
    type: '资产类',
    category: '未分类',
    code: uniqueCode(state.accounts, v),
  });
  return {
    id: acc.id,
    state: { ...state, accounts: (state.accounts || []).concat([acc]) },
    created: true,
  };
}

/**
 * 用编辑器文本**整体替换**账本。
 *
 * 账户段按名称判重：已存在就更新类型/分类/简码，不存在就新建（期初变成 opening 流水）。
 * 流水段：名字或简码都行；解析不到的账户自动建（默认资产类）。
 */
export function replaceLedgerFromText(state, text) {
  const parsed = parseLedgerText(text);
  const work = applyAccounts(state, parsed.accounts);

  const removed = (work.state.transactions || []).length;
  let s = { ...work.state, transactions: [] };

  // 期初：账户段的 opening → opening 流水
  for (const row of parsed.accounts) {
    if (!row.opening) continue;
    const accId = idOf(s, row.name);
    if (!accId) continue;
    s = addTransaction(s, {
      date: '2000-01-01',
      from_id: OPENING_ACCOUNT_ID,
      to_id: accId,
      amount: row.opening,
      note: '期初',
      opening: true,
      seq: 0,
    });
  }

  let seq = (s.transactions || []).length;
  let txAdded = 0;
  const autoCreated = [];

  for (const r of parsed.transactions) {
    const f = resolveRef(s, r.from);
    s = f.state;
    const t = resolveRef(s, r.to);
    s = t.state;
    if (f.created) autoCreated.push(r.from);
    if (t.created) autoCreated.push(r.to);
    if (!f.id && !t.id) continue;

    seq += 1;
    s = addTransaction(s, {
      date: r.date, from_id: f.id, to_id: t.id,
      amount: r.amount, note: r.note || '', seq,
    });
    txAdded += 1;
  }

  return {
    state: s,
    accountsAdded: work.added,
    accountsUpdated: work.updated,
    txAdded,
    txRemoved: removed,
    created: work.created.concat(autoCreated),
    errors: parsed.errors,
  };
}

/** 只追加流水段（账户照样先补齐） */
export function appendLedgerFromText(state, text) {
  const parsed = parseLedgerText(text);
  const work = applyAccounts(state, parsed.accounts);
  let s = work.state;

  let added = 0;
  const autoCreated = [];
  for (const r of parsed.transactions) {
    const f = resolveRef(s, r.from);
    s = f.state;
    const t = resolveRef(s, r.to);
    s = t.state;
    if (f.created) autoCreated.push(r.from);
    if (t.created) autoCreated.push(r.to);
    if (!f.id && !t.id) continue;

    s = addTransaction(s, {
      date: r.date, from_id: f.id, to_id: t.id,
      amount: r.amount, note: r.note || '', seq: nextSeq(s),
    });
    added += 1;
  }

  return {
    state: s,
    accountsAdded: work.added,
    accountsUpdated: work.updated,
    txAdded: added,
    txRemoved: 0,
    created: work.created.concat(autoCreated),
    errors: parsed.errors,
  };
}

/**
 * 把账户段落到 state 上（按名称判重）。
 * 已存在的账户只更新非空字段；不存在的新建。
 */
export function applyAccounts(state, accountRows) {
  let accounts = (state.accounts || []).slice();
  let added = 0;
  let updated = 0;
  const created = [];

  const byName = new Map();
  for (const a of accounts) byName.set(a.name, a);

  for (const row of accountRows || []) {
    const exist = byName.get(row.name);

    if (exist) {
      const patch = {};
      if (row.type) patch.type = row.type;
      if (row.category && row.category !== '未分类') patch.category = row.category;
      if (row.code) patch.code = row.code;
      if (row.billDay) patch.billDay = row.billDay;
      if (row.repayDay) patch.repayDay = row.repayDay;

      if (Object.keys(patch).length) {
        accounts = accounts.map((a) => (a.id === exist.id ? { ...a, ...patch } : a));
        updated += 1;
      }
      continue;
    }

    const acc = createAccount({
      name: row.name,
      type: row.type,
      category: row.category,
      code: row.code || uniqueCode(accounts, row.name),
      billDay: row.billDay,
      repayDay: row.repayDay,
    });
    accounts = accounts.concat([acc]);
    byName.set(acc.name, acc);
    added += 1;
    created.push(row.name);
  }

  return { state: { ...state, accounts }, added, updated, created };
}

/** 简码去重 */
export function uniqueCode(accounts, name) {
  const used = new Set((accounts || []).map((a) => normalizeCode(a.code)));
  const base = normalizeCode(String(name || '').replace(/[^A-Za-z0-9]/g, '')).slice(0, 3) || 'ACC';
  if (base.length >= 2 && !used.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const c = (base + i).slice(0, 5);
    if (!used.has(c)) return c;
  }
  return 'ACC' + String(Date.now()).slice(-2);
}

/** 兼容旧名字 */
export const transactionsToText = ledgerToText;
