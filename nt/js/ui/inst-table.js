// 界面：分期表（表格内直接交互）
/**
 * 分期表
 * 层：第五层 · UI
 *
 * 每格都是输入框，改完立刻落库并重算「每月应还」；
 * 末尾永远有一行空行，填齐「账户 + 本金 + 期数 + 首月」就变成一条真记录。
 *
 * 不算钱：每月应还、剩余本息全部来自 core/installment-engine。
 */

import { tpl } from './render-transactions.js';
import { setCell, moneyOrBlank } from './table.js';
import { money, moneyAlways } from '../core/format.js';
import { computeInstallment } from '../core/installment-engine.js';
import { createScheduled, normalizeMonth, clampDay } from '../core/schema.js';
import { parseAccountInput } from '../core/account-resolver.js';

const FIELDS = ['name', 'principal', 'interest', 'periods', 'firstMonth', 'day'];

/**
 * @param {{getState:Function, setState:Function, getIndex:Function,
 *          saveNow:Function, setFooter:Function, rerender:Function}} ctx
 * @param {HTMLElement} tbody #nt-inst-body
 * @param {{onSummary?:(text:string)=>void}} [opts]
 */
export function mountInstTable(ctx, tbody, opts) {
  const o = opts || {};

  function render() {
    const state = ctx.getState();
    const list = (state.scheduled || []).filter((s) => s && s.isScheduled && s.inst);
    const nowMonth = todayMonth();

    tbody.textContent = '';

    const rowTpl = tpl('tpl-inst-row');
    if (rowTpl && list.length) {
      const frag = document.createDocumentFragment();
      list.forEach((row, i) => {
        const tr = rowTpl.cloneNode(true);
        tr.dataset.id = row.id;
        const st = computeInstallment(row, nowMonth);
        const acc = ctx.getIndex().byId.get(row.to_id) || ctx.getIndex().byId.get(row.from_id);

        setCell(tr, 'seq', i + 1);
        setCell(tr, 'name', acc ? acc.name : '');
        setCell(tr, 'principal', moneyOrBlank(row.inst.principal));
        setCell(tr, 'interest', moneyOrBlank(row.inst.interest));
        setCell(tr, 'periods', row.inst.periods || '');
        setCell(tr, 'firstMonth', shortMonth(row.inst.firstMonth));
        setCell(tr, 'day', row.day || '');
        setCell(tr, 'per', money(st.perPeriod));

        bindRow(tr, row.id);
        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
    }

    const newTpl = tpl('tpl-inst-new');
    if (newTpl) {
      const tr = newTpl.cloneNode(true);
      tbody.appendChild(tr);
      bindNewRow(tr);
    }

    summarize(list, nowMonth);
  }

  function bindRow(tr, id) {
    const del = tr.querySelector('[data-act="del"]');
    if (del) {
      del.addEventListener('click', () => {
        const st = ctx.getState();
        ctx.setState({ ...st, scheduled: (st.scheduled || []).filter((x) => x.id !== id) });
        ctx.saveNow();
        render();
        ctx.setFooter('已删除 1 条分期');
      });
    }

    for (const f of FIELDS) {
      const inp = tr.querySelector('[data-field="' + f + '"]');
      if (!inp) continue;
      inp.addEventListener('change', () => applyEdit(id, f, inp.value));
    }
  }

  function applyEdit(id, field, raw) {
    const st = ctx.getState();
    const list = (st.scheduled || []).slice();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;

    const row = { ...list[i], inst: { ...(list[i].inst || {}) } };
    const v = String(raw || '').trim();

    if (field === 'name') {
      const r = parseAccountInput(ctx.getIndex(), v);
      if (!r || !r.acc) { render(); return; }
      row.to_id = r.acc.id;
      row.from_id = null;
    } else if (field === 'principal') {
      row.inst.principal = Math.max(0, Number(v) || 0);
    } else if (field === 'interest') {
      row.inst.interest = Math.max(0, Number(v) || 0);
    } else if (field === 'periods') {
      row.inst.periods = Math.max(0, Math.floor(Number(v) || 0));
    } else if (field === 'firstMonth') {
      const m = normalizeMonth(v);
      if (!m) { render(); return; }
      row.inst.firstMonth = m;
    } else if (field === 'day') {
      row.day = clampDay(v);
    }

    row.amount = computeInstallment(row, todayMonth()).perPeriod;
    list[i] = row;
    ctx.setState({ ...st, scheduled: list });
    ctx.saveNow();
    render();
  }

  function bindNewRow(tr) {
    // 6 个字段各自触发 change，必须只成一条：建完上锁 + 行已脱离 DOM 就不再处理
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
      const st = ctx.getState();
      ctx.setState({ ...st, scheduled: (st.scheduled || []).concat([row]) });
      ctx.saveNow();
      render();
      ctx.setFooter('已新增 1 条分期');
    };

    for (const f of FIELDS) {
      const inp = tr.querySelector('[data-field="' + f + '"]');
      if (!inp) continue;
      // 延迟到本轮事件结束再判断：用户在一行里连着填几格时，
      // 前面的格子先触发 change；若立刻建行，后面填的会落在已脱离 DOM 的旧行上。
      inp.addEventListener('change', () => { setTimeout(tryCreate, 0); });
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
    const text = `未还本金 ${moneyAlways(totalP)} · 未还利息 ${moneyAlways(totalI)}`;
    if (o.onSummary) o.onSummary(text);
    ctx.setFooter(`${list.length} 条分期 · 每月应还 ${moneyAlways(perMonth)}`
      + ` · 未还本金 ${moneyAlways(totalP)}`);
  }

  return { render };
}

export function todayMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export function shortMonth(m) {
  const s = String(m || '');
  return /^\d{4}-\d{2}$/.test(s) ? s.slice(2).replace('-', '') : '';
}
