// 界面：（无界面）计划发生：确认到今天 / 作废一期
/**
 * 未来行的确认与作废。
 * 层：第一层 · 数据基座
 *
 * 确认：在「现在」末尾追加一笔今天的流水，模板还在。
 * 作废：只记下这一期不再出现，不改固定收支 / 分期规则。
 * 之后改已确认流水的账户，会写回对应模板的转出 / 转入。
 */

import { createTransaction, syncPostStatus } from './schema.js';
import { computeInstallment, dayInMonth } from './installment-engine.js';

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

/**
 * 每月固定收支：到期后自动落成真实流水（用户 2026-11）。
 *
 * 规则：
 *   · 只处理**每月**（daily 不自动，必须点 ▲）；
 *   · 只处理**固定收支**（s.inst 分期仍走原表）；
 *   · 必须是两端齐全、金额 > 0，否则不生成（避免造出无效流水）；
 *   · 只补**当前月**这一期，不猜历史月份（固定收支没有开始月份，补历史会凭空造账）；
 *   · 过了日期就按当月应发生日（如 31 号在 2 月落到月末）生成，不把日期改成今天；
 *   · planKey 去重：已有流水或已作废的同一期不会再来一遍。
 *
 * 纯函数：不改入参，没有可生成项时原样返回（调用方可按 === 判断是否变了）。
 *
 * @param {object} state
 * @param {string} today 'YYYY-MM-DD'
 * @returns {object} 原 state 或带新增 transactions 的新 state
 */
export function materializeDueFixed(state, today) {
  const base = state || {};
  const day = String(today || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return base;
  const month = day.slice(0, 7);
  const scheduled = base.scheduled || [];
  const transactions = base.transactions || [];
  const additions = [];
  let seq = nextSeq(base);

  for (const s of scheduled) {
    if (!s || !s.isScheduled || s.inst) continue;
    if (s.freq === 'daily') continue;
    if (!s.from_id || !s.to_id) continue;
    const amount = Number(s.amount) || 0;
    if (!(amount > 0)) continue;

    const dueDay = dayInMonth(month, Number(s.day) || 1);
    const date = `${month}-${String(dueDay).padStart(2, '0')}`;
    if (!dueDay || date > day) continue;

    const key = planKey(s.id, month);
    if (!key || occurrenceTaken(base, key)) continue;
    additions.push(createTransaction({
      date,
      from_id: s.from_id,
      to_id: s.to_id,
      amount,
      note: s.note || '',
      seq: seq++,
      planKey: key,
      planSourceId: s.id || '',
    }));
  }

  if (!additions.length) return base;
  // 计划落账也会碰到空类型账户：按 U 区规则，它们一律留成草稿。
  return syncPostStatus({ ...base, transactions: transactions.concat(additions) }, { upgrade: false });
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
  return syncPostStatus({
    ...base,
    voidedPlans: ((base.voidedPlans) || []).filter((k) => k !== key),
    transactions: [...(base.transactions || []), tx],
  }, { upgrade: false });
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
