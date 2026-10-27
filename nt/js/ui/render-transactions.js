// 界面：流水 tab → 表格 tbody（虚拟滚动）
/**
 * ☐12 流水渲染器（虚拟滚动）
 * 层：第五层 · UI 渲染
 *
 * 消费 timeline/time-state.js 的切分结果，套 templates/templates.html 的模板生成 DOM。
 * 950 行全量渲染会让窗口 resize 卡顿，这里只渲染可视区几十行 + 上下占位行。
 *
 * 铁律：**本文件不许算钱。**
 *   金额只能来自 format.money()，不允许出现 `a + b`、`a - b` 这类运算。
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
  fixed: 'nt-cell-fixed',
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

function setText(tr, cls, text) {
  const cell = tr.querySelector('.' + cls);
  if (cell) cell.textContent = text;
}

function setInput(tr, field, value) {
  const input = tr.querySelector('[data-field="' + field + '"]');
  if (input) input.value = value == null ? '' : String(value);
}

/** 模板 → 根元素（content 是 DocumentFragment，必须取 firstElementChild）。 */
export function tpl(id) {
  const el = document.getElementById(id);
  if (!el || !el.content) return null;
  return el.content.firstElementChild;
}

/* ---------- 虚拟滚动状态 ---------- */

let currentRows = [];
let currentTbody = null;
let raf = 0;

function getRowH() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nt-row-h'));
  return Number.isFinite(v) && v > 0 ? v : 32;
}

function spacerRow(h) {
  const tr = document.createElement('tr');
  tr.className = 'nt-row-spacer';
  tr.style.height = h + 'px';
  const td = document.createElement('td');
  td.colSpan = 8;
  tr.appendChild(td);
  return tr;
}

function bindScroll(tbody) {
  const wrap = tbody.closest('.nt-tablewrap');
  if (!wrap || wrap.dataset.virtual === '1') return;
  wrap.dataset.virtual = '1';
  wrap.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      renderWindow();
    });
  }, { passive: true });
}

/** 只渲染可视区窗口（上下用占位行撑起总高度） */
function renderWindow() {
  const tbody = currentTbody;
  if (!tbody) return;
  const rowTpl = tpl('tpl-flow-row');
  const newTpl = tpl('tpl-flow-new');
  const emptyTpl = tpl('tpl-empty');
  if (!rowTpl) return;

  const rows = currentRows;
  const wrap = tbody.closest('.nt-tablewrap');
  const rowH = getRowH();
  const scrollTop = wrap ? wrap.scrollTop : 0;
  const viewH = wrap ? wrap.clientHeight : 800;

  const start = Math.max(0, Math.floor(scrollTop / rowH) - 2);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / rowH) + 2);

  const frag = document.createDocumentFragment();

  if (!rows.length) {
    if (emptyTpl) frag.appendChild(emptyTpl.cloneNode(true));
  } else {
    if (start > 0) frag.appendChild(spacerRow(start * rowH));

    for (let i = start; i < end; i += 1) {
      const r = rows[i];
      const tr = rowTpl.cloneNode(true);
      tr.dataset.id = r.id;
      if (r.isOpening) {
        // 期初行：日期显示长横线、不可编辑、不能删除；序号照常显示
        setText(tr, CLASS.seq, String(r.seq));
        setInput(tr, 'date', '—');
        const d = tr.querySelector('[data-field="date"]');
        if (d) d.readOnly = true;
        const act = tr.querySelector('.' + CLASS.action);
        if (act) act.textContent = '';
      } else {
        setText(tr, CLASS.seq, String(r.seq));
        setInput(tr, 'date', r.dateEdit != null ? r.dateEdit : r.date);
      }
      setInput(tr, 'from', r.from);
      setInput(tr, 'to', r.to);
      setInput(tr, 'amount', r.amountEdit != null ? r.amountEdit : r.amount);
      setInput(tr, 'note', r.note);
      // 「固定」这一列还没有对应的数据字段（流水上没有 isFixed），先给一个占位符。
      // 等列语义定下来再接 —— 空着会让人以为表格没渲染完。
      setText(tr, CLASS.fixed, r.fixedText != null ? r.fixedText : '—');

      if (r.isVirtual) {
        // 虚拟行（未来分期）：只读，样式标出「这是计划，不是已发生」
        tr.classList.add('nt-row-virtual');
        tr.dataset.virtual = '1';
        for (const inp of tr.querySelectorAll('input')) inp.readOnly = true;
        const act2 = tr.querySelector('.' + CLASS.action);
        if (act2) act2.textContent = '';
      }
      frag.appendChild(tr);
    }

    if (end < rows.length) frag.appendChild(spacerRow((rows.length - end) * rowH));
  }

  // 末尾永远留一行「新增」
  if (newTpl) frag.appendChild(newTpl.cloneNode(true));

  tbody.replaceChildren(frag);
}

/**
 * 渲染流水表体（行内可编辑，虚拟滚动）
 * @param {HTMLElement} tbody
 * @param {Array<{id:any,seq:number,date:string,from:string,to:string,amount:any,note:string}>} rows
 */
export function renderRows(tbody, rows) {
  currentRows = rows || [];
  currentTbody = tbody;
  bindScroll(tbody);
  renderWindow();
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
