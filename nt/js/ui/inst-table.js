// 界面：分期表（表格内直接交互）
/**
 * 分期表（照单文件版的外观）
 *
 * 一条占**两行**：
 *   本金行  账户名称 | 账单日 | 本息合计（本） | 各月本金…
 *   利息行  分期金额 | 还款日 | 本息合计（息） | 各月利息…
 *
 * 期数不再单独占一列 —— 它由「月份格里填了几格」推出来（core/installment-cells）。
 * 月份列的范围由 spanOf 按现有分期的首末月自动算（上限 MAX_MONTHS）；
 * 新增一条之后会把它的首月列滚进视野，避免新记录看起来「没有分期」。
 *
 * 不算钱：每期多少、合计多少全部来自 core/installment-cells。
 */

import { tpl } from './render-transactions.js';
import { setCell as putCell, cellsOf, sumOf, spanOf } from '../core/installment-cells.js';
import { mountCellRange } from './cell-range.js';
import { mountAddForm } from './inst-add.js';
import { paintHandles, syncFrozen } from './table-layout.js';
import { FIXED_COLS, applyFixedWidths, revealRow } from './inst-layout.js';
import { showUndo } from './undo-bar.js';
import { moneyAlways, moneyInt } from '../core/format.js';
import { clampDay, isDayGiven } from '../core/schema.js';
import { parseAccountInput } from '../core/account-resolver.js';
import { removeBatch, restoreBatch } from '../core/state-store.js';

/** 固定 3 列：账户名称/分期金额 · 账单日/还款日 · 本息合计（FIXED_COLS 来自 inst-layout） */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param {object} ctx
 * @param {HTMLElement} tbody #nt-inst-body
 * @param {{onSummary?:(text:string)=>void}} [opts]
 */
export function mountInstTable(ctx, tbody, opts) {
  const o = opts || {};

  mountCellRange(tbody.closest('table'), {
    paste: 'single',
    onDeleteRows: (ids) => deleteRows(ids),
    onNotice: (t) => ctx.setFooter(t),
  });

  // 月份列宽由 table-layout 统一管（拖任一个月份列 → 所有月份列一起变），
  // 这里只要把上次拖出来的宽度读回来。
  try {
    const saved = localStorage.getItem('nt_inst_mw');
    const tbl = tbody.closest('table');
    if (saved && tbl) tbl.style.setProperty('--nt-inst-mw', saved);
  } catch (e) { /* 无痕模式读不到就算了 */ }

  const addForm = mountAddForm(ctx, (info) => {
    render();
    revealRow(tbody, info);
  });

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

  /* ---------- 渲染 ---------- */

  function render() {
    const state = ctx.getState();
    const list = (state.scheduled || []).filter((s) => s && s.isScheduled && s.inst);
    const span = spanOf(list, null, todayMonth(), state.hiddenMonths);

    paintHead(span, list);
    tbody.textContent = '';

    for (const row of list) paintRow(row, span);
    paintAddForm();
    summarize(list);
  }

  /**
   * 两行表头（照单文件版）：
   *   上行 分期银行 | 账单日 | 每月合计 | 每个月那一列的合计
   *   下行 分期金额 | 还款日 | 本息总计 | 月份标签
   */
  function paintHead(span, list) {
    const tr = document.getElementById('nt-inst-head');
    const sumTr = document.getElementById('nt-inst-sum');
    if (!tr || !sumTr) return;

    while (tr.children.length > FIXED_COLS) tr.removeChild(tr.lastChild);
    while (sumTr.children.length > FIXED_COLS) sumTr.removeChild(sumTr.lastChild);

    for (const m of span) {
      let total = 0;
      for (const row of list) {
        const c = cellsOf(row)[m];
        if (c) total += (Number(c.p) || 0) + (Number(c.i) || 0);
      }
      const sumTh = document.createElement('th');
      sumTh.className = 'nt-th nt-c-month nt-c-sum';
      sumTh.scope = 'col';
      sumTh.textContent = total ? moneyAlways(total) : '';
      sumTr.appendChild(sumTh);

      const th = document.createElement('th');
      th.className = 'nt-th nt-c-month nt-inst-month';
      th.scope = 'col';
      th.dataset.month = m;          // revealRow 靠它找「首月那一列」
      const label = document.createElement('span');
      label.textContent = m;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'nt-inst-month-del';
      del.textContent = '删除';
      del.hidden = true;
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        dropMonth(m);
      });
      th.addEventListener('click', () => {
        const show = del.hidden;
        for (const b of tr.querySelectorAll('.nt-inst-month-del')) b.hidden = true;
        del.hidden = !show;
      });
      th.appendChild(label);
      th.appendChild(del);
      tr.appendChild(th);
      // 列宽手柄由 table-layout.paintHandles 统一补（这里再加一个会重叠）
    }

    const cols = document.getElementById('nt-inst-cols');
    if (cols) {
      cols.textContent = '';
      for (let i = 0; i < FIXED_COLS; i += 1) cols.appendChild(document.createElement('col'));
      for (let i = 0; i < span.length; i += 1) {
        const col = document.createElement('col');
        col.className = 'nt-c-month';
        cols.appendChild(col);
      }
    }

    // 表头是每次渲染重建的，手柄也得跟着补 ——
    // bindAllTables 只在启动时跑一次，新 th 上不会有 handle。
    const table = tbody.closest('table');
    if (table) {
      applyFixedWidths(table);
      paintHandles(table);
      syncFrozen(table);
    }
  }

  function paintRow(row, span) {
    const acc = ctx.getIndex().byId.get(row.to_id) || ctx.getIndex().byId.get(row.from_id);
    const cells = cellsOf(row);
    const sumP = sumOf(cells, 'p', span);
    const sumI = sumOf(cells, 'i', span);

    const trP = document.createElement('tr');
    trP.className = 'nt-row nt-inst-main';
    trP.dataset.id = row.id;
    trP.appendChild(inputCell(row.id, 'name', acc ? acc.name : '', 'nt-c-inst-name'));
    trP.appendChild(textCell(acc && acc.billDay ? acc.billDay : '', 'nt-cell-day'));
    trP.appendChild(textCell(moneyAlways(sumP), 'nt-cell-num'));

    const trI = document.createElement('tr');
    trI.className = 'nt-row nt-inst-sub';
    trI.dataset.id = row.id;
    const tdPrincipal = inputCell(row.id, 'principal', moneyInt(row.inst.principal), 'nt-cell-input-num');
    tdPrincipal.classList.add('nt-inst-principal-cell');
    // 删除按钮放在**第二行（分期金额行）开头靠左**，照单文件版：
    // 不单独占一列、不参与列宽，靠绝对定位压在格子左侧，输入框留出内边距。
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'nt-inst-del';
    delBtn.dataset.act = 'del';
    delBtn.textContent = '×';
    delBtn.title = '删除这条分期';
    delBtn.setAttribute('aria-label', '删除这条分期');
    tdPrincipal.insertBefore(delBtn, tdPrincipal.firstChild);
    trI.appendChild(tdPrincipal);
    trI.appendChild(textCell(acc && acc.repayDay ? acc.repayDay : '', 'nt-cell-day'));
    trI.appendChild(textCell(moneyAlways(sumI), 'nt-cell-num'));

    for (const m of span) {
      trP.appendChild(monthCell(row.id, m, 'p', (cells[m] || {}).p));
      trI.appendChild(monthCell(row.id, m, 'i', (cells[m] || {}).i));
    }

    tbody.appendChild(trP);
    tbody.appendChild(trI);
    bindRow(trP, row.id);
    bindRow(trI, row.id);
  }

  /* ---------- 格子 ---------- */

  function textCell(text, cls) {
    const td = document.createElement('td');
    td.className = 'nt-cell' + (cls ? ' ' + cls : '');
    td.textContent = text == null ? '' : String(text);
    return td;
  }

  function inputCell(id, field, value, cls) {
    const td = document.createElement('td');
    td.className = 'nt-cell';
    const input = document.createElement('input');
    input.className = 'nt-cell-input' + (cls ? ' ' + cls : '');
    input.type = 'text';
    input.setAttribute('data-field', field);
    input.value = value == null ? '' : String(value);
    td.appendChild(input);
    return td;
  }

  function monthCell(id, month, part, value) {
    const td = document.createElement('td');
    td.className = 'nt-cell nt-cell-num';
    const input = document.createElement('input');
    input.className = 'nt-cell-input nt-cell-input-num nt-inst-cell';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.setAttribute('data-month', month);
    input.setAttribute('data-part', part);
    input.setAttribute('aria-label', `${month} 的${part === 'p' ? '本金' : '利息'}`);
    input.value = value ? String(round2(value)) : '';
    td.appendChild(input);
    return td;
  }

  function bindRow(tr, id) {
    const del = tr.querySelector('[data-act="del"]');
    if (del) {
      // 别让表格的框选/长按把手势接走；preventDefault 还能阻止 mousedown 把焦点
      // 从正在编辑的金额输入框移走 —— 否则 blur → change → render 会把按钮
      // 从 DOM 里摘掉，紧接着的 click 落空（第一次点删除看起来没反应）。
      del.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      });
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        deleteRows([id]);
      });
    }

    for (const inp of tr.querySelectorAll('input[data-field]')) {
      inp.addEventListener('change', () => applyEdit(id, inp.getAttribute('data-field'), inp.value));
    }
    for (const inp of tr.querySelectorAll('input[data-month]')) {
      inp.addEventListener('change', () => applyCell(id, inp.getAttribute('data-month'), inp.getAttribute('data-part'), inp.value));
    }
  }

  /* ---------- 编辑 ---------- */

  function replaceRow(id, mutate) {
    const st = ctx.getState();
    const list = (st.scheduled || []).slice();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    const row = { ...list[i], inst: { ...(list[i].inst || {}) } };
    mutate(row);
    row.amount = round2((Number(row.inst.principal) || 0) + (Number(row.inst.interest) || 0));
    list[i] = row;
    ctx.setState({ ...st, scheduled: list });
    ctx.saveNow();
    render();
    return true;
  }

  function applyEdit(id, field, raw) {
    const v = String(raw || '').trim();
    replaceRow(id, (row) => {
      if (field === 'name') {
        const r = parseAccountInput(ctx.getIndex(), v);
        if (!r || !r.acc) return;
        row.to_id = r.acc.id;
        row.from_id = null;
      } else if (field === 'principal') {
        row.inst.principal = Math.max(0, Number(String(v).replace(/[¥,\s]/g, '')) || 0);
      } else if (field === 'day') {
        row.day = clampDay(v || 5);
      } else if (field === 'billDay') {
        if (isDayGiven(v)) row.billDay = clampDay(v); else delete row.billDay;
      }
    });
  }

  /**
   * 改月份格 = 写进手填矩阵。
   * 第一格改动时会把「均摊出来的那份」固化下来，之后这条分期就以 cells 为准。
   */
  function applyCell(id, month, part, raw) {
    replaceRow(id, (row) => {
      const cells = putCell(cellsOf(row), month, part, raw);
      row.inst.cells = cells;
      const months = Object.keys(cells).sort();
      row.inst.periods = months.length;
      if (months.length) row.inst.firstMonth = months[0];
      let p = 0;
      let i = 0;
      for (const m of months) { p += cells[m].p || 0; i += cells[m].i || 0; }
      row.inst.principal = round2(p);
      row.inst.interest = round2(i);
    });
  }

  function dropMonth(month) {
    const st = ctx.getState();
    const hidden = (st.hiddenMonths || []).concat([month]);
    const scheduled = (st.scheduled || []).map((row) => {
      if (!row || !row.inst || !row.inst.cells) return row;
      const cells = { ...row.inst.cells };
      delete cells[month];
      return { ...row, inst: { ...row.inst, cells } };
    });
    ctx.setState({ ...st, hiddenMonths: hidden, scheduled });
    ctx.saveNow();
    render();
  }

  /** 输入框一行。添加按钮在「分期」切换旁边。 */
  function paintAddForm() {
    let bar = document.getElementById('nt-inst-add');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nt-inst-add';
      bar.className = 'nt-inst-add';
      const wrap = tbody.closest('.nt-tablewrap');
      if (wrap && wrap.parentNode) wrap.parentNode.insertBefore(bar, wrap);
    }
    bar.textContent = '';
    addForm.render(bar);
  }

  function summarize(list) {
    let pendingP = 0;
    let pendingI = 0;
    const now = todayMonth();
    for (const s of list) {
      const cells = cellsOf(s);
      for (const m of Object.keys(cells)) {
        if (m < now) continue;
        pendingP += cells[m].p || 0;
        pendingI += cells[m].i || 0;
      }
    }
    const text = `${list.length} 条分期 · 未还本金 ${moneyAlways(pendingP)} · 未还利息 ${moneyAlways(pendingI)}`;
    if (o.onSummary) o.onSummary(text);
    ctx.setFooter(`${list.length} 条分期`);
  }

  return { render, submit: () => addForm.submit() };

  function todayMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
}
