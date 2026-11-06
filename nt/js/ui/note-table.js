// 界面：设置页的备注区（独立于账户的 A/B 区）
/**
 * 备注表
 * 层：第五层 · UI
 *
 * 行结构（用户 2026-10-29 定稿）：
 *   简码 | 序 | 类型 | 关键字 | 内容（colspan=2）| 删除（colspan=2）
 *   一共 8 格，正好对上账户表的 8 列（2026-11 删掉账单日/还款日之后）。
 *
 * 类型 / 关键字都可以不填；填了的话，流水备注栏输入简码时会依次代入：
 *   「类型，关键字，内容」（中文逗号隔开，空的跳过）。
 * 备注体系只做统计分类，不参与任何金额 / 账户校验。
 */

import { addNote, updateNote, removeNote, noteTypesOf } from '../core/state-store.js';
import { bindTypePicker } from './type-picker.js';
import * as NtModal from './modal.js';
import { normalizeCode, isValidCode } from '../core/schema.js';

/** 末尾固定空行数（用户 2026-11：和账户表 / 固定收支一样留 10 行，批量录入不用等着重画） */
const BLANK_ROWS = 10;

/**
 * @param {{getState:Function, setState:Function, saveNow:Function, setFooter?:Function}} ctx
 * @param {Function} rerender 重绘整个账户表
 * @returns {DocumentFragment}
 */
export function renderNotes(ctx, rerender) {
  const frag = document.createDocumentFragment();
  const notes = ctx.getState().notes || [];

  // 备注区和上面的账户表之间**空一行**（无边框），表示这是另一个功能区
  //（用户 2026-11：不要用线分割，用空白）。
  frag.appendChild(noteGap());
  frag.appendChild(noteCols());
  frag.appendChild(noteHead());
  notes.forEach((note, i) => frag.appendChild(noteRow(ctx, note, i, rerender)));

  // 末尾 10 个空行：空行不显示任何内容（没有「+」、没有占位文字）
  for (let k = 0; k < BLANK_ROWS; k += 1) frag.appendChild(noteNewRow(ctx, rerender));
  return frag;
}

/* ---------- 与账户表之间的分隔空行 ---------- */

function noteGap() {
  const tr = document.createElement('tr');
  tr.className = 'nt-gap-row';
  const td = document.createElement('td');
  td.className = 'nt-cell';
  td.colSpan = 8;
  tr.appendChild(td);
  return tr;
}

/* ---------- 区域标题 ---------- */

function noteHead() {
  const head = document.createElement('tr');
  head.className = 'nt-zone-head nt-zone-note';

  const tag = document.createElement('td');
  tag.className = 'nt-cell nt-zone-cell nt-zone-tag';
  // 区域名就叫「备注」（用户 2026-10-29：不要 R 这种区号）
  tag.textContent = '备注';

  const td = document.createElement('td');
  td.className = 'nt-cell nt-zone-cell';
  td.colSpan = 7;

  const inner = document.createElement('div');
  inner.className = 'nt-zone-label';
  const hint = document.createElement('span');
  hint.className = 'nt-zone-hint nt-note-hint';
  hint.textContent = '成员归属/项目说明';
  inner.appendChild(hint);
  td.appendChild(inner);

  head.appendChild(tag);
  head.appendChild(td);
  return head;
}

/* ---------- 列标题行：简码 | 序 | 类型 | 关键字 | 内容 | 删除 ---------- */

function noteCols() {
  const tr = document.createElement('tr');
  tr.className = 'nt-zone-cols nt-note-cols';

  for (const label of ['简码', '序', '类型', '关键字']) {
    const td = document.createElement('td');
    td.className = 'nt-cell';
    td.textContent = label;
    tr.appendChild(td);
  }

  const textTd = document.createElement('td');
  textTd.className = 'nt-cell';
  textTd.colSpan = 2;
  textTd.textContent = '内容';
  tr.appendChild(textTd);

  const upTd = document.createElement('td');
  upTd.className = 'nt-cell';
  upTd.textContent = '移';
  tr.appendChild(upTd);

  const delTd = document.createElement('td');
  delTd.className = 'nt-cell';
  delTd.textContent = '删';
  tr.appendChild(delTd);

  return tr;
}

/* ---------- 单元格：简码 / 序 / 类型 / 关键字 / 内容 ---------- */

function noteCells(note, seqText) {
  const codeTd = document.createElement('td');
  codeTd.className = 'nt-cell nt-cell-code';
  const code = document.createElement('input');
  code.className = 'nt-cell-input nt-cell-input-code';
  code.type = 'text';
  code.maxLength = 5;
  code.dataset.field = 'ncode';
  code.setAttribute('aria-label', '备注简码');
  code.value = note.code || '';
  codeTd.appendChild(code);

  const seqTd = document.createElement('td');
  seqTd.className = 'nt-cell nt-cell-seq';
  seqTd.textContent = seqText;

  const typeTd = document.createElement('td');
  typeTd.className = 'nt-cell';
  // 类型可以自己输入（用户 2026-10-29）；候选来自内置四种 + 现有备注类型
  const type = document.createElement('input');
  type.className = 'nt-cell-input';
  type.type = 'text';
  type.dataset.field = 'ntype';
  type.setAttribute('aria-label', '备注类型');

  type.value = note.type || '';
  typeTd.appendChild(type);

  const keyTd = document.createElement('td');
  keyTd.className = 'nt-cell';
  const keyword = document.createElement('input');
  keyword.className = 'nt-cell-input';
  keyword.type = 'text';
  keyword.dataset.field = 'nkeyword';
  keyword.setAttribute('aria-label', '关键字');
  keyword.value = note.keyword || '';
  keyTd.appendChild(keyword);

  const textTd = document.createElement('td');
  textTd.className = 'nt-cell';
  textTd.colSpan = 2;
  const text = document.createElement('input');
  text.className = 'nt-cell-input';
  text.type = 'text';
  text.dataset.field = 'ntext';
  text.setAttribute('aria-label', '备注内容');
  text.value = note.text || '';
  textTd.appendChild(text);

  return { codeTd, seqTd, typeTd, keyTd, textTd, code, type, keyword, text };
}

function noteActionTd() {
  const td = document.createElement('td');
  td.className = 'nt-cell nt-cell-action nt-cell-edge';
  return td;
}

/** 把一条备注往上挪一位（用户 2026-11：备注区也要和账户表一样有上移） */
function moveNoteUp(ctx, note, rerender) {
  const st = ctx.getState();
  const arr = (st.notes || []).slice();
  const i = arr.findIndex((n) => n.id === note.id);
  if (i <= 0) return;
  [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
  ctx.setState({ ...st, notes: arr });
  ctx.saveNow();
  rerender();
}

/* ---------- 已有备注 ---------- */

function noteRow(ctx, note, index, rerender) {
  const tr = document.createElement('tr');
  tr.className = 'nt-row nt-note-row';
  tr.dataset.id = note.id;

  const c = noteCells(note, String(index + 1));

  c.code.addEventListener('change', () => {
    const v = normalizeCode(c.code.value);
    if (v && !isValidCode(v)) { rerender(); return; }
    const dup = (ctx.getState().notes || [])
      .some((n) => n.id !== note.id && normalizeCode(n.code) === v);
    if (v && dup) { rerender(); return; }
    ctx.setState(updateNote(ctx.getState(), note.id, { code: v }));
    ctx.saveNow();
    rerender();
  });

  c.type.addEventListener('change', () => {
    // 类型可以自己输入，任意非空字符串都收下（类型库由 noteTypesOf 动态推导）
    ctx.setState(updateNote(ctx.getState(), note.id, { type: String(c.type.value || '').trim() }));
    ctx.saveNow();
  });

  // 点一下类型格弹候选（和账户表同一套浮层；原生 datalist 在已录入行里调不出来）
  bindTypePicker(c.type, () => noteTypesOf(ctx.getState()), (v) => {
    if (v === '__custom__') {
      NtModal.prompt('新的备注类型（会加进类型库）', '', (val) => {
        const t = String(val || '').trim();
        if (!t) return true;
        c.type.value = t;
        ctx.setState(updateNote(ctx.getState(), note.id, { type: t }));
        ctx.saveNow();
        return true;
      });
      return;
    }
    ctx.setState(updateNote(ctx.getState(), note.id, { type: v }));
    ctx.saveNow();
  });

  c.keyword.addEventListener('change', () => {
    ctx.setState(updateNote(ctx.getState(), note.id, {
      keyword: String(c.keyword.value || '').trim(),
    }));
    ctx.saveNow();
  });

  c.text.addEventListener('change', () => {
    ctx.setState(updateNote(ctx.getState(), note.id, { text: String(c.text.value || '').trim() }));
    ctx.saveNow();
  });

  // 上移：和账户表一样的 ▲，置顶的那一条点了没反应
  const upTd = noteActionTd();
  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'nt-btn nt-btn-icon';
  up.textContent = '▲';
  up.setAttribute('aria-label', '上移备注');
  up.addEventListener('click', () => moveNoteUp(ctx, note, rerender));
  upTd.appendChild(up);

  const delTd = noteActionTd();
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'nt-btn nt-btn-icon';
  del.textContent = '×';
  del.setAttribute('aria-label', '删除备注');
  del.addEventListener('click', () => {
    ctx.setState(removeNote(ctx.getState(), note.id));
    ctx.saveNow();
    rerender();
    if (ctx.setFooter) ctx.setFooter('已删除备注');
  });
  delTd.appendChild(del);

  tr.appendChild(c.codeTd);
  tr.appendChild(c.seqTd);
  tr.appendChild(c.typeTd);
  tr.appendChild(c.keyTd);
  tr.appendChild(c.textTd);
  tr.appendChild(upTd);
  tr.appendChild(delTd);
  return tr;
}

/* ---------- 新增行：内容填了就成 ---------- */

function noteNewRow(ctx, rerender) {
  const tr = document.createElement('tr');
  tr.className = 'nt-row nt-row-new';
  tr.dataset.new = '2';

  // 空行不显示任何内容：序号格留空（原来这里显示「+」）
  const c = noteCells({ __new: true, type: '', text: '' }, '');

  const tryCreate = () => {
    if (!tr.isConnected) return;
    const text = String(c.text.value || '').trim();
    if (!text) return;                 // 内容为空不建
    const st = ctx.getState();
    const code = normalizeCode(c.code.value);
    if (code && !isValidCode(code)) { rerender(); return; }
    if (code && (st.notes || []).some((n) => normalizeCode(n.code) === code)) { rerender(); return; }
    ctx.setState(addNote(st, {
      code,
      type: String(c.type.value || '').trim(),
      keyword: String(c.keyword.value || '').trim(),
      text,
    }));
    ctx.saveNow();
    rerender();
    if (ctx.setFooter) ctx.setFooter('已新增备注');
  };

  for (const el of [c.code, c.type, c.keyword, c.text]) {
    // 延迟到本轮结束：一行里连填几格时，后面的不能落在已脱离 DOM 的旧行上
    el.addEventListener('change', () => setTimeout(tryCreate, 0));
  }

  // 新增行的类型也点开候选：选中后回填并尝试建行
  bindTypePicker(c.type, () => noteTypesOf(ctx.getState()), (v) => {
    if (v === '__custom__') {
      NtModal.prompt('新的备注类型（会加进类型库）', '', (val) => {
        const t = String(val || '').trim();
        if (t) { c.type.value = t; setTimeout(tryCreate, 0); }
        return true;
      });
      return;
    }
    c.type.value = v;
    setTimeout(tryCreate, 0);
  });

  tr.appendChild(c.codeTd);
  tr.appendChild(c.seqTd);
  tr.appendChild(c.typeTd);
  tr.appendChild(c.keyTd);
  tr.appendChild(c.textTd);
  // 新增行也要占满 8 列：内容(2) + 移(1) + 删(1)
  tr.appendChild(noteActionTd());
  tr.appendChild(noteActionTd());
  return tr;
}
