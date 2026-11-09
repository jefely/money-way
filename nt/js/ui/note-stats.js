// 界面：备注统计（两个小表：备注分类 / 备注；表头沿用节点统计表的四列余额口径）
/**
 * 备注统计（UI 层）
 * 层：第五层 · UI
 *
 * 用户 2026-11-09：
 *   · 上表「备注分类」：分类 / 期初余额 / 本期流入 / 本期流出 / 期末余额；
 *   · 下表「备注」：关键字 / 期初余额 / 本期流入 / 本期流出 / 期末余额；
 *   · 样式沿用统计页的节点统计表（四列金额，statAmount 一位小数、无 ￥）；
 *   · 日期筛选沿用统计页的 区间/年份/月份（range 传进来）。
 */

import * as NtModal from './modal.js';
import { noteBalances, rollupBalancesByType } from '../core/note-stats.js';
import { statAmount } from '../core/format.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/** 金额格：0 加 nt-cell-zero（和节点统计表一样暗显） */
function amtCell(n) {
  const td = el('td', 'nt-cell nt-cell-num' + (Math.abs(Number(n) || 0) < 0.05 ? ' nt-cell-zero' : ''), statAmount(Number(n) || 0));
  return td;
}

function statsTable(title, rows, firstLabel, nameOf) {
  const wrap = el('section', 'nt-note-stat');
  wrap.appendChild(el('h4', 'nt-note-stat-title', title));
  const table = el('table', 'nt-table nt-note-stat-table');
  const thead = el('thead');
  const hr = el('tr');
  for (const h of [firstLabel, '期初余额', '本期流入', '本期流出', '期末余额']) hr.appendChild(el('th', '', h));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tb = el('tbody');
  for (const r of rows) {
    const tr = el('tr', 'nt-row');
    tr.appendChild(el('td', 'nt-cell', nameOf(r)));
    tr.appendChild(amtCell(r.opening));
    tr.appendChild(amtCell(r.increase));
    tr.appendChild(amtCell(r.decrease));
    tr.appendChild(amtCell(r.end));
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  wrap.appendChild(table);
  return wrap;
}

/**
 * 把备注统计画进容器（统计页第三块 / 设置页弹窗共用）
 * @param {{getState:Function}} ctx
 * @param {HTMLElement} body
 * @param {{start:string,end:string}} [range] 统计页的日期筛选范围
 */
export function renderNoteStats(ctx, body, range) {
  const rows = noteBalances(ctx.getState(), range);
  body.textContent = '';
  if (!rows.length) {
    body.appendChild(el('p', 'nt-sync-hint nt-imp-sub', '这个日期范围内还没有带金额的备注。'));
    return;
  }
  body.appendChild(statsTable('备注分类', rollupBalancesByType(rows), '分类', (r) => r.label));
  body.appendChild(statsTable('备注', rows, '关键字', (r) => r.keyword));
}

/**
 * @param {{getState:Function, setFooter?:Function}} ctx
 */
export function openNoteStats(ctx) {
  NtModal.open({
    title: '备注统计',
    body: '',
    build: (body) => renderNoteStats(ctx, body),
    actions: [{ label: '知道了', kind: 'primary', close: true }],
  });
}
