// 界面：（无界面）草稿入账与短语映射
/**
 * 草稿何时入账、短语学到哪个账户
 * 层：第一层 · 数据基座
 *
 * 入账条件：两端都在、两个账户都有类型、金额 > 0。
 * 金额为 0 的草稿若入账会变成 V2，所以留在草稿里。
 * mappings 是 { 短语: accountId }，随 state 加密。
 */

import { indexAccounts, isPosted } from './schema.js';
import { syncPlanFromEdit } from './plan-occurrence.js';

function byId(accounts) {
  return accounts instanceof Map ? accounts : indexAccounts(accounts);
}

/** 两端齐全且都有类型、金额为正，才可以丢掉 draft 标记。 */
export function canPost(tx, accounts) {
  if (!tx || !tx.from_id || !tx.to_id) return false;
  if (!(Number(tx.amount) > 0)) return false;
  const map = byId(accounts);
  const from = map.get(tx.from_id);
  const to = map.get(tx.to_id);
  if (!from || !to) return false;
  if (!String(from.type || '').trim() || !String(to.type || '').trim()) return false;
  return true;
}

/** 满足条件的草稿去掉 status（缺 status = 已入账）。 */
export function promoteDrafts(state) {
  const accounts = (state && state.accounts) || [];
  let changed = false;
  const transactions = ((state && state.transactions) || []).map((t) => {
    if (!t || t.status !== 'draft' || !canPost(t, accounts)) return t;
    changed = true;
    const next = { ...t };
    delete next.status;
    return next;
  });
  return changed ? { ...state, transactions } : state;
}

/**
 * 序号颜色：missing 缺端（红），untyped 有账户但没类型（黄），空串是已入账。
 * @returns {'missing'|'untyped'|''}
 */
export function markerOf(tx, accounts) {
  if (!tx) return '';
  const map = byId(accounts);
  const side = (id) => !!(id && map.get(id));
  const amountOk = Number(tx.amount) > 0;
  if (!side(tx.from_id) || !side(tx.to_id) || !amountOk) return 'missing';
  if (isPosted(tx)) return '';
  const typed = (id) => {
    const a = map.get(id);
    return a && String(a.type || '').trim();
  };
  if (!typed(tx.from_id) || !typed(tx.to_id)) return 'untyped';
  return 'missing';
}

export function learnMapping(state, phrase, accountId) {
  const key = String(phrase || '').trim();
  if (!key || !accountId) return state;
  const prev = (state && state.mappings) || {};
  if (prev[key] === accountId) return state;
  return { ...state, mappings: { ...prev, [key]: accountId } };
}

export function mappingFor(state, phrase) {
  const key = String(phrase || '').trim();
  if (!key) return null;
  const id = ((state && state.mappings) || {})[key];
  return id ? String(id) : null;
}

/** 格子里改了转入：记下「备注 → 账户」，再尝试把草稿入账。 */
export function afterTxEdit(state, id, field) {
  let next = syncPlanFromEdit(state, id);
  if (field === 'to') {
    const tx = ((state && state.transactions) || []).find((t) => t && t.id === id);
    if (tx && tx.note && tx.to_id) next = learnMapping(next, tx.note, tx.to_id);
  }
  return promoteDrafts(next);
}

/** 删掉指向这个账户的映射。账户没了，映射不能留着。 */
export function dropMappingsFor(state, accountId) {
  const src = (state && state.mappings) || {};
  const mappings = {};
  let changed = false;
  for (const [k, v] of Object.entries(src)) {
    if (v === accountId) { changed = true; continue; }
    mappings[k] = v;
  }
  return changed ? { ...state, mappings } : state;
}
