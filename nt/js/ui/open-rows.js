// 数据：开放录入区的结算
/**
 * 结算开放录入区
 * 层：第五层 · UI（只碰流水，不碰 DOM）
 *
 * 用户 2026-11-09：表格下方的空行是计划性编排区，写了一半的内容要留在原位、
 * 不能有编号、也不能一有金额就跳走；只有带金额的行才结算成正式流水，
 * 等切回流水记录表时再统一落到尾行。
 */

import { addTransaction, nextSeq } from '../core/state-store.js';
import { normalizeTypedDate, todayIso } from '../core/format.js';
import { buildAccountIndex } from '../core/account-index.js';
import { endsFromFields, joinHeld } from './flow-ends.js';

const amountOf = (v) => Number(String(v || '').replace(/[¥,\s]/g, ''));

/**
 * @param {object} state
 * @returns {{state:object, keep:Array}|null} 没有带金额的行就返回 null
 */
export function settleOpenRows(state) {
  const open = Array.isArray(state.openRows) ? state.openRows : [];
  if (!open.some((d) => d && amountOf(d.amount) > 0)) return null;

  let s = state;
  const keep = new Array(open.length).fill(null);
  let maxSeq = (s.transactions || []).reduce((m, t) => Math.max(m, Number(t && t.seq) || 0), 0);
  open.forEach((d, i) => {
    if (!d || !(amountOf(d.amount) > 0)) { keep[i] = d || null; return; }

    const ends = endsFromFields(s, buildAccountIndex(s.accounts), d);
    s = ends.state;
    const draft = !ends.fromId || !ends.toId;
    const want = Number(d.seq) || 0;
    const seq = want > maxSeq ? want : nextSeq(s);
    maxSeq = Math.max(maxSeq, seq);
    s = addTransaction(s, {
      date: normalizeTypedDate(d.date || todayIso()),
      from_id: ends.fromId,
      to_id: ends.toId,
      amount: amountOf(d.amount),
      note: joinHeld(d.note, ends.held),
      seq,
      ...(draft ? { status: 'draft' } : {}),
    });
  });

  return { state: { ...s, openRows: keep }, keep };
}
