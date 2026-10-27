// 界面：固定 tab
/**
 * 计划视图（固定收支 + 分期）
 * 层：第五层 · UI
 *
 * **全部表格内直接交互，不弹窗**：
 *   分期表每格都是输入框，改完立刻重算「每月应还」；
 *   末尾永远有一行空行，填齐关键字段就变成一条真记录。
 *
 * 数字全部来自 core/installment-engine，本文件不算钱。
 */

import { renderRows, renderEmpty } from '../ui/table.js';
import { tpl } from '../ui/render-transactions.js';
import { money, moneyAlways } from '../core/format.js';
import { computeInstallment } from '../core/installment-engine.js';
import { createScheduled, normalizeMonth, clampDay } from '../core/schema.js';
import { parseAccountInput } from '../core/account-resolver.js';

const FREQ_LABEL = { monthly: '每月', daily: '每天' };
const EDIT_FIELDS = ['name', 'principal', 'interest', 'periods', 'firstMonth', 'day'];

export function mountPlan(section, ctx) {
  const caps = section.querySelector('#nt-plan-caps');
  const info = section.querySelector('#nt-plan-info');
  const fixed = section.querySelector('#nt-plan-fixed');
  const inst = section.querySelector('#nt-plan-inst');
  const fixedBody = section.querySelector('#nt-plan-body');
  const instBody = section.querySelector('#nt-inst-body');

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
    fixedBody.textContent = '';
    if (instBody) instBody.textContent = '';
    if (cap === 'inst') renderInst();
    else renderFixed();
  }

  /* ================= 分期：表格内交互 ================= */

  function renderInst() {
    const state = ctx.getState();
    const list = (state.scheduled || []).filter((s) => s && s.isScheduled && s.inst);
    const nowMonth = todayMonth();

    // 注意：不能用 renderRows —— 它只写 textContent，填不进 <input>
    const rowTpl = tpl('tpl-inst-row');
    if (rowTpl) {
      const frag = document.createDocumentFragment();
      list.forEach((s2, i) => {
        const tr = rowTpl.cloneNode(true);
        tr.dataset.id = s2.id;
        const d = instRowData(s2, i, nowMonth);
        setCell(tr, 'seq', d.seq);
        setCell(tr, 'name', d.name);
        setCell(tr, 'principal', d.principal);
        setCell(tr, 'interest', d.interest);
        setCell(tr, 'periods', d.periods);
        setCell(tr, 'firstMonth', d.firstMonth);
        setCell(tr, 'day', d.day);
        setCell(tr, 'per', d.per);
        bindRow(tr, s2.id);
        frag.appendChild(tr);
      });
      instBody.appendChild(frag);
    }

    const newTpl = tpl('tpl-inst-new');
    if (newTpl && instBody) {
      const tr = newTpl.cloneNode(true);
      instBody.appendChild(tr);
      bindNewRow(tr);
    }

    summarize(list, nowMonth);
  }

  function instRowData(s, i, nowMonth) {
    const st = computeInstallment(s, nowMonth);
    const acc = ctx.getIndex().byId.get(s.to_id) || ctx.getIndex().byId.get(s.from_id);
    return {
      id: s.id,
      seq: i + 1,
      name: acc ? acc.name : '',
      principal: s.inst.principal ? String(s.inst.principal) : '',
      interest: s.inst.interest ? String(s.inst.interest) : '',
      periods: String(s.inst.periods || ''),
      firstMonth: shortMonth(s.inst.firstMonth),
      day: String(s.day || ''),
      per: money(st.perPeriod),
    };
  }

  function bindRow(tr, id) {
    const del = tr.querySelector('[data-act="del"]');
    if (del) {
      del.addEventListener('click', () => {
        const state = ctx.getState();
        ctx.setState({ ...state, scheduled: (state.scheduled || []).filter((x) => x.id !== id) });
        ctx.saveNow();
        render();
        ctx.setFooter('已删除 1 条分期');
      });
    }
    for (const f of EDIT_FIELDS) {
      const inp = tr.querySelector('[data-field="' + f + '"]');
      if (!inp) continue;
      inp.addEventListener('change', () => applyEdit(id, f, inp.value));
    }
  }

  function applyEdit(id, field, raw) {
    const state = ctx.getState();
    const list = (state.scheduled || []).slice();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;

    const s = { ...list[i], inst: { ...(list[i].inst || {}) } };
    const v = String(raw || '').trim();

    if (field === 'name') {
      const r = parseAccountInput(ctx.getIndex(), v);
      if (!r || !r.acc) { render(); return; }     // 认不出就还原
      s.to_id = r.acc.id;
      s.from_id = null;
    } else if (field === 'principal') {
      s.inst.principal = Math.max(0, Number(v) || 0);
    } else if (field === 'interest') {
      s.inst.interest = Math.max(0, Number(v) || 0);
    } else if (field === 'periods') {
      s.inst.periods = Math.max(0, Math.floor(Number(v) || 0));
    } else if (field === 'firstMonth') {
      const m = normalizeMonth(v);
      if (!m) { render(); return; }
      s.inst.firstMonth = m;
    } else if (field === 'day') {
      s.day = clampDay(v);
    }

    s.amount = computeInstallment(s, todayMonth()).perPeriod;

    list[i] = s;
    ctx.setState({ ...state, scheduled: list });
    ctx.saveNow();
    render();
  }

  function bindNewRow(tr) {
    // 6 个字段各自触发 change，必须只成一条：建完就上锁，且行已脱离 DOM 就不再处理
    let created = false;
    const tryCreate = () => {
      if (created || !tr.isConnected) return;
      const get = (f) => {
        const el = tr.querySelector('[data-field="' + f + '"]');
        return el ? String(el.value || '').trim() : '';
      };

      const name = get('name');
      const principal = Number(get('principal')) || 0;
      const interest = Number(get('interest')) || 0;
      const periods = Math.floor(Number(get('periods')) || 0);
      const firstMonth = normalizeMonth(get('firstMonth'));

      if (!name || !(principal > 0) || !(periods > 0) || !firstMonth) return;

      const r = parseAccountInput(ctx.getIndex(), name);
      if (!r || !r.acc) return;

      const row = createScheduled({
        to_id: r.acc.id,
        from_id: null,
        day: clampDay(get('day') || 5),
        note: '分期',
        amount: (principal + interest) / periods,
        inst: { periods, firstMonth, principal, interest },
      });

      created = true;
      const state = ctx.getState();
      ctx.setState({ ...state, scheduled: (state.scheduled || []).concat([row]) });
      ctx.saveNow();
      render();
      ctx.setFooter('已新增 1 条分期');
    };

    for (const f of EDIT_FIELDS) {
      const inp = tr.querySelector('[data-field="' + f + '"]');
      if (inp) inp.addEventListener('change', tryCreate);
    }
  }

  function summarize(list, nowMonth) {
    let totalP = 0;
    let totalI = 0;
    let perMonth = 0;
    for (const s of list) {
      const st = computeInstallment(s, nowMonth);
      totalP += st.remainingPrincipal;
      totalI += st.remainingInterest;
      perMonth += st.perPeriod;
    }
    info.textContent = `未还本金 ${moneyAlways(totalP)} · 未还利息 ${moneyAlways(totalI)}`;
    ctx.setFooter(`${list.length} 条分期 · 每月应还 ${moneyAlways(perMonth)}`
      + ` · 未还本金 ${moneyAlways(totalP)}`);
  }

  /* ================= 固定收支 ================= */

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

/** '2026-10' → '2610'（表格里短一点好输入） */
function shortMonth(m) {
  const s = String(m || '');
  return /^\d{4}-\d{2}$/.test(s) ? s.slice(2).replace('-', '') : '';
}

/** 填一格：input 就写 value，其它写 textContent */
function setCell(tr, field, value) {
  const el = tr.querySelector('[data-field="' + field + '"]');
  if (!el) return;
  const v = value == null ? '' : String(value);
  if (el.tagName === 'INPUT') el.value = v;
  else el.textContent = v;
}
