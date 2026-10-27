// 界面：统计 / 查询 / 固定 / 设置 → 通用表格渲染
/**
 * 表格渲染助手（UI 层）
 * 层：第五层 · UI 渲染
 *
 * 所有页面的表格都从这里出，保证「列宽 / 对齐 / 空状态 / 合计行」完全一致：
 *   建表头  → 克隆行模板 → 按 data-field 填文本 → 追加
 *
 * 本文件不算钱、不碰 state：只把「已经算好、已经格式化」的行对象摆到 DOM 上。
 */

import { tpl } from './render-transactions.js';

/**
 * 建表头。
 * @param {HTMLElement} thead
 * @param {Array<{label:string, cls?:string}>} columns
 */
import { paintHandles, syncFrozen } from './table-layout.js';

export function buildHead(thead, columns) {
  if (!thead) return;
  thead.textContent = '';
  const tr = document.createElement('tr');
  for (const c of columns || []) {
    const th = document.createElement('th');
    th.className = 'nt-th' + (c.cls ? ' ' + c.cls : '');
    th.scope = 'col';
    th.textContent = c.label || '';
    // 列宽拖动靠 data-col 认列；没给就按标签猜一个稳定的 key
    th.dataset.col = c.col || colForLabel(c.label);
    tr.appendChild(th);
  }
  thead.appendChild(tr);

  // 表头重建了：补手柄 + 重算冻结列的 left
  const table = thead.closest('table');
  if (table) {
    paintHandles(table);
    syncFrozen(table);
  }
}

/** 把一行数据填进克隆体：只认带 [data-field] 的格子。 */
export function fillRow(tr, data) {
  const cells = tr.querySelectorAll('[data-field]');
  for (const cell of cells) {
    const key = cell.getAttribute('data-field');
    const v = data ? data[key] : '';
    cell.textContent = v == null ? '' : String(v);
  }
  return tr;
}

/**
 * 渲染同构多行。
 * @param {HTMLElement} tbody
 * @param {Array<object>} rows
 * @param {string} tplId 例如 'tpl-query-row'
 * @param {(tr:HTMLTableRowElement, row:object)=>void} [decorate]
 * @returns {number} 实际渲染的行数
 */
export function renderRows(tbody, rows, tplId, decorate) {
  if (!tbody) return 0;
  tbody.textContent = '';
  const t = tpl(tplId);
  if (!t) return 0;
  const frag = document.createDocumentFragment();
  const list = rows || [];
  for (const row of list) {
    const tr = t.cloneNode(true);
    fillRow(tr, row);
    if (typeof decorate === 'function') decorate(tr, row);
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
  return list.length;
}

/**
 * 渲染异构多行（例如：分类行与合计行混排）。
 * items = [{ tplId, data, decorate? }]
 */
export function renderMixed(tbody, items) {
  if (!tbody) return;
  tbody.textContent = '';
  const frag = document.createDocumentFragment();
  for (const it of items || []) {
    const t = tpl(it.tplId);
    if (!t) continue;
    const tr = t.cloneNode(true);
    fillRow(tr, it.data);
    if (typeof it.decorate === 'function') it.decorate(tr, it.data);
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

/** 空状态行（colspan 按表宽补） */
export function renderEmpty(tbody, text, colspan) {
  if (!tbody) return;
  tbody.textContent = '';
  const t = tpl('tpl-row-empty');
  if (!t) return;
  const tr = t.cloneNode(true);
  const td = tr.querySelector('[data-field="text"]');
  if (td) {
    td.textContent = text || '';
    td.colSpan = colspan || 1;
    // 跨列格一律不参与冻结（见 shell.css 的 .nt-cell-span）
    if (td.colSpan > 1) td.classList.add('nt-cell-span');
  }
  tbody.appendChild(tr);
}

/**
 * 填一格。
 * `renderRows` 只会写 textContent，遇到 <input>/<select> 就填不进去；
 * 表格内直接交互的页面用这个。
 *
 * @param {HTMLElement} tr
 * @param {string} field data-field 的值
 * @param {any} value
 */
export function setCell(tr, field, value) {
  if (!tr) return;
  const el = tr.querySelector('[data-field="' + field + '"]');
  if (!el) return;
  const v = value == null ? '' : String(value);
  if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
    el.value = v;
  } else {
    el.textContent = v;
  }
}

/** 金额 → 可编辑字符串（0 和空都给空串，别显示 0） */
export function moneyOrBlank(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '';
  return String(n);
}

/** 表头文字 → 列宽用的稳定 key（统计页的表头是 JS 生成的，没有手写 data-col） */
const LABEL_COL = {
  序: 'seq',
  日期: 'date',
  转出账户: 'from',
  转入账户: 'to',
  转出: 'out',
  转入: 'iin',
  金额: 'amount',
  备注: 'note',
  频率: 'freq',
  类型: 'type',
  分类: 'cat',
  简码: 'code',
  账户名称: 'name',
  当前结余: 'balance',
  期初: 'opening',
  账单日: 'billDay',
  还款日: 'repayDay',
  转出历史: 'histOut',
  转入历史: 'histIn',
  期数: 'periods',
};

function colForLabel(label) {
  return LABEL_COL[String(label || '').trim()] || '';
}
