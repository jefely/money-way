// 界面：固定收支表（表格内直接交互）
/**
 * 固定收支表
 * 层：第五层 · UI
 *
 * 每格都是输入框/下拉，改完立刻落库；
 * 末尾空行填了「金额 + 至少一个账户」就成一条记录。
 *
 * 收支合计只按账户类型分组求和，规则不在这里定义。
 */

import { tpl } from './render-transactions.js';
import { setCell, moneyOrBlank } from './table.js';
import { mountCellRange } from './cell-range.js';
import { moneyAlways } from '../core/format.js';
import { createScheduled, clampDay } from '../core/schema.js';
import { parseAccountInput } from '../core/account-resolver.js';

const FIELDS = ['freq', 'day', 'from', 'to', 'amount', 'note'];

/**
 * @param {object} ctx
 * @param {HTMLElement} tbody #nt-plan-body
 * @param {{onSummary?:(text:string)=>void}} [opts]
 */
export function mountFixedTable(ctx, tbody, opts) {
  const o = opts || {};

  // 框选：整片可复制；粘贴只允许一格（改一格就落库并重渲染，整片粘会只生效第一格）
  mountCellRange(tbody.closest('table'), {
    paste: 'single',
    onDeleteRows: (ids) => {
      const st = ctx.getState();
      ctx.setState({ ...st, scheduled: (st.scheduled || []).filter((x) => !ids.includes(x.id)) });
      ctx.saveNow();
      render();
      ctx.setFooter(`已删除 ${ids.length} 条固定收支`);
    },
    onNotice: (t) => ctx.setFooter(t),
  });

  function render() {
    const state = ctx.getState();
    const list = (state.scheduled || []).filter((s) => s && s.isScheduled && !s.inst);

    tbody.textContent = '';

    const rowTpl = tpl('tpl-sched-row');
    if (rowTpl && list.length) {
      const frag = document.createDocumentFragment();
      list.forEach((row, i) => {
        const tr = rowTpl.cloneNode(true);
        tr.dataset.id = row.id;

        setCell(tr, 'seq', i + 1);
        const freqSel = tr.querySelector('[data-field="freq"]');
        if (freqSel) freqSel.value = row.freq === 'daily' ? 'daily' : 'monthly';
        setCell(tr, 'day', row.day || '');
        setCell(tr, 'from', nameOf(row.from_id));
        setCell(tr, 'to', nameOf(row.to_id));
        setCell(tr, 'amount', moneyOrBlank(row.amount));
        setCell(tr, 'note', row.note || '');

        bindRow(tr, row.id);
        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
    }

    const newTpl = tpl('tpl-sched-new');
    if (newTpl) {
      const tr = newTpl.cloneNode(true);
      tbody.appendChild(tr);
      bindNewRow(tr);
    }

    summarize(list);
  }

  function nameOf(id) {
    const a = ctx.getIndex().byId.get(id);
    return a ? a.name : '';
  }

  function bindRow(tr, id) {
    const del = tr.querySelector('[data-act="del"]');
    if (del) {
      del.addEventListener('click', () => {
        const st = ctx.getState();
        ctx.setState({ ...st, scheduled: (st.scheduled || []).filter((x) => x.id !== id) });
        ctx.saveNow();
        render();
        ctx.setFooter('已删除 1 条固定收支');
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

    const row = { ...list[i] };
    const v = String(raw || '').trim();

    if (field === 'freq') {
      row.freq = v === 'daily' ? 'daily' : 'monthly';
    } else if (field === 'day') {
      row.day = clampDay(v || 1);
    } else if (field === 'from') {
      const r = parseAccountInput(ctx.getIndex(), v);
      row.from_id = r && r.acc ? r.acc.id : null;
    } else if (field === 'to') {
      const r = parseAccountInput(ctx.getIndex(), v);
      row.to_id = r && r.acc ? r.acc.id : null;
    } else if (field === 'amount') {
      row.amount = Math.max(0, Number(v) || 0);
    } else if (field === 'note') {
      row.note = v;
    }

    list[i] = row;
    ctx.setState({ ...st, scheduled: list });
    ctx.saveNow();
    render();
  }

  function bindNewRow(tr) {
    let created = false;
    const tryCreate = () => {
      if (created || !tr.isConnected) return;

      const get = (f) => {
        const el = tr.querySelector('[data-field="' + f + '"]');
        return el ? String(el.value || '').trim() : '';
      };

      const amount = Number(get('amount')) || 0;
      if (!(amount > 0)) return;

      const fromR = parseAccountInput(ctx.getIndex(), get('from'));
      const toR = parseAccountInput(ctx.getIndex(), get('to'));
      const fromId = fromR && fromR.acc ? fromR.acc.id : null;
      const toId = toR && toR.acc ? toR.acc.id : null;
      if (!fromId && !toId) return;       // 两端都空没意义

      const row = createScheduled({
        freq: get('freq') === 'daily' ? 'daily' : 'monthly',
        day: clampDay(get('day') || 1),
        from_id: fromId,
        to_id: toId,
        amount,
        note: get('note'),
      });

      created = true;
      const st = ctx.getState();
      ctx.setState({ ...st, scheduled: (st.scheduled || []).concat([row]) });
      ctx.saveNow();
      render();
      ctx.setFooter('已新增 1 条固定收支');
    };

    for (const f of FIELDS) {
      const inp = tr.querySelector('[data-field="' + f + '"]');
      if (!inp) continue;
      // 延迟到本轮事件结束再判断：用户在一行里连着填几格时，
      // 前面的格子先触发 change；若立刻建行，后面填的会落在已脱离 DOM 的旧行上。
      inp.addEventListener('change', () => { setTimeout(tryCreate, 0); });
    }
  }

  function summarize(list) {
    let income = 0;
    let expense = 0;
    for (const s of list) {
      const amt = Number(s.amount) || 0;
      const from = ctx.getIndex().byId.get(s.from_id);
      const to = ctx.getIndex().byId.get(s.to_id);

      // 「每天」的条目折算成月（30.44 天），否则和每月条目没法相加
      const factor = s.freq === 'daily' ? 30.44 : 1;
      const monthly = amt * factor;

      if ((from && from.type === '收入类') || (to && to.type === '收入类')) income += monthly;
      else expense += monthly;
    }

    const text = `收入合计 ${moneyAlways(income)} · 支出合计 ${moneyAlways(expense)}`;
    if (o.onSummary) o.onSummary(text);
    ctx.setFooter(`${list.length} 条固定收支`);
  }

  return { render };
}
