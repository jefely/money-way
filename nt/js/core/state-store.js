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
  normalizeCode, ALL_ACCOUNT_TYPES,
} from './schema.js';
import { syncPostStatus, dropMappingsFor } from './draft-book.js';
import { openingEnds, openingAccountId } from './opening-tx.js';
import { matchAccountName } from './account-match.js';
import { noteTarget } from './lexicon.js';

/** 建一本空账（带期初虚拟账户，但它 isHidden，不进 UI 列表） */export function createState() {
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
    // 短语 → accountId。随账本加密，也进加密备份（渐进式记账学过的对应关系）
    mappings: {},
    // 作废的计划发生：sourceId|月份，不删模板
    voidedPlans: [],
    // 用户主动从设置表删掉的账户 ID：断链补壳时要跳过它们，
    // 否则删完下一帧又被 withUndefinedAccounts 补回来（2026-11 用户报「删除节点撤销不了」）
    deletedAccounts: [],
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
  // fresh = 导入时自动建的临时节点（用户还没确认过）。**只在新建时打**，
  // 改过之后由 updateAccount 重建自然消失 —— 那正是「用户确认了」的意思。
  if (patch && patch.fresh === true) acc.fresh = true;
  return { ...state, accounts: [...state.accounts, acc] };
}

export function updateAccount(state, id, patch) {
  const next = {
    ...state,
    accounts: state.accounts.map((a) => {
      if (a.id !== id) return a;
      const merged = { ...a, ...patch };
      const acc = createAccount(merged);
      // U 区：类型留空就是留空。createAccount 的「空类型默认资产类」只适用于**新建**；
      // 不能因为改个名字就把未分类账户悄悄变成资产类 —— 那会顺手把它的流水入账，
      // 正好是「类型不填决不入账」要防的事。
      if (!String(merged.type == null ? '' : merged.type).trim()) acc.type = '';
      return acc;
    }),
  };
  // 类型改了要双向同步：补齐类型 → 草稿转正；清空类型 / 断链 → 已入账降回草稿。
  return syncPostStatus(next);
}

/**
 * 录入流水时用的「文本 → 账户」兜底（用户 2026-10-30）：
 * 流水只负责记录。能对上词库或银行/信用启发式的，直接写入类型和分类，
 * 并打上 fresh（设置页显示「新增」）。对不上才留空类型。
 *
 * @returns {{state:object, id:string|null}}
 */
export function ensureAccountByText(state, text) {
  const t = String(text || '').trim();
  if (!t) return { state, id: null, held: '' };

  const norm = normalizeCode(t);
  const hit = (state.accounts || []).find(
    (a) => a && (a.name === t || (a.code && normalizeCode(a.code) === norm)),
  );
  if (hit) return { state, id: hit.id, held: '' };

  const guess = matchAccountName(t);
  if (!guess) {
    const link = noteTarget(t);
    if (link && link.nodeName && link.nodeName !== t) {
      const node = ensureAccountByText(state, link.nodeName);
      return { state: node.state, id: node.id, held: t };
    }
  }
  const acc = {
    id: 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    code: '',
    name: t,
    type: guess ? guess.type : '',
    category: guess ? guess.category : '',
    isHidden: false,
    fresh: true,
  };
  const next = { ...state, accounts: [...(state.accounts || []), acc] };
  return { state: syncPostStatus(next), id: acc.id, held: '' };
}

/**
 * 删账户。**同时删掉引用它的流水**，否则会留下断链。
 * 期初虚拟账户不许删。
 */
/**
 * 从设置表移除账户。**不碰流水**（用户 2026-10-30）：
 * 流水是主表 / 原数据，设置表只是列举账户信息；删掉账户后，
 * 引用它的流水会显示为空账户（V3 断链提示），统计结果跟着受影响而已。
 */
export function removeAccount(state, id) {
  if (id === OPENING_ACCOUNT_ID) return state;
  const next = { ...state, accounts: state.accounts.filter((a) => a.id !== id) };
  const deleted = Array.isArray(state.deletedAccounts) ? state.deletedAccounts : [];
  const marked = deleted.includes(id) ? deleted : [...deleted, id];
  // 账户没了 → 引用它的流水变成断链，按 U 区规则同样不入账（降级为草稿）。
  // 流水本身一个字不动，只是不再参与余额；流水表序号会显示红色缺端标记。
  const pruned = syncPostStatus({ ...next, deletedAccounts: marked }, { upgrade: false });
  return dropMappingsFor(pruned, id);
}

/* ---------- 流水：增删改 ---------- */

export function addTransaction(state, patch) {
  const tx = createTransaction({ seq: patch.seq || nextSeq(state), ...patch });
  // 入账资格在这里定：U 区（空类型）或断链的流水一律留成草稿。
  // 只降不升 —— 用户显式写的 draft 不因为写库就自动入账。
  return syncPostStatus({ ...state, transactions: [...state.transactions, tx] }, { upgrade: false });
}

export function updateTransaction(state, id, patch) {
  const next = {
    ...state,
    transactions: state.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
  return syncPostStatus(next, { upgrade: false });
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
    (out.transactions || []).filter((t) => t.opening).map(openingAccountId).filter(Boolean),
  );

  const added = [];
  for (const acc of out.accounts) {
    if (acc.id === OPENING_ACCOUNT_ID) continue;
    const amount = Number(acc.opening) || 0;
    if (!amount) continue;
    if (hasOpening.has(acc.id)) continue;
    const ends = openingEnds(acc);
    added.push(createTransaction({
      date: openingDate,
      from_id: ends.from_id,
      to_id: ends.to_id,
      amount,
      note: '期初',
      opening: true,
      seq: 0,
    }));
  }

  if (!added.length) return { state: out, added: 0 };
  out.transactions = [...added, ...out.transactions];
  // 期初流水也要过一遍入账资格：空类型账户的期初同样不入账（U 区规则）。
  return { state: syncPostStatus(out, { upgrade: false }), added: added.length };
}

/** 可见账户（排除 isHidden 的期初账户） */
export function visibleAccounts(state) {
  return (state.accounts || []).filter((a) => !a.isHidden);
}

/** 账户类型库：内置五种 + 现有账户里出现过的（用户自己填的类型会进来，绘图用） */
export function accountTypesOf(state) {
  const out = ALL_ACCOUNT_TYPES.slice();
  for (const a of state.accounts || []) {
    const t = String((a && a.type) || '').trim();
    if (t && out.indexOf(t) < 0) out.push(t);
  }
  return out;
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
    // 类型可以自己输入（用户 2026-10-29）；类型库 = 内置四种 + 现有备注里出现过的，
    // 所以某类型最后一条备注删掉后，它自然从类型库里消失。
    type: String(o.type || '').trim(),
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
 * 代入文本 = 类型：关键字，内容（类型后中文冒号，关键字后中文逗号，空的跳过）——用户 2026-10-29。
 */
export function noteTextByCode(state, raw) {
  const code = normalizeCode(raw);
  if (!code) return '';
  const hit = (state.notes || []).find((n) => n && normalizeCode(n.code) === code);
  if (!hit) return '';

  const type = String(hit.type || '').trim();
  const keyword = String(hit.keyword || '').trim();
  const text = String(hit.text || '').trim();

  // 「类型：关键字，内容」；类型可以不填，关键字也可以不填
  if (type) {
    return type + '：' + [keyword, text].filter(Boolean).join('，');
  }
  return [keyword, text].filter(Boolean).join('，');
}

/** 类型库：内置四种 + 现有备注里出现过的类型（删掉最后一条就自动消失） */
export function noteTypesOf(state) {
  const out = NOTE_TYPES.slice();
  for (const n of state.notes || []) {
    const t = String((n && n.type) || '').trim();
    if (t && out.indexOf(t) < 0) out.push(t);
  }
  return out;
}
