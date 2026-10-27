// 界面：固定 tab
/**
 * 计划视图（固定收支 + 分期）
 * 层：第五层 · UI
 *
 * 固定收支表消费 state.scheduled 里**没有 inst 的那些**；
 * 分期表消费**带 inst 的那些**，数字全部来自 core/installment-engine（本文件不算钱）。
 */

import { renderRows, renderEmpty } from '../ui/table.js';
import { money, moneyAlways } from '../core/format.js';
import { computeInstallment } from '../core/installment-engine.js';
import { createScheduled } from '../core/schema.js';
import { openInstallmentDialog } from '../ui/installment-dialog.js';

const FREQ_LABEL = { monthly: '每月', daily: '每天' };

export function mountPlan(section, ctx) {
  const caps = section.querySelector('#nt-plan-caps');
  const info = section.querySelector('#nt-plan-info');
  const fixed = section.querySelector('#nt-plan-fixed');
  const inst = section.querySelector('#nt-plan-inst');
  const fixedBody = section.querySelector('#nt-plan-body');
  const instBody = section.querySelector('#nt-inst-body');

  // 分期自己的工具条（固定收支那一套是静态 HTML，这里动态插一个）
  const instBar = document.createElement('div');
  instBar.className = 'nt-toolbar nt-inst-bar';
  instBar.innerHTML = '<button class="nt-btn nt-btn-primary" type="button" id="nt-inst-add">新增分期</button>';
  inst.before(instBar);
  instBar.hidden = true;
  instBar.querySelector('#nt-inst-add').addEventListener('click', () => {
    openInstallmentDialog({
      accounts: ctx.getState().accounts || [],
      onSubmit: (patch) => {
        const s = ctx.getState();
        const row = createScheduled(patch);
        ctx.setState({ ...s, scheduled: (s.scheduled || []).concat([row]) });
        ctx.saveNow();
        render();
      },
      onDone: () => ctx.setFooter('已新增 1 条分期'),
    });
  });

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
    instBar.hidden = cap !== 'inst';
    render();
  });

  function render() {
    fixedBody.textContent = '';
    if (instBody) instBody.textContent = '';
    if (cap === 'inst') renderInst();
    else renderFixed();
  }

  /* ---------- 分期 ---------- */

  function renderInst() {
    const state = ctx.getState();
    const list = (state.scheduled || []).filter((s) => s && s.isScheduled && s.inst);
    const nowMonth = todayMonth();

    const rows = list.map((s, i) => {
      const st = computeInstallment(s, nowMonth);
      return {
        seq: i + 1,
        name: nameOf(s.to_id) || nameOf(s.from_id) || '（未指定账户）',
        per: money(st.perPeriod),
        periods: st.periods + ' 期',
        first: st.firstMonth || '—',
        paid: st.paidPeriods + ' / ' + st.periods,
        remainP: money(st.remainingPrincipal),
        remainI: money(st.remainingInterest),
        id: s.id,
      };
    });

    if (!rows.length) renderEmpty(instBody, '还没有分期。点上面的「新增分期」记一笔。', 9);
    else renderRows(instBody, rows, 'tpl-inst-row', (tr, row) => { tr.dataset.id = row.id; });

    // 删除
    if (rows.length) {
      instBody.querySelectorAll('tr[data-id] [data-act="del"]').forEach((b) => {
        b.addEventListener('click', () => {
          const id = b.closest('tr').dataset.id;
          const s = ctx.getState();
          ctx.setState({ ...s, scheduled: (s.scheduled || []).filter((x) => x.id !== id) });
          ctx.saveNow();
          render();
          ctx.setFooter('已删除 1 条分期');
        });
      });
    }

    let totalP = 0;
    let totalI = 0;
    for (const s of list) {
      const st = computeInstallment(s, nowMonth);
      totalP += st.remainingPrincipal;
      totalI += st.remainingInterest;
    }

    info.textContent = `未还本金 ${moneyAlways(totalP)} · 未还利息 ${moneyAlways(totalI)}`;
    ctx.setFooter(`${list.length} 条分期 · 未还本金 ${moneyAlways(totalP)} · 未还利息 ${moneyAlways(totalI)}`);
  }

  /* ---------- 固定收支 ---------- */

  function renderFixed() {
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

    if (!rows.length) renderEmpty(fixedBody, '还没有固定收支。', 8);
    else renderRows(fixedBody, rows, 'tpl-sched-row');

    let income = 0;
    let expense = 0;
    for (const s of list) {
      const amt = Number(s.amount) || 0;
      const from = ctx.getIndex().byId.get(s.from_id);
      const to = ctx.getIndex().byId.get(s.to_id);
      if ((from && from.type === '收入类') || (to && to.type === '收入类')) income += amt;
      else expense += amt;
    }

    info.textContent = `收入合计 ${moneyAlways(income)} · 支出合计 ${moneyAlways(expense)}`;
    ctx.setFooter(`${list.length} 条固定收支`);
  }

  function nameOf(id) {
    const a = ctx.getIndex().byId.get(id);
    return a ? a.name : '';
  }

  return { render };
}

/** '2026-10' */
function todayMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
