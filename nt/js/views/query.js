// 界面：查询 tab
/**
 * 查询视图（三段独立查询表 A / B / C）
 * 层：第五层 · UI
 *
 * 三段面板从同一个 <template> 克隆（结构 100% 同构）；
 * 过滤逻辑在 core/query-engine.js（纯函数），本文件只负责界面与事件。
 */

import { filterTransactions, queryTotals, exactAccount, sameAccountQuery } from '../core/query-engine.js';
import { parseDateRange, compactDate, weekOf } from '../core/date-query.js';
import { renderRows, renderEmpty } from '../ui/table.js';
import { tpl } from '../ui/render-transactions.js';
import { money, moneyAlways, shortDate, todayIso } from '../core/format.js';
import { markerOf } from '../core/draft-book.js';

const NAMES = ['A', 'B', 'C'];
/**
 * 三段查询的默认日期（用户 2026-11-07）：
 *   A = 今天、B = 本日所在那周（周一~周日）、C = 本月。
 * 进页面就有结果可看，不用先手打一遍日期。
 */
const DEFAULT_DATES = ['today', 'week', 'month'];

/** 默认日期文本 —— 写法就用筛选框自己的语法（260801 / 260801-260807 / 2608） */
function presetDateText(kind) {
  const iso = todayIso(new Date());
  if (!iso) return '';
  if (kind === 'week') {
    const w = weekOf(iso);
    return w ? compactDate(w.from) + '-' + compactDate(w.to) : compactDate(iso);
  }
  // 整月：4 位 = YYMM，parseDateRange 会展开成当月一号 ~ 当月最后一天
  if (kind === 'month') return iso.slice(2, 4) + iso.slice(5, 7);
  return compactDate(iso);
}

export function mountQuery(section, ctx) {
  const grid = section.querySelector('#nt-query-grid');
  grid.textContent = '';

  const panels = NAMES.map((name, i) => buildPanel(grid, name, DEFAULT_DATES[i]));

  function buildPanel(host, name, dateKind) {
    const node = tpl('tpl-query-panel').cloneNode(true);
    node.querySelector('.nt-query-title').textContent = `流水查询 ${name}`;

    const cond = { dateFrom: '', dateTo: '', from: '', to: '', amount: '', note: '' };
    const body = node.querySelector('[data-body]');
    const totalEl = node.querySelector('[data-total]');
    const inputs = node.querySelectorAll('[data-cond]');
    const dateInput = node.querySelector('[data-cond="dateRange"]');
    // edited = 用户自己动过日期框（清空也算）。动过就不再拿默认值覆盖他。
    const p = { name, dateKind, cond, body, totalEl, dateInput, preset: '', edited: false };

    // 预填默认日期（程序赋值不触发 input，所以 cond 要手动同步）
    applyPreset(p);

    for (const input of inputs) {
      input.addEventListener('input', () => {
        const key = input.getAttribute('data-cond');
        if (key === 'dateRange') {
          // 一个框填「起~止」或单日/整月/整年，拆成两个 ISO 边界（core/date-query）
          p.edited = true;
          const r = parseDateRange(input.value);
          cond.dateFrom = r ? r.from : '';
          cond.dateTo = r ? r.to : '';
        } else if (key === 'from' || key === 'to') {
          // 转出 / 转入**不实时筛**：打简码时每按一个键就重画一次结果，
          // 又闪又慢，而且替不替换取决于打到第几个字符。
          // 这里什么都不做，等回车（或失焦）再提交 —— 见下面的 commitNode。
          return;
        } else {
          cond[key] = input.value;
        }
        render();
      });

      const key = input.getAttribute('data-cond');
      if (key === 'from' || key === 'to') {
        // change 覆盖「失焦且值变过」；Enter 单独接一次，手机上按软键盘的
        // 「搜索/完成」键走的就是 keydown。
        input.addEventListener('change', () => commitNode(input, cond, render, ctx));
        input.addEventListener('keydown', (ev) => {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          commitNode(input, cond, render, ctx);
        });
      }
    }

    node.querySelector('[data-act="clear"]').addEventListener('click', () => {
      for (const k of Object.keys(cond)) cond[k] = '';
      for (const input of inputs) input.value = '';
      // 用户明确清空了：别再拿默认日期盖回来
      p.edited = true;
      render();
    });


    host.appendChild(node);
    return p;
  }

  /**
   * 把「默认日期」写进面板（用户 2026-11-07：A 今天 / B 本周 / C 本月）。
   * 两个入口调它：新建面板时、以及**每次显示查询页时**（见 refreshPresets）——
   * 应用开着过了零点，「今天」要跟着变，不能还停在昨天。
   */
  function applyPreset(p) {
    const next = presetDateText(p.dateKind);
    if (!next) return;
    p.preset = next;
    const r = parseDateRange(next);
    p.cond.dateFrom = r ? r.from : '';
    p.cond.dateTo = r ? r.to : '';
    if (p.dateInput) p.dateInput.value = next;
  }

  /** 用户自己动过日期的面板不碰；其余的按「现在」重算一次 */
  function refreshPresets() {
    for (const p of panels) {
      if (p.edited) continue;
      if (presetDateText(p.dateKind) === p.preset) continue;
      applyPreset(p);
    }
  }

  function renderPanel(p) {
    const state = ctx.getState();

    if (!hasCond(p.cond)) {
      renderEmpty(p.body, '设置上方任一条件后显示结果', 6);
      p.totalEl.textContent = moneyAlways(0);
      return { count: 0, sum: 0 };
    }

    // 传账户对象（不是名字）：这样「转出/转入」框里打简码也能筛到，
    // 与路径页那边用同一份匹配规则（core/query-engine 的 matchAccount）
    const hits = filterTransactions(
      state.transactions, effectiveCond(p.cond, state), (id) => (ctx.getIndex().byId.get(id) || null),
    );
    const rows = hits.map((t, i) => ({
      seq: i + 1,
      date: shortDate(t.date),
      from: nameOf(t.from_id),
      to: nameOf(t.to_id),
      amount: money(t.amount),
      note: t.note || '',
      tone: markerOf(t, state.accounts),
    }));

    if (!rows.length) renderEmpty(p.body, '没有命中的流水', 6);
    else renderRows(p.body, rows, 'tpl-query-row', paintSeq);

    const t = queryTotals(hits);
    p.totalEl.textContent = moneyAlways(t.sum);
    return t;
  }

  function render() {
    // 每次显示（切回本页 / 任何一次重画）都先按「现在」校正默认日期
    refreshPresets();
    const parts = [];
    for (const p of panels) {
      const t = renderPanel(p);
      parts.push(`${p.name}: ${t.count} 笔 ${moneyAlways(t.sum)}`);
    }
    ctx.setFooter(parts.join(' | '));
  }

  /** 频率列已从核对过的表格设计里去掉（流水查询只要 序/日期/转出/转入/金额/备注） */
  function nameOf(id) {
    const a = ctx.getIndex().byId.get(id);
    return a ? a.name : '';
  }

  return { render };
}

function paintSeq(tr, row) {
  if (!row || (row.tone !== 'missing' && row.tone !== 'untyped')) return;
  const seq = tr.querySelector('[data-field="seq"]');
  if (!seq) return;
  const missing = row.tone === 'missing';
  seq.classList.add(missing ? 'nt-seq-missing' : 'nt-seq-untyped');
  seq.title = missing ? '缺转出或转入' : '节点还没定类型';
}

/**
 * 转出 / 转入框「提交」：先尝试把简码换成节点名字，再筛一次。
 *
 * 只在**精确**命中时替换（名字全等或简码全等）：打「招」不会被补成「招行储」，
 * 否则之后就没法再用短词做模糊搜索了。
 */
function commitNode(input, cond, render, ctx) {
  const key = input.getAttribute('data-cond');
  const acc = exactAccount(ctx.getState().accounts, input.value);
  if (acc) {
    const name = String(acc.name || '');
    if (name && name !== input.value) {
      input.value = name;
      // 程序赋值不会触发 input，光标也不会自动跟到末尾，这里补一下
      try { input.setSelectionRange(name.length, name.length); } catch (e) { /* 忽略 */ }
    }
  }
  cond[key] = input.value;
  render();
}

/**
 * 转出、转入填了**同一个节点** → 改成「该节点作为转出方或转入方」。
 *
 * 两栏都填同一个名字时，按「与」去筛永远是 0 行（一笔流水不可能自己转给自己），
 * 而那正是用户想看的「这个节点的转出 + 转入」。写法不同但指向同一账户
 * （一个打名字一个打简码）也算同一个节点。
 */
function effectiveCond(cond, state) {
  const from = String(cond.from || '').trim();
  const to = String(cond.to || '').trim();
  if (!from || !to) return cond;
  if (!sameAccountQuery(state.accounts, from, to)) return cond;
  return { ...cond, from: '', to: '', node: from };
}

function hasCond(c) {
  return !!(c.dateFrom || c.dateTo || c.from || c.to || c.amount || c.note);
}

