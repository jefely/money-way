// 界面：查询 tab
/**
 * 查询视图（三段独立查询表 A / B / C）
 * 层：第五层 · UI
 *
 * 三段面板从同一个 <template> 克隆（结构 100% 同构）；
 * 过滤逻辑在 core/query-engine.js（纯函数），本文件只负责界面与事件。
 */

import { filterTransactions, queryTotals, exactAccount } from '../core/query-engine.js';
import { parseDateRange } from '../core/date-query.js';
import { renderRows, renderEmpty } from '../ui/table.js';
import { tpl } from '../ui/render-transactions.js';
import { money, moneyAlways, shortDate } from '../core/format.js';
import { markerOf } from '../core/draft-book.js';

const NAMES = ['A', 'B', 'C'];

export function mountQuery(section, ctx) {
  const grid = section.querySelector('#nt-query-grid');
  grid.textContent = '';

  const panels = NAMES.map((name) => buildPanel(grid, name));

  function buildPanel(host, name) {
    const node = tpl('tpl-query-panel').cloneNode(true);
    node.querySelector('.nt-query-title').textContent = `流水查询 ${name}`;

    const cond = { dateFrom: '', dateTo: '', from: '', to: '', amount: '', note: '' };
    const body = node.querySelector('[data-body]');
    const totalEl = node.querySelector('[data-total]');
    const inputs = node.querySelectorAll('[data-cond]');
    const p = { name, cond, body, totalEl };

    for (const input of inputs) {
      input.addEventListener('input', () => {
        const key = input.getAttribute('data-cond');
        if (key === 'dateRange') {
          // 一个框填「起~止」或单日/整月/整年，拆成两个 ISO 边界（core/date-query）
          const r = parseDateRange(input.value);
          cond.dateFrom = r ? r.from : '';
          cond.dateTo = r ? r.to : '';
        } else {
          // 转出 / 转入：简码打完就直接换成节点名字。
          // 只认**精确**命中（名字全等或简码全等），片段匹配会把「招」
          // 一路补成「招行储」，之后再做模糊搜索就没法打字了。
          if (key === 'from' || key === 'to') fillAccountName(input, ctx);
          cond[key] = input.value;
        }
        render();
      });
    }

    node.querySelector('[data-act="clear"]').addEventListener('click', () => {
      for (const k of Object.keys(cond)) cond[k] = '';
      for (const input of inputs) input.value = '';
      render();
    });


    host.appendChild(node);
    return p;
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
 * 转出框里打完简码 → 直接显示节点名字（用户 2026-11）。
 *
 * 只在**精确**命中时替换：名字全等或简码全等。这样「ZHC」会变成「招行储」，
 * 而「招」保持原样继续做模糊匹配 —— 否则每打一个字就被补全，没法搜。
 */
function fillAccountName(input, ctx) {
  const acc = exactAccount(ctx.getState().accounts, input.value);
  if (!acc) return;
  const name = String(acc.name || '');
  if (!name || name === input.value) return;
  input.value = name;
  // 程序赋值不会触发 input，光标也不会自动跟到末尾，这里补一下
  try { input.setSelectionRange(name.length, name.length); } catch (e) { /* 忽略 */ }
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

  let same = from === to;
  if (!same) {
    const a = exactAccount(state.accounts, from);
    const b = exactAccount(state.accounts, to);
    same = !!(a && b && a.id === b.id);
  }
  if (!same) return cond;
  return { ...cond, from: '', to: '', node: from };
}

function hasCond(c) {
  return !!(c.dateFrom || c.dateTo || c.from || c.to || c.amount || c.note);
}

