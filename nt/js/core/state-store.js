/**
 * 内存态真源（State Store）
 * 层：第一层 · 数据基座
 *
 * 所有组件共享同一个 state；任何修改都通过这里的**纯函数**返回新 state。
 * 不碰 DOM / 存储 —— 存盘由 browser/db.js 负责。
 *
 * 字段一律按 core/schema.js 的定义：流水只存 from_id / to_id。
 */

import {
  SCHEMA_VERSION, createAccount, createTransaction,
  indexAccounts, findAccountByName, OPENING_ACCOUNT, OPENING_ACCOUNT_ID,
} from './schema.js';

/** 建一本空账（带期初虚拟账户，但它 isHidden，不进 UI 列表） */
export function createState() {
  return {
    version: SCHEMA_VERSION,
    accounts: [{ ...OPENING_ACCOUNT }],
    transactions: [],
    meta: { lastSync: '' },
  };
}

export function clone(v) {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

/** 下一个流水序号 */
export function nextSeq(state) {
  const max = (state.transactions || []).reduce((m, t) => Math.max(m, Number(t.seq) || 0), 0);
  return max + 1;
}

/* ---------- 查 ---------- */

/** ID → 账户 */
export function accountOf(state, id) {
  return indexAccounts(state.accounts).get(id) || null;
}

/** ID → 名字（显示用；找不到给空串，绝不返回 undefined 让 UI 显示成 "undefined"） */
export function nameOf(state, id) {
  const a = accountOf(state, id);
  return a ? a.name : '';
}

/** 名字 → ID（用户输入解析用） */
export function idOf(state, name) {
  const a = findAccountByName(state.accounts, name);
  return a ? a.id : null;
}

/* ---------- 账户：增删改 ---------- */

export function addAccount(state, patch) {
  const acc = createAccount(patch);
  return { ...state, accounts: [...state.accounts, acc] };
}

export function updateAccount(state, id, patch) {
  return {
    ...state,
    accounts: state.accounts.map((a) => (a.id === id ? createAccount({ ...a, ...patch }) : a)),
  };
}

/**
 * 删账户。**同时删掉引用它的流水**，否则会留下断链。
 * 期初虚拟账户不许删。
 */
export function removeAccount(state, id) {
  if (id === OPENING_ACCOUNT_ID) return state;
  return {
    ...state,
    accounts: state.accounts.filter((a) => a.id !== id),
    transactions: state.transactions.filter((t) => t.from_id !== id && t.to_id !== id),
  };
}

/* ---------- 流水：增删改 ---------- */

export function addTransaction(state, patch) {
  const tx = createTransaction({ seq: patch.seq || nextSeq(state), ...patch });
  return { ...state, transactions: [...state.transactions, tx] };
}

export function updateTransaction(state, id, patch) {
  return {
    ...state,
    transactions: state.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

export function removeTransaction(state, id) {
  return { ...state, transactions: state.transactions.filter((t) => t.id !== id) };
}

/* ---------- 期初迁移 ---------- */

/**
 * 把「账户上的期初余额」变成一条期初流水（对手方是 __OPENING__）。
 * 幂等：该账户已经有一条 opening 流水就不再生成。
 */
export function migrateOpeningToTransactions(state, openingDate = '2000-01-01') {
  const out = { ...state, accounts: state.accounts.map((a) => ({ ...a })) };
  const hasOpening = new Set(
    (out.transactions || []).filter((t) => t.opening).map((t) => t.to_id || t.from_id),
  );

  const added = [];
  for (const acc of out.accounts) {
    if (acc.id === OPENING_ACCOUNT_ID) continue;
    const amount = Number(acc.opening) || 0;
    if (!amount) continue;
    if (hasOpening.has(acc.id)) continue;
    added.push(createTransaction({
      date: openingDate,
      from_id: OPENING_ACCOUNT_ID,
      to_id: acc.id,
      amount,
      note: '期初',
      opening: true,
      seq: 0,
    }));
  }

  if (!added.length) return { state: out, added: 0 };
  out.transactions = [...added, ...out.transactions];
  return { state: out, added: added.length };
}

/** 可见账户（排除 isHidden 的期初账户） */
export function visibleAccounts(state) {
  return (state.accounts || []).filter((a) => !a.isHidden);
}
