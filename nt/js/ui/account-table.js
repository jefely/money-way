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
import { openingOf } from '../core/ledger-stats.js';
import { buildStatMap, fillStatCells } from './account-stats-view.js';
import { ZONES } from '../core/settings.js';
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

    const statMap = buildStatMap(visible, state);

    const rowTpl = tpl('tpl-account-row');
    const frag = document.createDocumentFragment();
    let seq = 0;

    for (const zone of ZONES) {
      const inZone = visible.filter((a) => zone.types.indexOf(a.type) >= 0);

      // 区域标题：跨整行，左边区域名、右边极性说明
      // （原来克隆 group 模板塞在类型列里，会被列宽截断成「A 我的资...」）
      {
        const head = document.createElement('tr');
        head.className = 'nt-zone-head ' + (zone.key === 'A' ? 'nt-zone-a' : 'nt-zone-b');

        const td = document.createElement('td');
        td.className = 'nt-cell nt-zone-cell';
        td.colSpan = 7;

        // flex 必须放在内层 div 上：直接设在 <td> 上会让它脱离表格布局，
        // colspan 就不生效了（标题会被压成第一列的宽度）。
        const inner = document.createElement('div');
        inner.className = 'nt-zone-label';

        const name = document.createElement('b');
        name.textContent = zone.label;

        const hint = document.createElement('span');
        hint.className = 'nt-zone-hint';
        hint.textContent = zone.hint;

        inner.appendChild(name);
        inner.appendChild(hint);
        td.appendChild(inner);
        head.appendChild(td);
        frag.appendChild(head);
      }

      if (!inZone.length) {
        const tr = document.createElement('tr');
        tr.className = 'nt-row nt-zone-empty';
        const td = document.createElement('td');
        td.className = 'nt-cell';
        td.colSpan = 7;
        td.textContent = '（这一类还没有账户）';
        tr.appendChild(td);
        frag.appendChild(tr);
        continue;
      }

      for (const acc of inZone) {
        if (!rowTpl) break;
        const tr = rowTpl.cloneNode(true);
        tr.dataset.id = acc.id;

        seq += 1;
        setCell(tr, 'seq', seq);
        setCell(tr, 'code', acc.code || '');
        setCell(tr, 'name', acc.name || '');
        setCell(tr, 'opening', moneyOrBlank(openingOf(state, acc.id)));

        fillStatCells(tr, statMap.get(acc.id));

        const sel = tr.querySelector('[data-field="type"]');
        if (sel) sel.value = TYPES.includes(acc.type) ? acc.type : '资产类';
        setCell(tr, 'category', acc.category || '');
        setCell(tr, 'billDay', acc.billDay || '');
        setCell(tr, 'repayDay', acc.repayDay || '');

        bindRow(tr, acc.id);
        frag.appendChild(tr);
      }
    }

    tbody.appendChild(frag);

    // 末尾空行：新建账户
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

/** 期初：实现在 core，这里转出以保持既有调用点不变 */
export { openingOf } from '../core/ledger-stats.js';

