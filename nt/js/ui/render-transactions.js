/**
 * ☐12 流水渲染器
 * 层：第五层 · UI 渲染
 *
 * 消费 timeline/time-state.js 的切分结果，套 templates/templates.html 的模板生成 DOM。
 *
 * 铁律：**本文件不许算钱。**
 *   金额只能来自 format.money()，不允许出现 `a + b`、`a - b` 这类运算。
 *
 * 验收：代码里没有 `+`/`-`/`*`/`/` 参与金额运算。
 */

import { money, shortDate } from '../core/format.js';

export const CLASS = {
  row: 'nt-row',
  empty: 'nt-empty',
  seq: 'nt-cell-seq',
  date: 'nt-cell-date',
  from: 'nt-cell-from',
  to: 'nt-cell-to',
  amount: 'nt-cell-amount',
  note: 'nt-cell-note',
  action: 'nt-cell-action',
};

/** 一次性把 templates.html 注入 <body>（每个 id 只注入一次）。 */
export async function loadTemplates(url = './templates/templates.html') {
  const res = await fetch(url);
  const text = await res.text();
  const box = document.createElement('div');
  box.innerHTML = text;
  const found = box.querySelectorAll('template');
  const frag = document.createDocumentFragment();
  found.forEach((t) => {
    if (!document.getElementById(t.id)) frag.appendChild(t);
  });
  document.body.appendChild(frag);
  return found.length;
}

/** 模板 → 根元素（content 是 DocumentFragment，必须取 firstElementChild）。 */
export function tpl(id) {
  const el = document.getElementById(id);
  if (!el || !el.content) return null;
  return el.content.firstElementChild;
}

/**
 * 渲染流水表体。
 * @param {HTMLElement} tbody
 * @param {Array<{id:any,seq:number,date:string,from:string,to:string,amount:any,note:string}>} rows
 *        这里的每一条都应该是**已经算好**的展示数据
 */
export function renderRows(tbody, rows) {
  tbody.textContent = '';
  const rowTpl = tpl('tpl-flow-row');
  const emptyTpl = tpl('tpl-empty');

  if (!rows || !rows.length) {
    if (emptyTpl) tbody.appendChild(emptyTpl.cloneNode(true));
    return;
  }
  if (!rowTpl) return;

  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = rowTpl.cloneNode(true);
    tr.dataset.id = r.id;
    setText(tr, CLASS.seq, String(r.seq));
    // 优先用 model 已经算好的展示字段（dateText / amountText）；
    // 退回原始值时才现场格式化 —— 这样视图层永远不会把 undefined 当成 0 显示成「—」。
    setText(tr, CLASS.date, r.dateText != null ? r.dateText : shortDate(r.date));
    setText(tr, CLASS.from, r.from || '—');
    setText(tr, CLASS.to, r.to || '—');
    setText(tr, CLASS.amount, r.amountText != null ? r.amountText : money(r.amount));
    setText(tr, CLASS.note, r.note || '');
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

/** 按分段渲染（过去 / 当前 / 未来）。 */
export function renderSegments(tbody, segments) {
  const rows = [];
  let n = 1;
  for (const seg of ['past', 'current', 'future']) {
    for (const t of (segments && segments[seg]) || []) {
      rows.push({ ...t, seq: n });
      n += 1;
    }
  }
  renderRows(tbody, rows);
  return rows.length;
}

function setText(root, cls, text) {
  const el = root.querySelector('.' + cls);
  if (el) el.textContent = text;
}
