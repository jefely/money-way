// 界面：开放录入区草稿的持久化
/**
 * 开放录入区草稿
 * 层：第五层 · UI
 *
 * 空行里的内容（位置 + 五个字段）不写进流水，只存 state.openRows；
 * 输入后 350ms 安静落盘（不进撤销栈），切页/后台时立即 flush。
 * 带金额的行由 flow 在「切回流水表」时结算（见 open-rows.js）。
 */

import { blankDrafts } from './render-transactions.js';

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
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => flush(false), 350);
  }, true);

  return {
    seedInitial() { seed(ctx.getState().openRows || []); },
    sync,
    flush,
    /** 结算后：内存草稿换成剩下的位置 */
    reseed(rows) { seed(rows); dirty = false; },
  };
}
