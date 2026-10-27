// 界面：查询 tab
/**
 * 查询视图（三段独立查询表 A / B / C）
 * 层：第五层 · UI
 *
 * 三段面板从同一个 <template> 克隆（结构 100% 同构）；
 * 过滤逻辑在 core/query-engine.js（纯函数），本文件只负责界面与事件。
 */

import { filterTransactions, queryTotals } from '../core/query-engine.js';
import { parseDateRange } from '../core/date-query.js';
import { renderRows, renderEmpty } from '../ui/table.js';
import { tpl } from '../ui/render-transactions.js';
import { money, moneyAlways, shortDate } from '../core/format.js';

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
      state.transactions, p.cond, (id) => (ctx.getIndex().byId.get(id) || null),
    );
    const rows = hits.map((t, i) => ({
      seq: i + 1,
      date: shortDate(t.date),
      from: nameOf(t.from_id),
      to: nameOf(t.to_id),
      amount: money(t.amount),
      note: t.note || '',
    }));

    if (!rows.length) renderEmpty(p.body, '没有命中的流水', 6);
    else renderRows(p.body, rows, 'tpl-query-row');

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

function hasCond(c) {
  return !!(c.dateFrom || c.dateTo || c.from || c.to || c.amount || c.note);
}

