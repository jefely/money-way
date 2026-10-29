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

import { tpl, renameBlankDraft } from './render-transactions.js';
import { setCell, moneyOrBlank } from './table.js';
import { openingOf, syncOpeningDates } from '../core/ledger-stats.js';
import { ZONES } from '../core/settings.js';
import { money } from '../core/format.js';
import { toAmount } from '../core/stats.js';
import { addAccount, updateAccount, removeAccount, addTransaction, addNote, updateNote, removeNote, NOTE_TYPES, accountTypesOf } from '../core/state-store.js';
import { accountsOfZone, orderBySeq, nextSeqFor, effectiveSeq, moveWithinType, withUndefinedAccounts } from '../core/account-order.js';
import { bindTypePicker, promptType } from './type-picker.js';
import { zoneCols } from './table-parts.js';
import { normalizeCode, isValidCode, OPENING_ACCOUNT_ID } from '../core/schema.js';
import { balanceOf } from '../core/balance-calculator.js';
import { validate, issuesOf } from '../core/validator.js';
import { renderNotes } from './note-table.js';
import * as NtModal from './modal.js';

const FIELDS = ['type', 'category', 'code', 'name', 'opening', 'seq'];
const TYPES = ['资产类', '负债类', '收入类', '权益类', '费用类'];

/**
 * @param {object} ctx
 * @param {HTMLElement} tbody #nt-accounts-body
 * @param {{onSummary?:(text:string)=>void}} [opts]
 */
export function mountAccountTable(ctx, tbody, opts) {
  const o = opts || {};

  function render() {
    let state = ctx.getState();
    // 自动扫描：流水里引用了、设置表里没有的账户 → 补一个「未分类账户」行
    // （类型/分类留空，归到 U 区；流水是主表，这里只是给它一个可编辑的壳）
    const filled = withUndefinedAccounts(state);
    if (filled !== state) { ctx.setState(filled); state = filled; ctx.saveNow(); }
    const visible = (state.accounts || []).filter((a) => a && !a.isHidden);

    // 简码校验（V7）：**缺简码不标**（用户 2026-10-30：简码只是高频录入的快捷键，
    // 空着不影响统计）；只有重复 / 长度字符不合法才标出来。
    const badCodes = new Map();
    for (const it of issuesOf(validate({ accounts: visible }), 'V7')) {
      if (String(it.message || '').indexOf('缺少简码') >= 0) continue;
      const id = it.ref && it.ref.accountId;
      if (id) badCodes.set(id, it.message);
    }

    // 重复简码两边都要标红：validator 只把「后出现」的那个报成 issue，
    // 但用户看到一对其中的一个变红，会以为另一个没问题（2026-10-29）。
    const codeGroups = new Map();
    for (const a of visible) {
      const c = normalizeCode(a.code);
      if (!c) continue;
      if (!codeGroups.has(c)) codeGroups.set(c, []);
      codeGroups.get(c).push(a);
    }
    for (const [code, list] of codeGroups) {
      if (list.length < 2) continue;
      const names = list.map((a) => a.name || '(未命名)').join(' / ');
      for (const a of list) badCodes.set(a.id, '简码「' + code + '」重复：' + names);
    }

    tbody.textContent = '';

    const rowTpl = tpl('tpl-account-row');
    const frag = document.createDocumentFragment();
    for (const zone of ZONES) {
      // 分区 + 按序号排序（未知类型默认归 A）；序号允许跳号，见 core/account-order.js
      const inZone = orderBySeq(accountsOfZone(visible, zone.key));
      const zoneList = accountsOfZone(visible, zone.key);
      // 序号每个区域从 1 开始（用户 2026-10-29）
      let zoneSeq = 0;

      // 区域标题行拆成两格（v1.73）：
      //   ① 第 1 格住在**冻结的简码列**里，只放区号 A / B ——
      //      横滚时它跟着首列不动，永远知道自己在哪个区（用户 2026-10-29 指定）；
      //   ② 第 2 格吃剩下的 9 列，放长标题和极性说明。
      // 64px 只够一个区号，所以长标题不能塞进第 1 格 ——
      // 拆开之前整行是 colspan=10，跨列格不能 sticky（TABLE-INTERACTION §5.7），
      // 一横滚标题就整行滑走。
      {
        const head = document.createElement('tr');
        head.className = 'nt-zone-head ' + (zone.key === 'A' ? 'nt-zone-a' : zone.key === 'B' ? 'nt-zone-b' : 'nt-zone-u');

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
        // 列标行放在区域标题上方；第一个区域（A）直接沿用顶部冻结的 thead，不再重复画
        if (zone.key !== 'A') frag.appendChild(zoneCols());
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
      }

      for (const acc of inZone) {
        if (!rowTpl) break;
        const tr = rowTpl.cloneNode(true);
        tr.dataset.id = acc.id;

        zoneSeq += 1;
        // 斑马纹按**数据行序号**打类：区域标题行（A/B）不参与序号，
        // 用 nth-child 会被标题行挤得隔行错位（用户 2026-10-29 反馈）。
        if (zoneSeq % 2 === 0) tr.classList.add('nt-row-even');
        setCell(tr, 'code', acc.code || '');
        setCell(tr, 'seq', effectiveSeq(acc, zoneSeq));

        // 简码有问题 → 输入框标红（title 里写原因：缺失 / 不合法 / 和谁重复）
        if (badCodes.has(acc.id)) {
          const codeInput = tr.querySelector('[data-field="code"]');
          if (codeInput) {
            codeInput.classList.add('nt-code-bad');
            codeInput.title = badCodes.get(acc.id);
            // 空格子没有字可标红，用占位符把「缺简码」直接写在格子里
            // 简码是可选的高频录入快捷键：没有就不写占位提示（用户 2026-10-30）
          }
        }

        const typeInput = tr.querySelector('[data-field="type"]');
        if (typeInput) {
          typeInput.value = acc.type || '';
          // 点击弹候选，选「其他…」再弹输入框（用户 2026-10-30：原生下拉坏掉）
          bindTypePicker(typeInput, () => accountTypesOf(state), (v) => {
            if (v === '__custom__') {
              promptType((t) => applyEdit(acc.id, 'type', t));
              return;
            }
            applyEdit(acc.id, 'type', v);
          });
        }
        setCell(tr, 'category', acc.category || '');
        setCell(tr, 'name', acc.name || '');
        setCell(tr, 'opening', moneyOrBlank(openingOf(state, acc.id)));
        setCell(tr, 'billDay', acc.billDay || '');
        setCell(tr, 'repayDay', acc.repayDay || '');

        bindRow(tr, acc.id);
        frag.appendChild(tr);
      }

      // 每个区域各自一个新增行（用户 2026-10-29）：整行留空，序号/类型都可手填
      const newTpl = tpl('tpl-account-new');
      if (newTpl) {
        const tr = newTpl.cloneNode(true);
        frag.appendChild(tr);
        bindNewRow(tr, zone);
      }
    }

    /* ---------- 备注区：独立于 A/B，仅统计分类 + 备注栏快速输入 ---------- */
    frag.appendChild(renderNotes(ctx, render));

    tbody.appendChild(frag);

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
        const nm = acc ? acc.name : '';
        // 流水是主表：设置表删账户只影响「账户怎么归类」，不许动流水（用户 2026-10-30）
        const ok = confirm('从设置表移除「' + nm + '」？\n\n'
          + '流水不会被删除；引用它的流水会显示为空账户（校验里会提示断链）。');
        if (!ok) return;
        ctx.setState(removeAccount(ctx.getState(), id));
        ctx.saveNow();
        render();
        ctx.setFooter('已移除账户（流水保留）');
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
    const r = moveWithinType(st.accounts, id);
    if (!r.moved) {
      ctx.setFooter('已经是这一类的第一个了');
      return;
    }
    ctx.setState({ ...st, accounts: r.accounts });
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
      // 类型可以手填，也可以点格子弹候选（见 bindTypePicker）
      const t = String(v || '').trim();
      if (!t) { render(); return; }
      patch.type = t;
    } else if (field === 'seq') {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0) { render(); return; }
      patch.seq = n;
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
      // 空行草稿里写着旧名字的话跟着改 —— 否则那行一切回流水就会按旧名
      // 重新建一个账户，看起来就是「改名没生效、旧名字又回来了」（用户 2026-10-30）
      patch.name = v; renameBlankDraft(acc.name, v);
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
    // 期初日期统一对齐到「最早流水前一天 23:59:59」（用户 2026-10-30）
    ctx.setState(syncOpeningDates(s));
  }

  function bindNewRow(tr, zone) {
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

      // 类型：选「其他…」弹输入框（新类型会进类型库）；空则按资产类
      // 类型：空则按资产类；新类型会进类型库
      const type = get('type') || '资产类';
      const code = normalizeCode(get('code'));
      if (code && !isValidCode(code)) return;
      if (code && (st.accounts || []).some((a) => normalizeCode(a.code) === code)) return;

      // 序号可以跳着填（如 63 → 100）；不填就「本区最大序号 + 1」
      const zoneAccounts = accountsOfZone(st.accounts, zone.key);
      const typed = parseInt(get('seq'), 10);
      const seq = Number.isFinite(typed) && typed > 0 ? typed : nextSeqFor(zoneAccounts);

      created = true;
      let s = addAccount(st, {
        name,
        type,
        category: get('category') || '未分类',
        code: code || undefined,
        seq,
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

    const typeInput = tr.querySelector('[data-field="type"]');
    if (typeInput) {
      bindTypePicker(typeInput, () => accountTypesOf(ctx.getState()), (v) => {
        if (v === '__custom__') {
          promptType((t) => { typeInput.value = t; setTimeout(tryCreate, 0); });
          return;
        }
        typeInput.value = v;
        setTimeout(tryCreate, 0);
      });
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

