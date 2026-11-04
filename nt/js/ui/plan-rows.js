// 界面：流水 tab → 未来行的确认 / 作废
/**
 * ▲ 把这一期收进「现在」的末尾（日期改今天）。
 * × 只作废这一期，不删固定收支模板。
 */

import { confirmOccurrence, voidOccurrence } from '../core/plan-occurrence.js';
import { todayIso } from '../core/format.js';

/** 未来行：▲ 和作废按钮。只读输入，不走「固定」复选框。 */
export function decorateVirtualRow(tr) {
  tr.classList.add('nt-row-virtual');
  tr.dataset.virtual = '1';
  for (const inp of tr.querySelectorAll('input')) {
    if (!inp.classList.contains('nt-fixed-box')) inp.readOnly = true;
  }
  const fixed = tr.querySelector('.nt-cell-fixed');
  if (fixed) {
    fixed.textContent = '';
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'nt-btn nt-btn-icon nt-plan-confirm';
    up.textContent = '▲';
    up.setAttribute('aria-label', '确认到今天');
    fixed.appendChild(up);
  }
  const del = tr.querySelector('.nt-cell-action button');
  if (del) {
    del.classList.add('nt-plan-void');
    del.setAttribute('aria-label', '作废这一期');
  }
}

/** 打开流水时，视口对齐「现在」最后 6 行，不落到未来段。 */
export function scrollPresent(body, rowH) {
  const present = body.querySelectorAll('tr[data-id]:not([data-virtual="1"])');
  const more = body.querySelector('tr.nt-row-more') ? 1 : 0;
  return Math.max(0, (present.length + more - 6) * rowH);
}

export function bindPlanRowActions(tbody, ctx, render) {
  if (!tbody || tbody.dataset.planRows === '1') return;
  tbody.dataset.planRows = '1';
  tbody.addEventListener('click', (ev) => {
    const confirmBtn = ev.target && ev.target.closest && ev.target.closest('.nt-plan-confirm');
    const voidBtn = ev.target && ev.target.closest && ev.target.closest('.nt-plan-void');
    if (!confirmBtn && !voidBtn) return;
    ev.preventDefault();
    ev.stopPropagation();
    const tr = ev.target.closest('tr');
    if (!tr) return;
    const spec = {
      planKey: tr.dataset.plan || '',
      sourceId: tr.dataset.source || '',
      month: tr.dataset.month || '',
      fromId: tr.dataset.fromId || null,
      toId: tr.dataset.toId || null,
      amount: tr.dataset.amount || 0,
      note: (tr.querySelector('[data-field="note"]') || {}).value || '',
    };
    if (voidBtn) {
      const ok = typeof confirm !== 'function'
        || confirm('作废这一期？固定收支模板不会改。');
      if (!ok) return;
      ctx.setState(voidOccurrence(ctx.getState(), spec));
      ctx.setFooter('已作废这一期，固定收支模板还在');
    } else {
      ctx.setState(confirmOccurrence(ctx.getState(), spec, todayIso()));
      ctx.setFooter('已确认到今天，可再改账户');
    }
      if (ctx.save) ctx.save();
      if (render) render();
  }, true);
}
