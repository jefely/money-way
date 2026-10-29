// 界面：设置页的备注区（独立于账户的 A/B 区）
/**
 * 备注表
 * 层：第五层 · UI
 *
 * 行结构：简码（冻结列）| 类型（成员/商家/项目/用途）| 内容（colspan=6，右边到还款日列）| 删除（colspan=2）
 *
 * 用户 2026-10-29 定：备注体系只做统计分类，以及备注栏里输入简码时自动代入文本，
 * 不参与任何金额 / 账户校验。简码独立于账户简码（两套命名空间）。
 */

import { addNote, updateNote, removeNote, NOTE_TYPES } from '../core/state-store.js';
import { normalizeCode, isValidCode } from '../core/schema.js';

/**
 * @param {{getState:Function, setState:Function, saveNow:Function, setFooter?:Function}} ctx
 * @param {Function} rerender 重绘整个账户表
 * @returns {DocumentFragment}
 */
export function renderNotes(ctx, rerender) {
  const frag = document.createDocumentFragment();
  const notes = ctx.getState().notes || [];

  frag.appendChild(noteHead());
  notes.forEach((note, i) => frag.appendChild(noteRow(ctx, note, i, rerender)));
  frag.appendChild(noteNewRow(ctx, rerender));
  return frag;
}

/* ---------- 标题行 ---------- */

function noteHead() {
  const head = document.createElement('tr');
  head.className = 'nt-zone-head nt-zone-note';

  const tag = document.createElement('td');
  tag.className = 'nt-cell nt-zone-cell nt-zone-tag';
  // 区域名就叫「备注」（用户 2026-10-29：不要 R 这种区号）
  tag.textContent = '备注';

  const td = document.createElement('td');
  td.className = 'nt-cell nt-zone-cell';
  td.colSpan = 9;

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

/* ---------- 三个单元格：简码 / 类型 / 内容 ---------- */

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

  // 序号：每个区域从 1 开始；新增行显示「+」（用户 2026-10-29）
  const seqTd = document.createElement('td');
  seqTd.className = 'nt-cell nt-cell-seq';
  seqTd.textContent = seqText;

  const typeTd = document.createElement('td');
  typeTd.className = 'nt-cell';
  const sel = document.createElement('select');
  sel.className = 'nt-cell-input';
  sel.dataset.field = 'ntype';
  sel.setAttribute('aria-label', '备注类型');
  for (const t of NOTE_TYPES) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  }
  sel.value = NOTE_TYPES.includes(note.type) ? note.type : NOTE_TYPES[0];
  typeTd.appendChild(sel);

  const textTd = document.createElement('td');
  textTd.className = 'nt-cell';
  textTd.colSpan = 5;
  const text = document.createElement('input');
  text.className = 'nt-cell-input';
  text.type = 'text';
  text.dataset.field = 'ntext';
  text.setAttribute('aria-label', '备注内容');
  text.placeholder = note.__new ? '成员归属 / 项目说明' : '';
  text.value = note.text || '';
  textTd.appendChild(text);

  return { codeTd, seqTd, typeTd, textTd, code, sel, text };
}

function noteActionTd() {
  const td = document.createElement('td');
  td.className = 'nt-cell nt-cell-action nt-cell-edge';
  td.colSpan = 2;
  return td;
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

  c.sel.addEventListener('change', () => {
    if (!NOTE_TYPES.includes(c.sel.value)) { rerender(); return; }
    ctx.setState(updateNote(ctx.getState(), note.id, { type: c.sel.value }));
    ctx.saveNow();
  });

  c.text.addEventListener('change', () => {
    ctx.setState(updateNote(ctx.getState(), note.id, { text: String(c.text.value || '').trim() }));
    ctx.saveNow();
  });

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
  tr.appendChild(c.textTd);
  tr.appendChild(delTd);
  return tr;
}

/* ---------- 新增行：内容填了就成 ---------- */

function noteNewRow(ctx, rerender) {
  const tr = document.createElement('tr');
  tr.className = 'nt-row nt-row-new';
  tr.dataset.new = '2';

  const c = noteCells({ __new: true, type: NOTE_TYPES[0], text: '' }, '+');

  const tryCreate = () => {
    if (!tr.isConnected) return;
    const text = String(c.text.value || '').trim();
    if (!text) return;                 // 内容为空不建
    const st = ctx.getState();
    const code = normalizeCode(c.code.value);
    if (code && !isValidCode(code)) { rerender(); return; }
    if (code && (st.notes || []).some((n) => normalizeCode(n.code) === code)) { rerender(); return; }
    ctx.setState(addNote(st, { code, type: c.sel.value, text }));
    ctx.saveNow();
    rerender();
    if (ctx.setFooter) ctx.setFooter('已新增备注');
  };

  for (const el of [c.code, c.sel, c.text]) {
    // 延迟到本轮结束：一行里连填几格时，后面的不能落在已脱离 DOM 的旧行上
    el.addEventListener('change', () => setTimeout(tryCreate, 0));
  }

  tr.appendChild(c.codeTd);
  tr.appendChild(c.seqTd);
  tr.appendChild(c.typeTd);
  tr.appendChild(c.textTd);
  tr.appendChild(noteActionTd());
  return tr;
}
