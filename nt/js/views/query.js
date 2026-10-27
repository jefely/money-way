// 界面：查询 tab
/**
 * 查询视图（三段独立查询表 A / B / C）
 * 层：第五层 · UI
 *
 * 三段面板从同一个 <template> 克隆（结构 100% 同构）；
 * 过滤逻辑在 core/query-engine.js（纯函数），本文件只负责界面与事件。
 */

import { filterTransactions, queryTotals } from '../core/query-engine.js';
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
          // 一个框填「起~止」，拆成两个条件，core 那边不用改
          const { from, to } = splitRange(input.value);
          cond.dateFrom = from;
          cond.dateTo = to;
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
      renderEmpty(p.body, '设置上方任一条件后显示结果', 7);
      p.totalEl.textContent = moneyAlways(0);
      return { count: 0, sum: 0 };
    }

    const hits = filterTransactions(state.transactions, p.cond, nameOf);
    const rows = hits.map((t, i) => ({
      seq: i + 1,
      freq: freqOf(t),
      date: shortDate(t.date),
      from: nameOf(t.from_id),
      to: nameOf(t.to_id),
      amount: money(t.amount),
      note: t.note || '',
    }));

    if (!rows.length) renderEmpty(p.body, '没有命中的流水', 7);
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

  /** 频率：普通流水没有（留空）；固定收支是「月/周/日」，分期是「分期」 */
  function freqOf(t) {
    if (t.installmentId) return '分期';
    if (t.freq) return t.freq;
    if (t.isFixed) return '固定';
    return '';
  }

  function nameOf(id) {
    const a = ctx.getIndex().byId.get(id);
    return a ? a.name : '';
  }

  return { render };
}

function hasCond(c) {
  return !!(c.dateFrom || c.dateTo || c.from || c.to || c.amount || c.note);
}

/**
 * 「起~止」拆成两个日期。
 *
 * 认这些写法：
 *   2026-08-01~2026-08-31
 *   2026-08-01 2026-08-31
 *   20260801~20260831
 * 只填一边也可以：~2026-08-31 / 2026-08-01~
 */
function splitRange(text) {
  const s = String(text || '').trim();
  if (!s) return { from: '', to: '' };

  // 优先按 ~ / ～ / 空格 / 逗号切
  const m = s.split(/[~～\s,，]+/).filter(Boolean);
  if (m.length >= 2) return { from: m[0], to: m[1] };
  if (m.length === 1) {
    // 只有一段：如果以 ~ 开头就是「只给止」，结尾是 ~ 就是「只给起」
    if (/^[~～]/.test(s)) return { from: '', to: m[0] };
    return { from: m[0], to: '' };
  }
  return { from: '', to: '' };
}
