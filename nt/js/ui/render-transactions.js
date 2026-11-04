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
import { decorateVirtualRow } from './plan-rows.js';

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

/** 首次渲染多少条（用户 2026-11-01：100 条就够，重建范围越小切页越快） */
const FIRST = 100;
/** 每次再加载多少条 */
const STEP = 60;
/** 视口两端各留多少条缓冲就触发加载 */
const BUFFER = 40;
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
/** 已渲染的窗口 [winStart, winEnd)（下标，针对 currentRows） */
let winStart = 0;
let winEnd = 0;
/** 现在段的行数（不含未来）。窗口只切这一段。 */
let presentCount = 0;

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
  if (r.planKey) tr.dataset.plan = r.planKey;
  if (r.sourceId) tr.dataset.source = r.sourceId;
  if (r.month) tr.dataset.month = r.month;
  if (r.fromId) tr.dataset.fromId = r.fromId;
  if (r.toId) tr.dataset.toId = r.toId;
  if (r.amountRaw != null) tr.dataset.amount = String(r.amountRaw);

  if (r.isOpening) {
    setInput(tr, 'date', r.dateEdit || '');
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

  const mark = r.mark === 'hollow' || r.mark === 'yellow' ? r.mark : '';
  if (mark) {
    tr.classList.add('nt-mark-' + mark);
    const seq = tr.querySelector('.' + CLASS.seq);
    if (seq) {
      const dot = document.createElement('span');
      dot.className = 'nt-draft-mark';
      dot.title = mark === 'hollow' ? '草稿：还缺转出或转入' : '草稿：有账户还没定类型';
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', dot.title);
      seq.appendChild(dot);
    }
  }

  if (r.isVirtual) decorateVirtualRow(tr);
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

function splitPresent(rows) {
  const present = [];
  const future = [];
  for (const r of rows || []) {
    if (r && r.isVirtual) future.push(r);
    else present.push(r);
  }
  return { present, future };
}

function renderAll(tbody) {
  const rowTpl = tpl('tpl-flow-row');
  const newTpl = tpl('tpl-flow-new');
  if (!tbody || !rowTpl || !newTpl) return 0;

  const { present, future } = splitPresent(currentRows);
  presentCount = present.length;
  const frag = document.createDocumentFragment();

  if (winStart > 0) {
    frag.appendChild(moreRow(winStart, () => {
      winStart = Math.max(0, winStart - STEP);
      renderAll(currentTbody);
    }));
  }

  const end = Math.min(winEnd, present.length);
  for (let i = winStart; i < end; i += 1) {
    frag.appendChild(dataRow(present[i], i, rowTpl));
  }
  // 空白自由录入行在「现在」和「未来」之间
  for (let k = 0; k < BLANK_ROWS; k += 1) {
    frag.appendChild(blankRow(newTpl, k));
  }
  for (let j = 0; j < future.length; j += 1) {
    frag.appendChild(dataRow(future[j], present.length + j, rowTpl));
  }

  tbody.replaceChildren(frag);
  syncFrozen(tbody.closest('table'));
  return end - winStart;
}

/**
 * 滚动时保持两端缓冲（只绑一次）。
 *
 * 用户 2026-11-01：窗口后面或前面小于 40 条时，加载更多 60 条。
 * 往下这一侧平时不会触发 —— 打开即定位到最新，后面没有数据了；
 * 留着是因为「窗口没到头」的情况确实存在（比如以后加筛选）。
 */
function bindMore(tbody) {
  const wrap = tbody.closest('.nt-tablewrap');
  if (!wrap || wrap.dataset.more === '1') return;
  wrap.dataset.more = '1';

  let ticking = false;
  wrap.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const rowH = (tbody.querySelector('tr') || { getBoundingClientRect: () => ({ height: 32 }) })
        .getBoundingClientRect().height || 32;
      const top = wrap.scrollTop;
      const bottom = top + wrap.clientHeight;
      const firstVisible = Math.floor(top / rowH) - (winStart > 0 ? 1 : 0); // 顶上那行「更早」也要算
      const lastVisible = Math.ceil(bottom / rowH) - (winStart > 0 ? 1 : 0);
      const total = winEnd - winStart;
      const beforeH = wrap.scrollHeight;

      if (firstVisible < BUFFER && winStart > 0) {
        winStart = Math.max(0, winStart - STEP);
        renderAll(tbody);
        // 前面插进来一批：把新增高度补回 scrollTop，视觉上内容不动
        wrap.scrollTop = top + (wrap.scrollHeight - beforeH);
      } else if (total - lastVisible < BUFFER && winEnd < presentCount) {
        winEnd = Math.min(presentCount, winEnd + STEP);
        renderAll(tbody);
        wrap.scrollTop = top;
      }
    });
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
  presentCount = splitPresent(currentRows).present.length;
  if (!(opts && opts.keepShown)) {
    winEnd = presentCount;
    winStart = Math.max(0, winEnd - FIRST);
  }
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

  // 新行已经插进 DOM 了：窗口要把它算进去，否则下一次按窗口重建会把它丢掉
  const atEnd = winEnd >= presentCount;
  let insertAt = currentRows.findIndex((r) => r && r.isVirtual);
  if (insertAt < 0) insertAt = currentRows.length;
  currentRows.splice(insertAt, 0, row);
  presentCount += 1;
  if (atEnd) winEnd = presentCount;
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
