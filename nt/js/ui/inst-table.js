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
import { mountCellRange } from './cell-range.js';
import { showUndo } from './undo-bar.js';
import { money, moneyAlways } from '../core/format.js';
import { computeInstallment, addMonths, monthsBetween, isDueInMonth as isDueMonth } from '../core/installment-engine.js';
import { createScheduled, normalizeMonth, clampDay } from '../core/schema.js';
import { parseAccountInput } from '../core/account-resolver.js';
import { removeBatch, restoreBatch } from '../core/state-store.js';

const FIELDS = ['name', 'principal', 'periods', 'day', 'interest', 'firstMonth'];

/**
 * @param {{getState:Function, setState:Function, getIndex:Function,
 *          saveNow:Function, setFooter:Function, rerender:Function}} ctx
 * @param {HTMLElement} tbody #nt-inst-body
 * @param {{onSummary?:(text:string)=>void}} [opts]
 */
export function mountInstTable(ctx, tbody, opts) {
  const o = opts || {};

  /** 固定列数（账户名称 / 分期金额 / 期数 / 账单日 / 还款日） */
  const FIXED_COLS = 5;

  // 框选：一条分期占上下两行（同 data-id），cell-range 已去重；
  // 粘贴只允许一格 —— 月份格本来就不是输入框，整片粘一半会被拒。
  mountCellRange(tbody.closest('table'), {
    paste: 'single',
    onDeleteRows: (ids) => deleteRows(ids),
    onNotice: (t) => ctx.setFooter(t),
  });

  /**
   * 删若干条分期，并给 8 秒撤销。
   * 一条分期在表里是上下两行，但只对应一个 id —— 删一条不能只删半条。
   */
  function deleteRows(ids) {
    const r = removeBatch(ctx.getState(), 'scheduled', ids);
    ctx.setState(r.state);
    ctx.saveNow();
    render();

    showUndo(`已删除 ${r.removed.length} 条分期`, () => {
      ctx.setState(restoreBatch(ctx.getState(), 'scheduled', r.removed));
      ctx.saveNow();
      render();
      ctx.setFooter(`已恢复 ${r.removed.length} 条分期`);
    });
  }

  function render() {
    const state = ctx.getState();
    const list = (state.scheduled || []).filter((s) => s && s.isScheduled && s.inst);
    const nowMonth = todayMonth();

    tbody.textContent = '';

    // 月份跨度：从最早的首月到最晚的还清月
    const span = monthSpan(list, nowMonth);
    paintHead(span);

    for (const row of list) {
      const st = computeInstallment(row, nowMonth);
      const acc = ctx.getIndex().byId.get(row.to_id) || ctx.getIndex().byId.get(row.from_id);

      // 上行：本金
      const trP = document.createElement('tr');
      trP.className = 'nt-row nt-inst-main';
      trP.dataset.id = row.id;
      tbody.appendChild(trP);

      trP.appendChild(cellInput(row.id, 'name', acc ? acc.name : '', '', 'nt-c-inst-name'));
      trP.appendChild(cellInput(row.id, 'principal', moneyOrBlank(row.inst.principal), 'nt-cell-input-num'));
      trP.appendChild(cellInput(row.id, 'periods', row.inst.periods || '', 'nt-cell-input-num'));
      trP.appendChild(cellInput(row.id, 'day', row.day || '', 'nt-cell-input-num'));
      trP.appendChild(cellText(row.day ? String(row.day) : '', ''));

      // 下行：利息（左 4 格留空，与上行对齐）
      const trI = document.createElement('tr');
      trI.className = 'nt-row nt-inst-sub';
      trI.dataset.id = row.id;
      tbody.appendChild(trI);

      for (let k = 0; k < FIXED_COLS - 1; k += 1) {
        const td = document.createElement('td');
        td.className = 'nt-cell nt-cell-empty';
        trI.appendChild(td);
      }

      // 每月两格：本金写上行、利息写下行
      for (const m of span) {
        const cell = st && isDueMonth(row, m) ? computeInstallment(row, m) : null;
        trP.appendChild(cellText(cell ? moneyAlways(cell.principalPer) : '', 'nt-cell-num nt-inst-p'));
        trI.appendChild(cellText(cell ? moneyAlways(cell.interestPer) : '', 'nt-cell-num nt-inst-i'));
      }

      bindRow(trP, row.id);
    }

    const newTpl = tpl('tpl-inst-new');
    if (newTpl) {
      const tr = newTpl.cloneNode(true);
      tbody.appendChild(tr);
      bindNewRow(tr);
    }

    summarize(list, nowMonth);
  }

  /** 表头 + 列宽：固定 5 列 + 每月一列，两者必须同步生成 */
  function paintHead(span) {
    const tr = document.getElementById('nt-inst-head');
    if (!tr) return;

    // 先清掉旧的月份列
    while (tr.children.length > FIXED_COLS) tr.removeChild(tr.lastChild);
    for (const m of span) {
      const th = document.createElement('th');
      th.className = 'nt-th nt-c-month';
      th.scope = 'col';
      th.textContent = '还款月' + m;
      tr.appendChild(th);
    }

    // colgroup 与表头一一对应：table-layout: fixed 认的是 col，不是 th
    const cols = document.getElementById('nt-inst-cols');
    if (!cols) return;
    cols.textContent = '';
    for (const cls of ['nt-c-inst-name', '', '', '', '']) {
      const col = document.createElement('col');
      if (cls) col.className = cls;
      cols.appendChild(col);
    }
    for (let i = 0; i < span.length; i += 1) {
      const col = document.createElement('col');
      col.className = 'nt-c-month';
      cols.appendChild(col);
    }
  }

  function cellText(text, cls) {
    const td = document.createElement('td');
    td.className = 'nt-cell' + (cls ? ' ' + cls : '');
    td.textContent = text == null ? '' : String(text);
    return td;
  }

  function cellInput(id, field, value, cls, tdCls) {
    const td = document.createElement('td');
    td.className = 'nt-cell' + (tdCls ? ' ' + tdCls : '');
    const input = document.createElement('input');
    input.className = 'nt-cell-input' + (cls ? ' ' + cls : '');
    input.type = 'text';
    input.setAttribute('data-field', field);
    input.value = value == null ? '' : String(value);
    td.appendChild(input);
    return td;
  }

  /** 月份跨度：最早首月 → 最晚还清月（至少含当月） */
  function monthSpan(list, nowMonth) {
    let first = nowMonth;
    let last = nowMonth;
    for (const row of list) {
      const fm = row.inst && row.inst.firstMonth;
      if (fm && fm < first) first = fm;
      const st = computeInstallment(row, nowMonth);
      if (st.lastMonth && st.lastMonth > last) last = st.lastMonth;
    }
    const out = [];
    const n = monthsBetween(first, last);
    for (let i = 0; i <= (Number.isFinite(n) ? n : 0) && i < 36; i += 1) {
      out.push(addMonths(first, i));
    }
    return out;
  }

  function bindRow(tr, id) {
    const del = tr.querySelector('[data-act="del"]');
    if (del) {
      del.addEventListener('click', () => { deleteRows([id]); });
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

      // 新表没有「首月」列：不填就从当月开始（月份列由它推出来）
      const firstMonth = normalizeMonth(get('firstMonth')) || todayMonth();

      // 建不成时说清楚缺什么。原来这四个条件合成一个 return，
      // 用户填了账户和期数却没建上，页脚一个字都不变 —— 完全不知道卡在哪。
      if (!name) {
        if (principal > 0 || periods > 0) ctx.setFooter('分期还没建成：先填账户');
        return;
      }

      const r = parseAccountInput(ctx.getIndex(), name);
      if (!r || !r.acc) {
        ctx.setFooter(`分期还没建成：账户「${name}」不在账本里`);
        return;
      }

      if (!(principal > 0)) {
        ctx.setFooter('分期还没建成：分期金额要大于 0');
        return;
      }
      if (!(periods > 0)) {
        ctx.setFooter('分期还没建成：期数要大于 0');
        return;
      }
      if (!firstMonth) {
        ctx.setFooter('分期还没建成：首月认不出（写成 2026-10）');
        return;
      }

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
