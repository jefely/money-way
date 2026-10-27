// 界面：账户表（表格内直接编辑）
/**
 * 账户表
 * 层：第五层 · UI
 *
 * 每格都是输入框/下拉：类型、分类、简码、名称、期初都能直接改。
 * 末尾空行：填了名称就成一个新账户。
 *
 * 期初不进账户字段 —— 它在 v2 结构里是一条 opening 流水，
 * 所以改期初 = 换掉那条流水（这里只做这一件事，不算钱）。
 */

import { tpl } from './render-transactions.js';
import { setCell, moneyOrBlank } from './table.js';
import { money } from '../core/format.js';
import { toAmount } from '../core/stats.js';
import { addAccount, updateAccount, removeAccount, addTransaction } from '../core/state-store.js';
import { normalizeCode, isValidCode, OPENING_ACCOUNT_ID } from '../core/schema.js';
import { balanceOf } from '../core/balance-calculator.js';

const FIELDS = ['type', 'category', 'code', 'name', 'opening'];
const TYPES = ['资产类', '负债类', '收入类', '权益类', '费用类'];

/**
 * @param {object} ctx
 * @param {HTMLElement} tbody #nt-accounts-body
 * @param {{onSummary?:(text:string)=>void}} [opts]
 */
export function mountAccountTable(ctx, tbody, opts) {
  const o = opts || {};

  function render() {
    const state = ctx.getState();
    const visible = (state.accounts || []).filter((a) => a && !a.isHidden);

    tbody.textContent = '';

    const rowTpl = tpl('tpl-account-row');
    if (rowTpl && visible.length) {
      const frag = document.createDocumentFragment();
      visible.forEach((acc, i) => {
        const tr = rowTpl.cloneNode(true);
        tr.dataset.id = acc.id;

        setCell(tr, 'seq', i + 1);
        const sel = tr.querySelector('[data-field="type"]');
        if (sel) sel.value = TYPES.includes(acc.type) ? acc.type : '资产类';
        setCell(tr, 'category', acc.category || '');
        setCell(tr, 'code', acc.code || '');
        setCell(tr, 'name', acc.name || '');
        setCell(tr, 'opening', moneyOrBlank(openingOf(state, acc.id)));

        bindRow(tr, acc.id);
        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
    }

    const newTpl = tpl('tpl-account-new');
    if (newTpl) {
      const tr = newTpl.cloneNode(true);
      tbody.appendChild(tr);
      bindNewRow(tr);
    }

    summarize(visible, state);
  }

  function bindRow(tr, id) {
    const del = tr.querySelector('[data-act="del"]');
    if (del) {
      del.addEventListener('click', () => {
        const acc = ctx.getIndex().byId.get(id);
        if (!confirm('删除「' + (acc ? acc.name : '') + '」？它的流水会一起删掉。')) return;
        ctx.setState(removeAccount(ctx.getState(), id));
        ctx.saveNow();
        render();
        ctx.setFooter('已删除账户');
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
    const acc = (st.accounts || []).find((a) => a.id === id);
    if (!acc) return;

    const v = String(raw || '').trim();

    if (field === 'opening') {
      setOpening(id, toAmount(v));
      ctx.saveNow();
      render();
      return;
    }

    const patch = {};
    if (field === 'type') {
      if (!TYPES.includes(v)) { render(); return; }
      patch.type = v;
    } else if (field === 'category') {
      patch.category = v;
    } else if (field === 'code') {
      const code = normalizeCode(v);
      // 简码要合法且不与他人重复，否则还原（冲突会毁掉按简码查找）
      if (code && !isValidCode(code)) { render(); return; }
      const dup = (st.accounts || []).some((a) => a.id !== id && normalizeCode(a.code) === code);
      if (code && dup) { render(); return; }
      patch.code = code;
    } else if (field === 'name') {
      if (!v) { render(); return; }
      patch.name = v;
    } else {
      return;
    }

    ctx.setState(updateAccount(st, id, patch));
    ctx.saveNow();
    render();
  }

  /** 期初：改那条 opening 流水（没有就建一条） */
  function setOpening(id, amount) {
    const st = ctx.getState();
    let txs = (st.transactions || []).filter((t) => !(t.opening && t.to_id === id));
    let s = { ...st, transactions: txs };

    if (amount > 0) {
      s = addTransaction(s, {
        date: '2000-01-01',
        from_id: OPENING_ACCOUNT_ID,
        to_id: id,
        amount,
        note: '期初',
        opening: true,
        seq: 0,
      });
    }
    ctx.setState(s);
  }

  function bindNewRow(tr) {
    let created = false;
    const tryCreate = () => {
      if (created || !tr.isConnected) return;

      const get = (f) => {
        const el = tr.querySelector('[data-field="' + f + '"]');
        return el ? String(el.value || '').trim() : '';
      };

      const name = get('name');
      if (!name) return;

      const st = ctx.getState();
      if ((st.accounts || []).some((a) => a.name === name)) {
        // 重名不允许：账本里账户靠名字互相对上
        return;
      }

      const type = get('type') || '资产类';
      const code = normalizeCode(get('code'));
      if (code && !isValidCode(code)) return;
      if (code && (st.accounts || []).some((a) => normalizeCode(a.code) === code)) return;

      created = true;
      let s = addAccount(st, {
        name,
        type: TYPES.includes(type) ? type : '资产类',
        category: get('category') || '未分类',
        code: code || undefined,
      });
      ctx.setState(s);

      const opening = toAmount(get('opening'));
      if (opening > 0) {
        const added = s.accounts[s.accounts.length - 1];
        s = addTransaction(s, {
          date: '2000-01-01',
          from_id: OPENING_ACCOUNT_ID,
          to_id: added.id,
          amount: opening,
          note: '期初',
          opening: true,
          seq: 0,
        });
        ctx.setState(s);
      }

      ctx.saveNow();
      render();
      ctx.setFooter('已新增账户');
    };

    for (const f of FIELDS) {
      const inp = tr.querySelector('[data-field="' + f + '"]');
      if (!inp) continue;
      // 延迟到本轮结束：一行里连填几格时，后面的不能落在已脱离 DOM 的旧行上
      inp.addEventListener('change', () => { setTimeout(tryCreate, 0); });
    }
  }

  function summarize(visible, state) {
    let total = 0;
    const byType = {};
    for (const acc of visible) {
      const b = balanceOf(acc, state.transactions).balance;
      total += b;
      byType[acc.type] = (byType[acc.type] || 0) + b;
    }
    const text = `共 ${visible.length} 个账户 · 资产 ${money(byType['资产类'] || 0)} · 负债 ${money(byType['负债类'] || 0)}`;
    if (o.onSummary) o.onSummary(text);
    ctx.setFooter(`${visible.length} 个账户 · ${(state.transactions || []).length} 笔流水`);
  }

  return { render };
}

/** 某个账户的期初（opening 流水金额） */
export function openingOf(state, id) {
  let sum = 0;
  for (const t of state.transactions || []) {
    if (t.opening && t.to_id === id) sum += Number(t.amount) || 0;
  }
  return sum;
}
