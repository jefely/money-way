/**
 * 多账本（纯函数）
 * 层：第一层 · 数据基座
 *
 * 数据布局：
 *   活动账本 → state.accounts / transactions / scheduled（顶层，现有代码不变）
 *   其他账本 → state.ledgers[id] = { accounts, transactions, scheduled }（快照）
 *   所有账本名 → state.ledgerNames[id] = '名字'
 *   当前账本 → state.activeLedger = id
 *
 * 切换时把当前账本写进快照，再从目标快照加载到顶层。
 */

let seq = 0;

function newId() {
  seq += 1;
  return 'ledger_' + Date.now().toString(36) + '_' + seq;
}

/** 所有账本（含活动）→ [{id, name, active}] */
export function listLedgers(state) {
  const names = state.ledgerNames || {};
  return Object.keys(names).map((id) => ({
    id,
    name: names[id],
    active: id === state.activeLedger,
  }));
}

/** 把活动账本的数据存进 ledgers 快照（其余函数的前置步骤） */
function saveActive(state) {
  const ledgers = { ...(state.ledgers || {}) };
  ledgers[state.activeLedger] = {
    accounts: state.accounts || [],
    transactions: state.transactions || [],
    scheduled: state.scheduled || [],
  };
  return { ...state, ledgers };
}

/** 新建账本（空数据）并切过去 */
export function createLedger(state, name) {
  const n = String(name || '').trim() || '新账本';
  const id = newId();
  const saved = saveActive(state);
  const ledgerNames = { ...(saved.ledgerNames || {}), [id]: n };
  const ledgers = { ...(saved.ledgers || {}) };
  ledgers[id] = { accounts: [], transactions: [], scheduled: [] };

  return {
    ...saved,
    ledgerNames,
    ledgers,
    activeLedger: id,
    accounts: [],
    transactions: [],
    scheduled: [],
  };
}

/** 切换账本（目标必须已存在） */
export function switchLedger(state, id) {
  if (!id || id === state.activeLedger) return state;
  const saved = saveActive(state);
  const target = (saved.ledgers || {})[id];
  if (!target) return state;

  const ledgers = { ...(saved.ledgers || {}) };
  delete ledgers[id];

  return {
    ...saved,
    ledgers,
    activeLedger: id,
    accounts: target.accounts || [],
    transactions: target.transactions || [],
    scheduled: target.scheduled || [],
  };
}

/** 重命名账本 */
export function renameLedger(state, id, name) {
  const n = String(name || '').trim();
  if (!n || !id) return state;
  return { ...state, ledgerNames: { ...(state.ledgerNames || {}), [id]: n } };
}

/** 删除账本（不能删活动账本） */
export function removeLedger(state, id) {
  if (!id || id === state.activeLedger) return state;
  const ledgers = { ...(state.ledgers || {}) };
  delete ledgers[id];
  const ledgerNames = { ...(state.ledgerNames || {}) };
  delete ledgerNames[id];
  return { ...state, ledgers, ledgerNames };
}
