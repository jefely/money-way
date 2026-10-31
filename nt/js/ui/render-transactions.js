// 界面：流水 tab → 表格 tbody（分批追加，照单文件版）
/**
 * 流水渲染器
 * 层：第五层 · UI 渲染
 *
 * **用户 2026-11-01 决定：取消虚拟滚动，照单文件版的模式来。**
 *
 * 单文件版的做法（这里逐条照搬）：
 *   · 首批 200 行；滚到顶 / 点「更早」再往前接 200 条
 *   · **只追加，不重建已经渲染的行**
 *   · 建单把这一行**就地转正**，末尾补一个空行，别的行一行都不动
 *
 * 为什么不再用虚拟滚动：行是「当前窗口的临时投影」，任何一次重建（滚动 / render /
 * 切页 / 建单）都要把整屏重新造一遍 —— 空行里写了一半的内容、焦点、选中态、
 * 输入法的组合态全得单独维护。机制与代价见 ../TABLE-RENDERING.md。
 *
 * 空行草稿仍保留，作为**双保险**：删除行、切页、导入这些动作依然会整体重建，
 * 重建时草稿回填，用户写了一半的内容照样不丢。
 *
 * 铁律：**本文件不许算钱。**
 *   金额只能来自 format.money()，不允许出现 `a + b`、`a - b` 这类运算。
 */

import { syncFrozen } from './table-layout.js';

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

/** 一次渲染 / 追加多少条 */
const BATCH = 200;
/** 末尾常驻空行：直接在最下面连续录入（用户 2026-10-29） */
const BLANK_ROWS = 40;

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

function setText(tr, cls, text) {
  const cell = tr.querySelector('.' + cls);
  if (cell) cell.textContent = text;
}

function setInput(tr, field, value) {
  const input = tr.querySelector('[data-field="' + field + '"]');
  if (input) input.value = value == null ? '' : String(value);
}

/* ---------- 渲染状态 ---------- */

let currentRows = [];
let currentTbody = null;
/** 从末尾往前显示多少条（往上滚 / 点「更早」时增加） */
let shown = BATCH;

/**
 * 行内编辑后同步这一行的「展示快照」。
 * 重建时从 currentRows 取值；只更新 state、不更新它的话会读回旧值。
 */
export function patchRow(id, patch) {
  const r = currentRows.find((x) => x && x.id === id);
  if (r) Object.assign(r, patch);
}

/* ---------- 空行草稿 ----------
 * 空行不在 state 里，是渲染出来的；重建时若不回填，用户写了一半的内容就没了。
 * 按「空行区序号」存（0..39），某一空行转成正式记录后丢掉它的草稿、后面序号前移。
 */
const DRAFT_FIELDS = ['date', 'from', 'to', 'amount', 'note'];
let draftRows = new Array(BLANK_ROWS).fill(null);

function readDraft(tr) {
  const o = {};
  let any = false;
  for (const f of DRAFT_FIELDS) {
    const el = tr.querySelector('[data-field="' + f + '"]');
    const v = el ? String(el.value || '') : '';
    o[f] = v;
    if (v) any = true;
  }
  return any ? o : null;
}

function applyDraft(tr, draft) {
  if (!draft) return;
  for (const f of DRAFT_FIELDS) {
    const el = tr.querySelector('[data-field="' + f + '"]');
    if (el && draft[f]) el.value = draft[f];
  }
}

/** 这一行空行已经转成正式记录：丢掉它的草稿，后面的序号前移 */
export function clearBlankDraft(idx) {
  const i = Number(idx);
  if (!Number.isFinite(i) || i < 0 || i >= draftRows.length) return;
  draftRows.splice(i, 1);
  draftRows.push(null);
}

/** 草稿快照（诊断用） */
export function blankDrafts() {
  return draftRows.map((d) => (d ? { ...d } : null));
}

/**
 * 账户改名 → 空行草稿里的旧名字一起改。
 * 不改的话：那行切回流水会按旧名重新建一个账户，看起来就是「改名没生效、旧名字又回来了」。
 */
export function renameBlankDraft(from, to) {
  const a = String(from || '').trim();
  const b = String(to || '').trim();
  if (!a || !b || a === b) return;
  for (const d of draftRows) {
    if (!d) continue;
    if (String(d.from || '').trim() === a) d.from = b;
    if (String(d.to || '').trim() === a) d.to = b;
  }
}

/* ---------- 造行 ---------- */

function dataRow(r, i, rowTpl) {
  const tr = rowTpl.cloneNode(true);
  tr.dataset.id = r.id;
  // 斑马纹按**全量下标**打类：用 nth-child 会被「更早」行与空行挤得错位
  if (i % 2 === 1) tr.classList.add('nt-row-even');

  setText(tr, CLASS.seq, String(r.seq));
  if (r.isOpening) {
    setInput(tr, 'date', String(r.date || '').slice(0, 10) || '—');
    const d = tr.querySelector('[data-field="date"]');
    if (d) d.readOnly = true;
    const act = tr.querySelector('.' + CLASS.action);
    if (act) act.textContent = '';
  } else {
    setInput(tr, 'date', r.dateEdit != null ? r.dateEdit : r.date);
  }
  setInput(tr, 'from', r.from);
  setInput(tr, 'to', r.to);
  setInput(tr, 'amount', r.amountEdit != null ? r.amountEdit : r.amount);
  setInput(tr, 'note', r.note);

  const box = tr.querySelector('.' + CLASS.fixed + ' .nt-fixed-box');
  if (box) {
    box.checked = !!r.fixed;
    box.disabled = !!r.isOpening || !!r.isVirtual;
  }

  if (r.isVirtual) {
    tr.classList.add('nt-row-virtual');
    tr.dataset.virtual = '1';
    for (const inp of tr.querySelectorAll('input')) inp.readOnly = true;
    const act2 = tr.querySelector('.' + CLASS.action);
    if (act2) act2.textContent = '';
  }
  return tr;
}

/** 顶部「还有 N 笔更早的」 */
function moreRow(count, onClick) {
  const tr = document.createElement('tr');
  tr.className = 'nt-row nt-row-more';
  const td = document.createElement('td');
  td.className = 'nt-cell nt-flow-more';
  td.colSpan = 8;
  td.textContent = `还有 ${count} 笔更早的 · 点这里加载`;
  td.addEventListener('click', onClick);
  tr.appendChild(td);
  return tr;
}

function blankRow(newTpl, k) {
  const tr = newTpl.cloneNode(true);
  tr.dataset.blank = String(k);
  applyDraft(tr, draftRows[k]);
  return tr;
}

/** 空行序号重排：转正消耗掉一个之后，后面的要前移 */
function renumberBlanks(tbody) {
  const list = [...tbody.querySelectorAll('tr[data-new="1"]')];
  list.forEach((el, i) => { el.dataset.blank = String(i); });
}

/**
 * 把空行里输入的内容写进草稿（只绑一次）。
 * 用 capture：本表的行内编辑监听在冒泡阶段，草稿要在它之前落到数组里。
 */
function bindDrafts(tbody) {
  if (tbody.dataset.drafts === '1') return;
  tbody.dataset.drafts = '1';
  tbody.addEventListener('input', (ev) => {
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT') return;
    const tr = input.closest('tr[data-blank]');
    if (!tr) return;
    const k = Number(tr.dataset.blank);
    if (!Number.isFinite(k) || k < 0 || k >= draftRows.length) return;
    draftRows[k] = readDraft(tr);
  }, true);
}

/* ---------- 渲染 ---------- */

function renderAll(tbody) {
  const rowTpl = tpl('tpl-flow-row');
  const newTpl = tpl('tpl-flow-new');
  if (!tbody || !rowTpl || !newTpl) return 0;

  const rows = currentRows;
  const start = Math.max(0, rows.length - shown);
  const frag = document.createDocumentFragment();

  if (start > 0) {
    frag.appendChild(moreRow(start, () => {
      shown = Math.min(rows.length, shown + BATCH);
      renderAll(currentTbody);
    }));
  }

  for (let i = start; i < rows.length; i += 1) {
    frag.appendChild(dataRow(rows[i], i, rowTpl));
  }
  for (let k = 0; k < BLANK_ROWS; k += 1) {
    frag.appendChild(blankRow(newTpl, k));
  }

  tbody.replaceChildren(frag);
  syncFrozen(tbody.closest('table'));
  return rows.length - start;
}

/** 滚到顶自动往更早接一批（只绑一次） */
function bindMore(tbody) {
  const wrap = tbody.closest('.nt-tablewrap');
  if (!wrap || wrap.dataset.more === '1') return;
  wrap.dataset.more = '1';
  wrap.addEventListener('scroll', () => {
    if (wrap.scrollTop > 40) return;
    if (shown >= currentRows.length) return;
    const before = wrap.scrollHeight;
    shown = Math.min(currentRows.length, shown + BATCH);
    renderAll(tbody);
    // 往前接了一批之后保持视觉位置：新内容撑高的部分补回 scrollTop
    wrap.scrollTop = Math.max(0, wrap.scrollHeight - before + 40);
  }, { passive: true });
}

/**
 * 渲染流水表体（行内可编辑）
 * @param {HTMLElement} tbody
 * @param {Array} rows 全量（按 seq 升序）
 * @param {{keepShown?:boolean}} [opts] keepShown=true 时保留当前已展开的条数
 * @returns {{shownRows:number, total:number}}
 */
export function renderRows(tbody, rows, opts) {
  currentRows = rows || [];
  currentTbody = tbody;
  if (!(opts && opts.keepShown)) shown = Math.min(BATCH, currentRows.length) || BATCH;
  bindMore(tbody);
  bindDrafts(tbody);
  const shownRows = renderAll(tbody);
  return { shownRows, total: currentRows.length };
}

/**
 * 就地转正：把一行空行换成正式数据行，**不重建整表**。
 *
 * 这是单文件版的核心动作，也是「自由录入」能成立的原因 ——
 * 建单一笔只动这一行，别的行（包括其它空行里写了一半的内容）原封不动。
 *
 * @param {HTMLElement} tbody
 * @param {HTMLElement|null} tr 被转正的那一行空行
 * @param {object} row buildFlowRows 里对应那一条（字段同渲染行）
 * @returns {boolean}
 */
export function promoteRow(tbody, tr, row) {
  const rowTpl = tpl('tpl-flow-row');
  const newTpl = tpl('tpl-flow-new');
  if (!tbody || !rowTpl || !row) return false;

  const k = tr && tr.dataset.blank != null ? Number(tr.dataset.blank) : -1;

  const fresh = dataRow(row, currentRows.length, rowTpl);
  const firstBlank = tbody.querySelector('tr[data-new="1"]');
  if (firstBlank) tbody.insertBefore(fresh, firstBlank);
  else tbody.appendChild(fresh);

  if (tr && tr.isConnected) tr.remove();
  // 空行恒 BLANK_ROWS 个：末尾补一个刚被消耗掉的
  if (newTpl) tbody.appendChild(blankRow(newTpl, BLANK_ROWS - 1));
  renumberBlanks(tbody);

  if (k >= 0) clearBlankDraft(k);

  currentRows.push(row);
  syncFrozen(tbody.closest('table'));
  return true;
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
