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

    const rowTpl = tpl('tpl-account-row');
    const frag = document.createDocumentFragment();
    let seq = 0;

    for (const zone of ZONES) {
      const inZone = visible.filter((a) => zone.types.indexOf(a.type) >= 0);

      // 区域标题行拆成两格（v1.73）：
      //   ① 第 1 格住在**冻结的简码列**里，只放区号 A / B ——
      //      横滚时它跟着首列不动，永远知道自己在哪个区（用户 2026-10-29 指定）；
      //   ② 第 2 格吃剩下的 9 列，放长标题和极性说明。
      // 64px 只够一个区号，所以长标题不能塞进第 1 格 ——
      // 拆开之前整行是 colspan=10，跨列格不能 sticky（TABLE-INTERACTION §5.7），
      // 一横滚标题就整行滑走。
      {
        const head = document.createElement('tr');
        head.className = 'nt-zone-head ' + (zone.key === 'A' ? 'nt-zone-a' : 'nt-zone-b');

        const tag = document.createElement('td');
        tag.className = 'nt-cell nt-zone-cell nt-zone-tag';
        tag.textContent = zone.key;

        const td = document.createElement('td');
        td.className = 'nt-cell nt-zone-cell';
        td.colSpan = 9;

        // flex 必须放在内层 div 上：直接设在 <td> 上会让它脱离表格布局，
        // colspan 就不生效了（标题会被压成第一列的宽度）。
        const inner = document.createElement('div');
        inner.className = 'nt-zone-label';

        const name = document.createElement('b');
        // 「A 我的资产/日常支出」→「我的资产/日常支出」：区号已经在第 1 格里了
        name.textContent = zone.label.replace(new RegExp('^' + zone.key + '\\s*'), '');

        const hint = document.createElement('span');
        hint.className = 'nt-zone-hint';
        hint.textContent = zone.hint;

        inner.appendChild(name);
        inner.appendChild(hint);
        td.appendChild(inner);
        head.appendChild(tag);
        head.appendChild(td);
        frag.appendChild(head);
      }

      if (!inZone.length) {
        const tr = document.createElement('tr');
        tr.className = 'nt-row nt-zone-empty';
        const td = document.createElement('td');
        td.className = 'nt-cell';
        td.colSpan = 10;
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
        // 斑马纹按**数据行序号**打类：区域标题行（A/B）不参与序号，
        // 用 nth-child 会被标题行挤得隔行错位（用户 2026-10-29 反馈）。
        if (seq % 2 === 0) tr.classList.add('nt-row-even');
        setCell(tr, 'code', acc.code || '');
        setCell(tr, 'seq', seq);

        const sel = tr.querySelector('[data-field="type"]');
        if (sel) sel.value = TYPES.includes(acc.type) ? acc.type : '资产类';
        setCell(tr, 'category', acc.category || '');
        setCell(tr, 'name', acc.name || '');
        setCell(tr, 'opening', moneyOrBlank(openingOf(state, acc.id)));
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
    const up = tr.querySelector('[data-act="up"]');
    if (up) {
      up.addEventListener('click', () => moveUp(id));
    }

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

  /**
   * 上移：与**同一类型**里的前一个账户换位置。
   *
   * 为什么限制在同一类型内：表格按类型分区渲染（ZONES 的 A/B 区），
   * 跨类型调换在界面上根本看不出来 —— 用户点「上移」却什么都没变，只会以为坏了。
   */
  function moveUp(id) {
    const st = ctx.getState();
    const list = (st.accounts || []).slice();
    const i = list.findIndex((a) => a && a.id === id);
    if (i < 0) return;

    const acc = list[i];
    let j = -1;
    for (let k = i - 1; k >= 0; k -= 1) {
      if (list[k] && list[k].type === acc.type) { j = k; break; }
    }
    if (j < 0) {
      ctx.setFooter('已经是这一类的第一个了');
      return;
    }

    list[i] = list[j];
    list[j] = acc;
    ctx.setState({ ...st, accounts: list });
    ctx.saveNow();
    render();
    ctx.setFooter('已上移');
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

