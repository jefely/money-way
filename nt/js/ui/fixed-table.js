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
import { mountExcelGrid } from './excel-grid.js';
import { deferRender } from './batch-render.js';
import { showUndo } from './undo-bar.js';
import { moneyAlways } from '../core/format.js';
import { createScheduled, clampDay } from '../core/schema.js';
import { parseAccountInput } from '../core/account-resolver.js';
import { removeBatch, restoreBatch, ensureAccountByText } from '../core/state-store.js';
import { installmentRowView, pickSavingsAccount } from '../core/plan-occurrence.js';

const FIELDS = ['freq', 'day', 'from', 'to', 'amount', 'note'];
const BLANK_ROWS = 10;

/**
 * @param {object} ctx
 * @param {HTMLElement} tbody #nt-plan-body
 * @param {{onSummary?:(text:string)=>void}} [opts]
 */
export function mountFixedTable(ctx, tbody, opts) {
  const o = opts || {};

  // 和流水页同一套格子层：单击选中、双击编辑、行号选行、五按钮菜单
  const grid = mountExcelGrid(tbody.closest('table'), tbody, {
    onNotice: (t) => ctx.setFooter(t),
    nativeCommit: true,
    enterTab: true,
    onLeaveRow: (tr) => { if (tr.__tryCreate) tr.__tryCreate(); },
  });

  /**
   * 删若干条固定收支，并给 8 秒撤销。
   * 单行 × 与框选批量删走同一条路 —— 两个入口给不同待遇最容易长歪。
   */
  function deleteRows(ids) {
    const st = ctx.getState();
    const hitsInst = (st.scheduled || []).some((s) => s && s.inst && ids.includes(s.id));
    if (hitsInst && typeof confirm === 'function') {
      const ok = confirm('删除的是整条分期规则，不是只作废一期。未来行上的作废不会改模板。继续？');
      if (!ok) return;
    }
    const r = removeBatch(st, 'scheduled', ids);
    ctx.setState(r.state);
    ctx.saveNow();
    render();

    showUndo(`已删除 ${r.removed.length} 条固定收支`, () => {
      ctx.setState(restoreBatch(ctx.getState(), 'scheduled', r.removed));
      ctx.saveNow();
      render();
      ctx.setFooter(`已恢复 ${r.removed.length} 条固定收支`);
    });
  }

  function render() {
    grid.select.reset(); if (deferRender(render)) return;
    const state = ctx.getState();
    const list = (state.scheduled || []).filter((s) => s && s.isScheduled);

    // 四段顺序（用户 2026-11 指定）：
    //   ① 来自流水勾选的（有 srcTxId）—— 最前
    //   ② 手动添加的 —— 中间
    //   ③ 10 行空行 —— 手动录入位
    //   ④ 分期产生的（有 inst）—— 最后
    // 以前是所有计划混在一起、空行吊在末尾，分期一多就把手动录入位淹没了。
    const auto = list.filter((s) => s.srcTxId);
    const inst = list.filter((s) => s.inst);
    const manual = list.filter((s) => !s.srcTxId && !s.inst);
    const head = [...auto, ...manual];

    tbody.textContent = '';
    const rowTpl = tpl('tpl-sched-row');
    let seq = 0;

    /** 画一批计划行（序号跨批次连续） */
    const paintRows = (rows) => {
      if (!rowTpl || !rows.length) return;
      const frag = document.createDocumentFragment();
      for (const row of rows) {
        seq += 1;
        const tr = rowTpl.cloneNode(true);
        tr.dataset.id = row.id;
        setCell(tr, 'seq', seq);
        const freqSel = tr.querySelector('[data-field="freq"]');
        if (freqSel) freqSel.value = row.freq === 'daily' ? 'daily' : 'monthly';
        showDay(tr, row.freq, row.day);
        const view = row.inst ? installmentRowView(row, state.accounts) : null;
        const fromId = view ? view.fromId : row.from_id;
        setCell(tr, 'from', nameOf(fromId) || (pickSavingsAccount(state.accounts) || {}).name || '');
        setCell(tr, 'to', nameOf(view ? view.toId : row.to_id));
        setCell(tr, 'amount', moneyOrBlank(view ? view.amount : row.amount));
        setCell(tr, 'note', view ? view.note : (row.note || ''));
        bindRow(tr, row.id);
        frag.appendChild(tr);
      }
      tbody.appendChild(frag);
    };

    paintRows(head);

    const newTpl = tpl('tpl-sched-new');
    if (newTpl) {
      // 10 个空行夹在「手动」和「分期」之间
      const blanks = document.createDocumentFragment();
      for (let k = 0; k < BLANK_ROWS; k += 1) {
        const tr = newTpl.cloneNode(true);
        blanks.appendChild(tr);
        bindNewRow(tr);
      }
      tbody.appendChild(blanks);
    }

    paintRows(inst);

    summarize(list);
  }

  function nameOf(id) {
    const a = ctx.getIndex().byId.get(id);
    return a ? a.name : '';
  }

  /**
   * 日期格：每月可录入几号；每日不需要日期，显示横线且只读。
   * 用户 2026-11：「选择每日，日期就变成横线，不可录入」。
   */
  function showDay(tr, freq, day) {
    const inp = tr.querySelector('[data-field="day"]');
    if (!inp) return;
    if (freq === 'daily') {
      inp.value = '—';
      inp.readOnly = true;
      inp.tabIndex = -1;
      return;
    }
    inp.readOnly = false;
    inp.removeAttribute('tabindex');
    inp.value = day ? String(day) : '';
  }

  function bindRow(tr, id) {
    const del = tr.querySelector('[data-act="del"]');
    if (del) {
      del.addEventListener('click', () => deleteRows([id]));
    }

    for (const f of FIELDS) {
      const inp = tr.querySelector('[data-field="' + f + '"]');
      if (!inp) continue;
      inp.addEventListener('change', () => {
        // 简码 → 节点名称：失焦/切下一格就回填，不必等整行保存后重绘
        if ((f === 'from' || f === 'to') && String(inp.value || '').trim()) {
          const r = parseAccountInput(ctx.getIndex(), inp.value);
          if (r && r.acc) inp.value = r.display;
        }
        applyEdit(id, f, inp.value);
      });
    }
  }

  function applyEdit(id, field, raw) {
    let st = ctx.getState();
    const list = (st.scheduled || []).slice();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;

    const row = { ...list[i] };
    const v = String(raw || '').trim();

    if (field === 'freq') {
      row.freq = v === 'daily' ? 'daily' : 'monthly';
    } else if (field === 'day') {
      row.day = clampDay(v || 1);
    } else if (field === 'from' || field === 'to') {
      const r = parseAccountInput(ctx.getIndex(), v);
      if (r && r.acc) {
        row[field + '_id'] = r.acc.id;
      } else if (v) {
        // 改规则时也能写新节点：补一个空类型账户，归到 U 未分类
        const e = ensureAccountByText(st, v);
        st = e.state;
        row[field + '_id'] = e.id;
      } else {
        row[field + '_id'] = null;
      }
    } else if (field === 'amount') {
      row.amount = Math.max(0, Number(v) || 0);
    } else if (field === 'note') {
      row.note = v;
    }

    list[i] = row;
    ctx.setState({ ...st, scheduled: list });
    ctx.saveNow();
    // 频率会切换「日期」可编辑状态，仍重绘；其余就地改，只更新合计，别打断 Tab / 粘贴
    if (field === 'freq') render();
    else summarize(list);
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
      if (!(amount > 0)) {
        // 金额还没填：用户可能刚点进第一格，不吵
        return;
      }

      const fromRaw = get('from');
      const toRaw = get('to');
      let st = ctx.getState();
      const fromR = parseAccountInput(ctx.getIndex(), fromRaw);
      const toR = parseAccountInput(ctx.getIndex(), toRaw);
      let fromId = fromR && fromR.acc ? fromR.acc.id : null;
      let toId = toR && toR.acc ? toR.acc.id : null;

      // 认不出的节点名不拦：和流水页一样补一个空类型的「未分类」节点
      if (!fromId && fromRaw) {
        const r = ensureAccountByText(st, fromRaw);
        st = r.state;
        fromId = r.id;
      }
      if (!toId && toRaw) {
        const r = ensureAccountByText(st, toRaw);
        st = r.state;
        toId = r.id;
      }

      if (!fromId && !toId) {
        ctx.setFooter('固定收支还没建成：转出 / 转入 至少填一个节点');
        return;
      }

      const isDaily = get('freq') === 'daily';
      const row = createScheduled({
        freq: isDaily ? 'daily' : 'monthly',
        day: isDaily ? 1 : clampDay(get('day') || 1),
        from_id: fromId,
        to_id: toId,
        amount,
        note: get('note'),
      });

      created = true;
      ctx.setState({ ...st, scheduled: (st.scheduled || []).concat([row]) });
      ctx.saveNow();
      render();
      ctx.setFooter('已新增 1 条固定收支');
    };
    // 格子层离开整行时调用（Excel 模式下输入框不再真实失焦）
    tr.__tryCreate = tryCreate;

    for (const f of FIELDS) {
      const inp = tr.querySelector('[data-field="' + f + '"]');
      if (!inp) continue;
      inp.addEventListener('change', () => {
        // 简码 → 节点名称：切到下一格就先回填，不必等整条规则建成后重绘
        if ((f === 'from' || f === 'to') && String(inp.value || '').trim()) {
          const r = parseAccountInput(ctx.getIndex(), inp.value);
          if (r && r.acc) inp.value = r.display;
        }
      });
      // blur 不冒泡，单独挂：有些 WebView 的 focusout.relatedTarget 是 null，
      // 用 activeElement 再判断一次焦点是否还在本行。
      inp.addEventListener('blur', () => {
        setTimeout(() => {
          if (tr.contains(document.activeElement)) return;
          tryCreate();
        }, 0);
      });
    }

    // 只有**离开这一行**才建规则：金额填完点到同行的备注，不算录完。
    // 之前每个格子 change 都 tryCreate，金额一失焦就建行重画，备注还没写就没了。
    tr.addEventListener('focusout', (ev) => {
      const next = ev.relatedTarget;
      if (next && tr.contains(next)) return;
      setTimeout(() => {
        // 有些浏览器（含手机 WebView）relatedTarget 是 null，但焦点其实还在本行：
        // 再按 activeElement 兜一次，避免点到同行备注就被提前建行。
        if (tr.contains(document.activeElement)) return;
        tryCreate();
      }, 0);
    });

    // 新行选择「每天」：日期立刻变横线且只读；切回每月时恢复之前填的几号
    const freqSel = tr.querySelector('[data-field="freq"]');
    const dayInp = tr.querySelector('[data-field="day"]');
    if (freqSel && dayInp) {
      freqSel.addEventListener('change', () => {
        if (freqSel.value === 'daily') {
          dayInp.dataset.prevDay = dayInp.value === '—' ? '' : dayInp.value;
          showDay(tr, 'daily');
        } else if (dayInp.value === '—') {
          showDay(tr, 'monthly', dayInp.dataset.prevDay || '');
          delete dayInp.dataset.prevDay;
        }
      });
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
