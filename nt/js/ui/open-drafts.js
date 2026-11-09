// 界面：开放录入区草稿的持久化
/**
 * 开放录入区草稿
 * 层：第五层 · UI
 *
 * 空行里的内容（位置 + 五个字段）不写进流水，只存 state.openRows；
 * 输入后 350ms 安静落盘（不进撤销栈），切页/后台时立即 flush。
 * 带金额的行由 flow 在「切回流水表」时结算（见 open-rows.js）。
 */

import { blankDrafts, patchBlankDraft } from './render-transactions.js';
import { nextSeq } from '../core/state-store.js';
import { shortDate, todayIso } from '../core/format.js';

const amountOf = (v) => Number(String(v || '').replace(/[¥,\s]/g, ''));

/**
 * 空行录入了金额：补今天日期 + 预分配序号（用户 2026-11-09）。
 * 不建单、不移动；序号先显示在开放区，切回流水表时才结算到尾行。
 */
export function assignOpenAmount(tr, ctx) {
  const k = Number(tr.dataset.blank);
  if (!Number.isFinite(k) || k < 0) return;
  const amountEl = tr.querySelector('[data-field="amount"]');
  const has = !!(amountEl && amountOf(amountEl.value) > 0);
  const cell = tr.querySelector('.nt-cell-seq');
  const draft = blankDrafts()[k] || {};
  if (!has) {
    if (!draft.seq) return;
    patchBlankDraft(k, { seq: 0 });
    if (cell) cell.textContent = '';
    return;
  }
  if (draft.seq) return;
  const dateEl = tr.querySelector('[data-field="date"]');
  const date = (dateEl && dateEl.value) || shortDate(todayIso());
  if (dateEl) dateEl.value = date;
  const st = ctx.getState();
  const used = Math.max(0,
    ...(st.openRows || []).map((d) => Number(d && d.seq) || 0),
    ...blankDrafts().map((d) => Number(d && d.seq) || 0));
  const seq = Math.max(nextSeq(st), used + 1);
  patchBlankDraft(k, { date, seq });
  if (cell) cell.textContent = String(seq);
}

export function bindOpenDrafts(tbody, ctx, seed, onSaved) {
  let timer = 0;
  let dirty = false;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /** 渲染前调用：内存里没有未存改动时，用 state 里的草稿覆盖（撤销/结算后） */
  function sync() {
    if (dirty) return;
    const saved = ctx.getState().openRows || [];
    if (!same(saved, blankDrafts())) seed(saved);
  }

  function flush(now) {
    clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    const rows = blankDrafts();
    const st = ctx.getState();
    if (same(rows, st.openRows || [])) return;
    ctx.setState({ ...st, openRows: rows }, { silent: true });
    if (now && ctx.saveNow) ctx.saveNow();
    else ctx.save();
    if (onSaved) onSaved();
  }

  tbody.addEventListener('input', (ev) => {
    if (!ev.target.closest || !ev.target.closest('tr[data-blank]')) return;
    touch();
  }, true);

  /** 外部改了草稿（金额识别后补日期/序号）：标脏并安排落盘 */
  function touch() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => flush(false), 350);
  }

  return {
    seedInitial() { seed(ctx.getState().openRows || []); },
    sync,
    flush,
    touch,
    /** 结算后：内存草稿换成剩下的位置 */
    reseed(rows) { seed(rows); dirty = false; },
  };
}
