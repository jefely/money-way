// 界面：（无界面）state 增删改
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
  normalizeCode,
} from './schema.js';

/** 建一本空账（带期初虚拟账户，但它 isHidden，不进 UI 列表） */
export function createState() {
  return {
    version: SCHEMA_VERSION,
    accounts: [{ ...OPENING_ACCOUNT }],
    transactions: [],
    // 计划流水（固定收支 + 分期）只存规则，虚拟流水由 scheduler-engine 现算
    scheduled: [],
    // 界面参数（调试面板「保存」写这里，随账本加密存盘）
    settings: {},
    // 备注表（用户 2026-10-29）：{ id, code, type, text }，只用于统计分类与备注栏快速输入
    notes: [],
    // 多账本：活动账本的数据在 accounts/transactions/scheduled；其余账本快照在 ledgers
    ledgers: {},
    ledgerNames: { main: '主账本' },
    activeLedger: 'main',
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

/* ---------- 批量删除 + 撤销 ---------- */

/**
 * 按 id 批量删一个字段里的元素，并返回「删了什么、原来在第几个」。
 *
 * 撤销必须靠这个返回值：只记内容不记位置，恢复回来的顺序就变了，
 * 而流水 / 计划流水的顺序是用户直接看得到的（序列表、当月分期先后）。
 *
 * @param {object} state
 * @param {'transactions'|'scheduled'} field
 * @param {string[]} ids
 * @returns {{state:object, removed:Array<{index:number, row:object}>}}
 */
export function removeBatch(state, field, ids) {
  const list = state[field] || [];
  const keep = [];
  const removed = [];

  list.forEach((row, index) => {
    if (row && ids.includes(row.id)) removed.push({ index, row });
    else keep.push(row);
  });

  return { state: { ...state, [field]: keep }, removed };
}

/**
 * 把 removeBatch 返回的 removed 按原位置插回去。
 * @param {object} state
 * @param {'transactions'|'scheduled'} field
 * @param {Array<{index:number, row:object}>} removed
 */
export function restoreBatch(state, field, removed) {
  const list = (state[field] || []).slice();
  const ordered = (removed || []).slice().sort((a, b) => a.index - b.index);

  for (const item of ordered) {
    if (!item || !item.row) continue;
    const at = Math.min(Math.max(0, Number(item.index) || 0), list.length);
    list.splice(at, 0, item.row);
  }

  return { ...state, [field]: list };
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

/* ---------- 备注表（仅统计分类 / 备注栏快速输入） ---------- */

export const NOTE_TYPES = ['成员', '商家', '项目', '用途'];

let _noteSeq = 0;

function noteId() {
  _noteSeq += 1;
  return 'note_' + Date.now().toString(36) + '_' + _noteSeq;
}

/** 新增一条备注；code 只做归一化，合法性/唯一性由 UI 把关 */
export function addNote(state, input) {
  const o = input || {};
  const note = {
    id: noteId(),
    code: normalizeCode(o.code),
    // 类型可以不填（用户 2026-10-29）；填了就只认预设四种
    type: NOTE_TYPES.includes(o.type) ? o.type : '',
    keyword: String(o.keyword || '').trim(),
    text: String(o.text || '').trim(),
  };
  return { ...state, notes: [...(state.notes || []), note] };
}

export function updateNote(state, id, patch) {
  return {
    ...state,
    notes: (state.notes || []).map((n) => (n.id === id ? { ...n, ...patch } : n)),
  };
}

export function removeNote(state, id) {
  return { ...state, notes: (state.notes || []).filter((n) => n.id !== id) };
}

/**
 * 按简码找备注（备注栏输入简码 → 自动代入）。
 * 代入文本 = 类型，关键字，内容（空的跳过，中文逗号隔开）——用户 2026-10-29。
 */
export function noteTextByCode(state, raw) {
  const code = normalizeCode(raw);
  if (!code) return '';
  const hit = (state.notes || []).find((n) => n && normalizeCode(n.code) === code);
  if (!hit) return '';
  return [hit.type, hit.keyword, hit.text]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('，');
}
