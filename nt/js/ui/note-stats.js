// 界面：备注统计（两个小表：备注分类 / 备注，沿用统计页的日期筛选）
/**
 * 备注统计（UI 层）
 * 层：第五层 · UI
 *
 * 用户 2026-11-09：
 *   · 备注统计本质是自动合计；只统计**有金额**的备注；
 *   · 上表按备注分类（备注表里的类型）合计，下表按关键字合计；
 *   · 两个表的表头结构和样式跟节点统计表的资产类一致；
 *   · 日期筛选沿用统计页的 区间/年份/月份（range 传进来）。
 */

import * as NtModal from './modal.js';
import { noteTotals, rollupByType, rollupByKeyword } from '../core/note-stats.js';
import { money } from '../core/format.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/** 一个小表：标题 + 表头（名称 / 笔数 / 金额），样式沿用统计页的资产类表 */
function statsTable(title, rows, nameOf) {
  const wrap = el('section', 'nt-note-stat');
  wrap.appendChild(el('h4', 'nt-note-stat-title', title));
  const table = el('table', 'nt-table nt-note-stat-table');
  const thead = el('thead');
  const hr = el('tr');
  for (const h of ['名称', '笔数', '金额']) hr.appendChild(el('th', '', h));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tb = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    tr.appendChild(el('td', '', nameOf(r)));
    tr.appendChild(el('td', 'nt-note-stat-n', r.count + ' 笔'));
    tr.appendChild(el('td', 'nt-note-stat-amt', money(r.sum)));
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
  const rows = noteTotals(ctx.getState(), range);
  body.textContent = '';
  if (!rows.length) {
    body.appendChild(el('p', 'nt-sync-hint nt-imp-sub', '这个日期范围内还没有带金额的备注。'));
    return;
  }
  body.appendChild(statsTable('备注分类', rollupByType(rows), (r) => r.label));
  body.appendChild(statsTable('备注', rollupByKeyword(rows), (r) => r.keyword));
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
