/**
 * 计划视图（固定收支 + 分期）
 * 层：第五层 · UI
 *
 * 固定收支表消费 state.scheduled（只存规则，虚拟流水由 scheduler-engine 现算）。
 * 分期矩阵在下一版接入，本版只放结构占位。
 */

import { renderRows, renderEmpty } from '../ui/table.js';
import { money, moneyAlways } from '../core/format.js';

const FREQ_LABEL = { monthly: '每月', daily: '每天' };

export function mountPlan(section, ctx) {
  const caps = section.querySelector('#nt-plan-caps');
  const info = section.querySelector('#nt-plan-info');
  const fixed = section.querySelector('#nt-plan-fixed');
  const inst = section.querySelector('#nt-plan-inst');
  const body = section.querySelector('#nt-plan-body');

  let cap = 'fixed';

  caps.addEventListener('click', (ev) => {
    const b = ev.target.closest('.nt-cap');
    if (!b) return;
    cap = b.getAttribute('data-cap');
    for (const x of caps.querySelectorAll('.nt-cap')) {
      x.setAttribute('aria-selected', x === b ? 'true' : 'false');
    }
    fixed.hidden = cap !== 'fixed';
    inst.hidden = cap !== 'inst';
    render();
  });

  function render() {
    if (cap === 'inst') {
      info.textContent = '分期';
      ctx.setFooter('分期 · 引擎已就绪（installment-engine / scheduler-engine）');
      return;
    }

    const state = ctx.getState();
    const list = (state.scheduled || []).filter((s) => s && s.isScheduled && !s.inst);

    const rows = list.map((s, i) => ({
      seq: i + 1,
      freq: FREQ_LABEL[s.freq] || '每月',
      day: String(s.day || ''),
      from: nameOf(s.from_id),
      to: nameOf(s.to_id),
      amount: money(s.amount),
      note: s.note || '',
      state: '待生成',
    }));

    if (!rows.length) renderEmpty(body, '还没有固定收支（下一版支持在这里新增）', 8);
    else renderRows(body, rows, 'tpl-sched-row');

    let income = 0;
    let expense = 0;
    for (const s of list) {
      const amt = Number(s.amount) || 0;
      const from = accountOf(s.from_id);
      const to = accountOf(s.to_id);
      if ((from && from.type === '收入类') || (to && to.type === '收入类')) income += amt;
      else expense += amt;
    }

    info.textContent = `收入合计 ${moneyAlways(income)} · 支出合计 ${moneyAlways(expense)}`;
    const tail = list.length ? '编辑任一格即与流水脱钩' : '下一版支持在这里新增';
    ctx.setFooter(`${list.length} 条固定收支 · ${tail}`);
  }

  function nameOf(id) {
    const a = ctx.getIndex().byId.get(id);
    return a ? a.name : '';
  }

  function accountOf(id) {
    return ctx.getIndex().byId.get(id) || null;
  }

  return { render };
}
