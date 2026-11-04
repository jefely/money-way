// 界面：（无界面）计划发生：确认到今天 / 作废一期
/**
 * 未来行的确认与作废。
 * 层：第一层 · 数据基座
 *
 * 确认：在「现在」末尾追加一笔今天的流水，模板还在。
 * 作废：只记下这一期不再出现，不改固定收支 / 分期规则。
 * 之后改已确认流水的账户，会写回对应模板的转出 / 转入。
 */

import { createTransaction } from './schema.js';
import { computeInstallment } from './installment-engine.js';

export function planKey(sourceId, month) {
  const id = String(sourceId || '').trim();
  const m = String(month || '').trim();
  if (!id || !m) return '';
  return id + '|' + m;
}

/** 储蓄类资产；没有就退到名称里带「储蓄 / 银行」的资产，再退到任一资产。 */
export function pickSavingsAccount(accounts) {
  const list = (accounts || []).filter((a) => a && !a.isHidden && a.id && a.id !== '__OPENING__');
  const exact = list.find((a) => a.type === '资产类' && String(a.category || '').trim() === '储蓄');
  if (exact) return exact;
  const loose = list.find((a) => a.type === '资产类' && /储蓄|银行/.test(String(a.category || '') + String(a.name || '')));
  if (loose) return loose;
  return list.find((a) => a.type === '资产类') || null;
}

function nextSeq(state) {
  return ((state && state.transactions) || []).reduce((m, t) => Math.max(m, Number(t && t.seq) || 0), 0) + 1;
}

export function occurrenceTaken(state, key) {
  if (!key) return false;
  if (((state && state.voidedPlans) || []).includes(key)) return true;
  return ((state && state.transactions) || []).some((t) => t && t.planKey === key);
}

export function visiblePlans(list, state) {
  return (list || []).filter((v) => v && !occurrenceTaken(state, v.planKey));
}

export function confirmOccurrence(state, spec, today) {
  const s = spec || {};
  const base = state || {};
  const key = s.planKey || planKey(s.sourceId, s.month);
  if (!key || occurrenceTaken(base, key)) return base;
  const tx = createTransaction({
    date: String(today || ''),
    from_id: s.fromId || null,
    to_id: s.toId || null,
    amount: s.amount,
    note: s.note || '',
    seq: nextSeq(base),
    planKey: key,
    planSourceId: s.sourceId || '',
  });
  return {
    ...base,
    voidedPlans: ((base.voidedPlans) || []).filter((k) => k !== key),
    transactions: [...(base.transactions || []), tx],
  };
}

/** 只作废这一期。调用方不应删 scheduled。 */
export function voidOccurrence(state, spec) {
  const key = (spec && (spec.planKey || planKey(spec.sourceId, spec.month))) || '';
  if (!key) return state;
  const list = (state && state.voidedPlans) || [];
  if (list.includes(key)) return state;
  return { ...state, voidedPlans: list.concat(key) };
}

/** 已确认的流水改了账户 / 金额 / 备注 → 写回模板。分期规则不改金额和备注。 */
export function syncPlanFromEdit(state, txId) {
  const tx = ((state && state.transactions) || []).find((t) => t && t.id === txId);
  if (!tx || !tx.planSourceId) return state;
  let changed = false;
  const scheduled = (state.scheduled || []).map((s) => {
    if (!s || s.id !== tx.planSourceId) return s;
    const next = { ...s, from_id: tx.from_id || null, to_id: tx.to_id || null };
    if (!s.inst) {
      next.note = tx.note || '';
      const amt = Number(tx.amount);
      if (amt > 0) next.amount = amt;
    }
    changed = true;
    return next;
  });
  return changed ? { ...state, scheduled } : state;
}

/** 固定表里展示分期规则：转出用储蓄卡，备注带「分期还款」。 */
export function installmentRowView(row, accounts) {
  const s = row || {};
  const st = computeInstallment(s, (s.inst && s.inst.firstMonth) || '');
  const picked = s.from_id ? null : pickSavingsAccount(accounts);
  const fromId = s.from_id || (picked && picked.id) || null;
  const base = String(s.note || '').trim();
  const note = base.includes('分期还款') ? base : ('分期还款' + (base ? ' ' + base : ''));
  return {
    fromId,
    toId: s.to_id || null,
    amount: st.perPeriod || s.amount || 0,
    note,
    day: s.day,
    freq: 'monthly',
  };
}
