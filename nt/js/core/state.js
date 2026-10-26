/**
 * 纯函数：状态容器与不可变更新。
 *
 * 约定（公约 3.2）：`state.transactions` 与 `state.accounts` 是唯一事实源；
 * 本文件不读 localStorage、不碰 DOM，只做「旧状态 → 新状态」的变换。
 */

export const STATE_VERSION = 1;

/** 建一本空账。 */
export function createState() {
  return {
    version: STATE_VERSION,
    accounts: [],
    transactions: [],
    seq: 0,
  };
}

/** 深拷贝（结构化克隆可用时优先用它）。 */
export function clone(v) {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

/** 取下一个流水序号（不改原状态）。 */
export function nextSeq(state) {
  const max = (state.transactions || []).reduce((m, t) => Math.max(m, Number(t.seq) || 0), 0);
  return Math.max(Number(state.seq) || 0, max) + 1;
}

/** 追加一笔流水，返回新状态（原状态不动）。 */
export function addTransaction(state, tx) {
  const seq = Number(tx.seq) || nextSeq(state);
  const row = {
    id: tx.id || makeId('tx'),
    seq,
    date: tx.date || '',
    from: tx.from || '',
    to: tx.to || '',
    amount: tx.amount == null ? '' : String(tx.amount),
    note: tx.note || '',
  };
  return {
    ...state,
    seq,
    transactions: [...state.transactions, row],
  };
}

/** 按 id 改一笔流水，返回新状态。 */
export function updateTransaction(state, id, patch) {
  return {
    ...state,
    transactions: state.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

/** 按 id 删一笔流水，返回新状态。 */
export function removeTransaction(state, id) {
  return {
    ...state,
    transactions: state.transactions.filter((t) => t.id !== id),
  };
}

/** 追加一个账户，返回新状态。 */
export function addAccount(state, acc) {
  const row = {
    id: acc.id || makeId('acc'),
    cat: acc.cat || '资产类',
    sub: acc.sub || '',
    code: acc.code || '',
    name: acc.name || '',
    opening: acc.opening == null ? '0' : String(acc.opening),
    billDay: acc.billDay || '',
    repayDay: acc.repayDay || '',
  };
  return { ...state, accounts: [...state.accounts, row] };
}

/** 按 id 改一个账户，返回新状态。 */
export function updateAccount(state, id, patch) {
  return {
    ...state,
    accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  };
}

/** 按 id 删一个账户，返回新状态。 */
export function removeAccount(state, id) {
  return { ...state, accounts: state.accounts.filter((a) => a.id !== id) };
}

/** 极简唯一 id：时间戳 + 随机后缀，不依赖 crypto（Node 也能跑）。 */
export function makeId(prefix) {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return (prefix || 'id') + '-' + t + '-' + r;
}
