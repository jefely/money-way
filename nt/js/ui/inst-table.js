// 界面：分期表（表格内直接交互）
/**
 * 分期表（照单文件版的外观）
 *
 * 一条占**两行**：
 *   本金行  账户名称 | 账单日 | 本息合计（本） | 各月本金…
 *   利息行  分期金额 | 还款日 | 本息合计（息） | 各月利息…
 *
 * 期数不再单独占一列 —— 它由「月份格里填了几格」推出来（core/installment-cells）。
 * 月份列的范围由表格上方的「起 / 止」两个输入决定；不填就按现有分期自动算。
 *
 * 不算钱：每期多少、合计多少全部来自 core/installment-cells。
 */

import { tpl } from './render-transactions.js';
import { setCell as putCell, cellsOf, sumOf, spanOf } from '../core/installment-cells.js';
import { mountCellRange } from './cell-range.js';
import { mountRangeBar } from './inst-range.js';
import { addMonths } from '../core/installment-engine.js';
import { showUndo } from './undo-bar.js';
import { money, moneyAlways } from '../core/format.js';
import { createScheduled, clampDay, isDayGiven } from '../core/schema.js';
import { parseAccountInput } from '../core/account-resolver.js';
import { removeBatch, restoreBatch } from '../core/state-store.js';

/** 固定 3 列：账户名称/分期金额 · 账单日/还款日 · 本息合计 */
const FIXED_COLS = 3;
/** 新增行要填的字段（都在本金行里） */
const NEW_FIELDS = ['name', 'principal', 'periods', 'billDay', 'day', 'interest', 'firstMonth'];

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

  // 月份范围工具条（起 / 止 / 自动），改完就重画
  const rangeBar = mountRangeBar(ctx, tbody.closest('.nt-tablewrap'), () => render());

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
    const span = spanOf(list, state.installRange, todayMonth());

    rangeBar.render();
    paintHead(span, list);
    tbody.textContent = '';

    for (const row of list) paintRow(row, span);
    paintAddForm();
    summarize(list);
  }

  /**
   * 两行表头（照单文件版）：
   *   上行 账户名称 | 账单日 | 每月合计 | 每个月那一列的合计
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
      th.className = 'nt-th nt-c-month';
      th.scope = 'col';
      th.textContent = m;
      tr.appendChild(th);
    }

    const cols = document.getElementById('nt-inst-cols');
    if (!cols) return;
    cols.textContent = '';
    for (let i = 0; i < FIXED_COLS; i += 1) cols.appendChild(document.createElement('col'));
    for (let i = 0; i < span.length; i += 1) {
      const col = document.createElement('col');
      col.className = 'nt-c-month';
      cols.appendChild(col);
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
    trP.appendChild(inputCell(row.id, 'billDay', row.billDay || '', 'nt-cell-input-num'));
    trP.appendChild(textCell(moneyAlways(sumP), 'nt-cell-num'));

    const trI = document.createElement('tr');
    trI.className = 'nt-row nt-inst-sub';
    trI.dataset.id = row.id;
    trI.appendChild(inputCell(row.id, 'principal', moneyAlways(row.inst.principal), 'nt-cell-input-num'));
    trI.appendChild(inputCell(row.id, 'day', row.day || '', 'nt-cell-input-num'));
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
    if (del) del.addEventListener('click', () => deleteRows([id]));

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

  /** 新增表单：账户 / 金额 / 期数 / 首月 → 生成一条并按均摊铺满月份格 */
  function paintAddForm() {
    let bar = document.getElementById('nt-inst-add');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nt-inst-add';
      bar.className = 'nt-inst-add';
      const anchor = document.getElementById('nt-inst-bar');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    }
    bar.textContent = '';

    const mk = (key, ph, w) => {
      const inp = document.createElement('input');
      inp.className = 'nt-input nt-input-sm';
      inp.type = 'text';
      inp.setAttribute('data-add', key);
      inp.placeholder = ph;
      inp.setAttribute('aria-label', ph);
      if (w) inp.style.width = w;
      bar.appendChild(inp);
      return inp;
    };

    mk('name', '账户', '84px');
    mk('principal', '分期金额', '92px');
    mk('periods', '期数', '52px');
    mk('firstMonth', '首月 2611', '84px');
    mk('billDay', '账单日', '60px');
    mk('day', '还款日', '60px');
    mk('interest', '总利息', '76px');

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'nt-btn nt-btn-sm nt-btn-primary';
    go.textContent = '添加';
    go.addEventListener('click', addRow);
    bar.appendChild(go);
  }

  function addRow() {
    const bar = document.getElementById('nt-inst-add');
    if (!bar) return;
    const get = (k) => {
      const el = bar.querySelector('[data-add="' + k + '"]');
      return el ? String(el.value || '').trim() : '';
    };
    const num = (k) => Math.abs(Number(String(get(k)).replace(/[¥,\s]/g, '')) || 0);

    const name = get('name');
    if (!name) return ctx.setFooter('分期还没建成：先填账户');
    const r = parseAccountInput(ctx.getIndex(), name);
    if (!r || !r.acc) return ctx.setFooter(`分期还没建成：账户「${name}」不在账本里`);

    const principal = num('principal');
    const interest = num('interest');
    if (!principal && !interest) return ctx.setFooter('分期还没建成：分期金额要大于 0');

    const periods = Math.max(1, Math.floor(Number(get('periods')) || 0));
    const first = parseFirstMonth(get('firstMonth')) || todayMonth();

    // 均摊铺满：之后用户可以在月份格里逐格改
    const cells = {};
    const pPer = round2(principal / periods);
    const iPer = round2(interest / periods);
    for (let k = 0; k < periods; k += 1) {
      const m = addMonths(first, k);
      if (m) cells[m] = { p: pPer, i: iPer };
    }

    const row = createScheduled({
      to_id: r.acc.id,
      from_id: null,
      day: clampDay(get('day') || 5),
      billDay: get('billDay'),
      note: '分期',
      amount: round2(principal + interest),
      inst: { periods, firstMonth: first, principal, interest, cells },
    });

    const st = ctx.getState();
    ctx.setState({ ...st, scheduled: (st.scheduled || []).concat([row]) });
    ctx.saveNow();
    render();
    ctx.setFooter('已新增 1 条分期');
  }

  function parseFirstMonth(raw) {
    const v = String(raw || '').replace(/[^0-9-]/g, '').replace(/\//g, '-');
    if (!v) return '';
    if (/^\d{4}-\d{1,2}$/.test(v)) {
      const [y, m] = v.split('-');
      return y + '-' + String(Number(m)).padStart(2, '0');
    }
    const d = v.replace(/-/g, '');
    if (d.length === 4) return '20' + d.slice(0, 2) + '-' + d.slice(2);
    if (d.length === 6) return d.slice(0, 4) + '-' + d.slice(4);
    return '';
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

  return { render };

  function todayMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
}
