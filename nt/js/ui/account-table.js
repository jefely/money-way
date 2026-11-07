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
import { openingOf } from '../core/ledger-stats.js';
import { ZONES } from '../core/settings.js';
import { money } from '../core/format.js';
import { toAmount } from '../core/stats.js';
import { updateAccount, removeAccount, addNote, updateNote, removeNote, NOTE_TYPES, accountTypesOf } from '../core/state-store.js';
import { accountsOfZone, orderBySeq, effectiveSeq, moveWithinType, withUndefinedAccounts } from '../core/account-order.js';
import { bindTypePicker, promptType } from './type-picker.js';
import { zoneHead } from './table-parts.js';
import { normalizeCode, isValidCode } from '../core/schema.js';
import { balanceOf } from '../core/balance-calculator.js';
import { renderNotes } from './note-table.js';
import * as NtModal from './modal.js';
import { bindReviewTips } from './review-tip.js';
import { setOpening, bindNewRow } from './account-new.js';

const FIELDS = ['type', 'category', 'code', 'name', 'opening', 'seq'];
const TYPES = ['资产类', '成本类', '负债类', '收入类', '权益类', '费用类'];

/**
 * 六类的「短名」←→ 全名。类型格显示 `[资产]`、存回 `资产类`（用户 2026-11）：
 * 表头已经写着「类型」，每格再带个「类」字既重复又占宽度。
 */
const SHORT_OF_TYPE = {
  资产类: '资产', 负债类: '负债', 权益类: '权益',
  收入类: '收入', 费用类: '费用', 成本类: '成本',
};
const FULL_OF_SHORT = Object.fromEntries(
  Object.entries(SHORT_OF_TYPE).map(([full, short]) => [short, full]),
);

/** 账本里的类型 → 格子里显示的文字：`资产类` → `[资产]`；自定义类型原样加括号 */
export function typeLabel(type) {
  const t = String(type || '').trim();
  if (!t) return '';
  return '[' + (SHORT_OF_TYPE[t] || t) + ']';
}

/**
 * 格子里的文字 → 账本里的类型：`[资产]` → `资产类`。
 * 只认六类的短名；自定义类型原样返回（不加「类」，否则「客户」会变成「客户类」）。
 */
export function typeValue(text) {
  const s = String(text || '').trim()
    .replace(/^[\[【]\s*/, '')
    .replace(/\s*[\]】]$/, '')
    .trim();
  if (!s) return '';
  return FULL_OF_SHORT[s] || s;
}
const BLANK_ROWS = 10;

// 切到后台/关闭前，把正在编辑的简码用 blur 提交掉。
// 手机键盘收起不一定触发 change；直接锁屏/切应用时，未失焦的输入会丢。
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    const ae = document.activeElement;
    if (ae && ae.matches && ae.matches('input[data-field="code"]')) ae.blur();
  });
}

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

    // 简码校验：缺简码不标（简码只是高频录入的快捷键，空着不影响统计）；
    // 长度/字符不合法标亮红；**重复允许**（用户 2026-11 决定），两边标暗红。
    const badCodes = new Map();
    for (const a of visible) {
      const c = normalizeCode(a.code);
      if (c && !isValidCode(c)) badCodes.set(a.id, '简码「' + c + '」要 1–5 位，空格不算');
    }

    // 重复组：两边都标，title 写明「被谁占用」。
    // 用**全部**账户分组（含隐藏的期初账户）：隐藏节点撞了码，可见的那一行也要标。
    const codeGroups = new Map();
    for (const a of state.accounts || []) {
      if (!a) continue;
      const c = normalizeCode(a.code);
      if (!c) continue;
      if (!codeGroups.has(c)) codeGroups.set(c, []);
      codeGroups.get(c).push(a);
    }
    const dupCodes = new Map();
    for (const [code, list] of codeGroups) {
      if (list.length < 2) continue;
      for (const a of list) {
        const others = list
          .filter((x) => x.id !== a.id)
          .map((x) => x.name || '(未命名)')
          .join(' / ');
        dupCodes.set(a.id, '简码「' + code + '」已被「' + others + '」使用（允许重复）');
      }
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

      // 不再给每个区域重复列标题（用户 2026-11）：顶部那份冻结表头就够了，
      // 每个 A/B/U 区再插一行「简码 | 序 | …」只是把列表割得更碎。
      frag.appendChild(zoneHead(zone));

      // 空区域不再插一行「（这一类还没有节点）」—— 区域标题本身已经说明了情况，
      // 多一行灰字反而把列表割碎（用户 2026-11）。

      for (const acc of inZone) {
        if (!rowTpl) break;
        const tr = rowTpl.cloneNode(true);
        tr.dataset.id = acc.id;

        zoneSeq += 1;
        // 斑马纹按**数据行序号**打类：区域标题行（A/B）不参与序号，
        // 用 nth-child 会被标题行挤得隔行错位（用户 2026-10-29 反馈）。
        tr.classList.add(...[zoneSeq % 2 === 0 && 'nt-row-even', acc.fresh && 'nt-acc-fresh'].filter(Boolean));
        setCell(tr, 'code', acc.code || '');
        setCell(tr, 'seq', effectiveSeq(acc, zoneSeq));
        if (acc.fresh) {
          const seqCell = tr.querySelector('.nt-cell-seq');
          if (seqCell) {
            seqCell.classList.add('nt-seq-review');
            seqCell.title = '新增，请核查';
          }
        }

        // 简码：不合法 → 亮红；重复 → 暗红（允许，只提示被谁占用）
        const codeInput = tr.querySelector('[data-field="code"]');
        if (codeInput) {
          if (badCodes.has(acc.id)) {
            codeInput.classList.add('nt-code-bad');
            codeInput.title = badCodes.get(acc.id);
          } else if (dupCodes.has(acc.id)) {
            codeInput.classList.add('nt-code-dup');
            codeInput.title = dupCodes.get(acc.id);
          }
        }

        const typeInput = tr.querySelector('[data-field="type"]');
        if (typeInput) {
          // 显示成 `[资产]`（半角方括号、去掉「类」）—— 表头已经写着「类型」，
          // 每个格子再带个「类」字既重复又占宽度（用户 2026-11）。
          typeInput.value = typeLabel(acc.type);
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

        bindRow(tr, acc.id);
        frag.appendChild(tr);
      }
    }

    // 最下面固定 10 个空行：批量加节点时不用等每次重画（用户 2026-11）。
    // 它们不绑定某个区，建行时按填写的类型决定归 A / B / U。
    const newTpl = tpl('tpl-account-new');
    if (newTpl) {
      for (let k = 0; k < BLANK_ROWS; k += 1) {
        const tr = newTpl.cloneNode(true);
        frag.appendChild(tr);
        bindNewRow(ctx, tr, null, render);
      }
    }

    /* ---------- 备注区：独立于 A/B，仅统计分类 + 备注栏快速输入 ---------- */
    frag.appendChild(renderNotes(ctx, render));

    tbody.appendChild(frag);
    bindReviewTips(tbody);

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
        // 直接删，不再弹原生 confirm（用户 2026-11）：删除账户可全局撤销，
        // 多一次确认只是多一次点击。流水仍然保留，断链由校验提示。
        ctx.setState(removeAccount(ctx.getState(), id));
        ctx.saveNow();
        render();
        ctx.setFooter('已移除「' + nm + '」（流水保留，可撤销）');
      });
    }

    for (const f of FIELDS) {
      const inp = tr.querySelector('[data-field="' + f + '"]');
      if (!inp) continue;
      inp.addEventListener('change', () => applyEdit(id, f, inp.value));
      if (f === 'code') {
        // 手机键盘的「完成」若能发 Enter，就主动失焦提交；不依赖用户再点别处。
        inp.setAttribute('enterkeyhint', 'done');
        inp.addEventListener('keydown', (ev) => {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          inp.blur();
        });

        // 停手 800ms 就先静默落库一次（不重画，所以焦点和光标都在）。
        // 手机键盘收起不保证触发 change；直接切应用/锁屏时，没失焦的输入
        // 会跟着页面一起消失 —— 用户看到的就是「简码改了又变回去」。
        let timer = 0;
        inp.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            timer = 0;
            saveCodeQuietly(id, inp.value, inp);
          }, 800);
        });
        inp.addEventListener('blur', () => { clearTimeout(timer); timer = 0; });
      }
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

    // 类型格显示的是 `[资产]`，存回账本时要还原成 `资产类`（用户 2026-11）
    const v = field === 'type' ? typeValue(raw) : String(raw || '').trim();

    if (field === 'opening') {
      setOpening(ctx, id, toAmount(v));
      ctx.saveNow();
      render();
      return;
    }

    const patch = {};
    let dupNames = [];
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
      // 长度/字符不合法仍然拒绝（会破坏输入解析）；**重复允许**（2026-11 用户决定）。
      // 重复时照样保存，只把「被谁占用」写在页脚，并在格子上标暗红。
      if (code && !isValidCode(code)) {
        render();
        ctx.setFooter('简码没改：要 1–5 位，空格不算');
        return;
      }
      patch.code = code;
      dupNames = (st.accounts || [])
        .filter((a) => a.id !== id && normalizeCode(a.code) === code)
        .map((a) => a.name || '未命名');
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
    if (field === 'code') {
      const shown = normalizeCode(v) || '空';
      if (dupNames.length) {
        ctx.setFooter('简码已改为「' + shown + '」· 已被「' + dupNames.join(' / ') + '」使用（允许重复，已标暗红）');
      } else {
        ctx.setFooter('简码已改为「' + shown + '」');
      }
    }
  }

  /**
   * 简码的静默保存：只更新 state + 落盘，不重画。
   *
   * 用于输入停手 800ms 的兜底 —— 页面重画会丢焦点，所以不能走 applyEdit。
   * 长度不合法不落库；**重复允许**：照样落库，并在输入框上先标暗红、页脚提示。
   */
  function saveCodeQuietly(id, raw, inp) {
    const st = ctx.getState();
    const acc = (st.accounts || []).find((a) => a.id === id);
    if (!acc) return;
    const code = normalizeCode(raw);
    if (code && !isValidCode(code)) return;

    const dupNames = (st.accounts || [])
      .filter((a) => a.id !== id && normalizeCode(a.code) === code)
      .map((a) => a.name || '未命名');

    if (normalizeCode(acc.code) !== code) {
      ctx.setState(updateAccount(st, id, { code }));
      ctx.saveNow();
    }

    if (inp) {
      inp.classList.toggle('nt-code-dup', dupNames.length > 0);
      inp.title = dupNames.length
        ? '简码「' + code + '」已被「' + dupNames.join(' / ') + '」使用（允许重复）'
        : '';
    }
    if (dupNames.length) {
      ctx.setFooter('简码「' + code + '」已被「' + dupNames.join(' / ') + '」使用（已保存，允许重复）');
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
    // 成本类只在真的用到时才出现 —— 一个从没建过成本账户的账本，底部不该多一列 ¥0.00
    const text = `共 ${visible.length} 个节点 · 资产 ${money(byType['资产类'] || 0)}${byType['成本类'] ? ` · 成本 ${money(byType['成本类'])}` : ''} · 负债 ${money(byType['负债类'] || 0)}`;
    if (o.onSummary) o.onSummary(text);
    ctx.setFooter(`${visible.length} 个节点 · ${(state.transactions || []).length} 笔流水`);
  }

  return { render };
}

/** 期初：实现在 core，这里转出以保持既有调用点不变 */
export { openingOf } from '../core/ledger-stats.js';

