// 界面：流水 tab → 行内编辑 / 新增行
/**
 * 行内编辑（UI 层）
 *
 * 只负责「哪个格子被改成了什么」以及「转出/转入格子的简码体验」，
 * 业务判断（解析成 ID、写 state）全部交给调用方。
 *
 * 简码交互（本文件的核心）：
 *   · 输入 ≥2 字符 → 弹候选气泡
 *   · 回车 / 失焦 / 空格 → 解析：命中就回填真实名，并把 id 交给调用方
 *   · 点候选 → 直接回填
 */

import { showSuggest, hideSuggest, isSuggestFor } from './suggest-popover.js';

const ACCOUNT_FIELDS = ['from', 'to'];

/**
 * @param {HTMLElement} tbody
 * @param {{
 *   onEdit:(id:string, field:string, value:string, resolvedId?:string)=>void,
 *   onCreate:(fields:Record<string,string>)=>void,
 *   onDelete:(id:string)=>void,
 *   onCommit:()=>void,
 *   parseAccount:(input:string)=>{acc:object|null, display:string, via:string|null},
 *   suggestAccounts:(input:string)=>Array<{acc:object}>
 * }} h
 */
export function bindRowEditing(tbody, h) {
  /* ---------- 输入 ---------- */
  tbody.addEventListener('input', (ev) => {
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT' || !input.dataset.field) return;

    const field = input.dataset.field;
    const tr = input.closest('tr');
    if (!tr) return;

    // 简码：边打边给候选
    if (ACCOUNT_FIELDS.includes(field)) {
      const items = h.suggestAccounts ? h.suggestAccounts(input.value) : [];
      if (items && items.length) showSuggest(input, items, (acc) => commitAccount(tr, input, acc));
      else if (isSuggestFor(input) || String(input.value).trim().length >= 2) hideSuggest();
    }

    if (tr.dataset.new === '1') return;   // 新增行等失焦再建单

    const id = tr.dataset.id;
    if (!id) return;
    if (ACCOUNT_FIELDS.includes(field)) return;   // 账户格等解析完再提交
    h.onEdit(id, field, input.value);
  });

  /* ---------- 空格 / 回车 / 聚焦 ---------- */
  tbody.addEventListener('keydown', (ev) => {
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT' || !input.dataset.field) return;
    const tr = input.closest('tr');
    if (!tr) return;
    const field = input.dataset.field;

    // 账户格：空格当成"确认简码"，不输入空格
    if (ACCOUNT_FIELDS.includes(field) && ev.key === ' ') {
      ev.preventDefault();
      resolveField(tr, input);
      return;
    }

    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (ACCOUNT_FIELDS.includes(field)) resolveField(tr, input);
      input.blur();
      h.onCommit();
    }
  });

  // 聚焦即全选（金额/日期）；账户格给出当前候选
  tbody.addEventListener('focusin', (ev) => {
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT') return;
    const f = input.dataset.field;
    if (f === 'amount' || f === 'date') {
      try { input.select(); } catch (e) {}
    }
  });

  // 失焦：账户格先解析；新增行有内容就建单
  tbody.addEventListener('focusout', (ev) => {
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT' || !input.dataset.field) return;
    const tr = input.closest('tr');
    if (!tr) return;

    if (ACCOUNT_FIELDS.includes(input.dataset.field)) {
      resolveField(tr, input);
    }

    // 备注简码：内容正好是备注表的简码 → 自动代入文本（只作用于备注栏）
    if (input.dataset.field === 'note' && h.resolveNote) {
      const text = h.resolveNote(input.value);
      if (text && text !== input.value) {
        input.value = text;
        if (tr.dataset.id && tr.dataset.new !== '1') h.onEdit(tr.dataset.id, 'note', text);
      }
    }

    if (tr.dataset.new !== '1') return;

    // 延迟一点，让"点候选"的 click 先发生
    setTimeout(() => {
      if (!document.body.contains(tr)) return;
      if (isSuggestFor(input)) return;
      const fields = {};
      tr.querySelectorAll('input[data-field]').forEach((el) => {
        const v = String(el.value || '').trim();
        if (v) fields[el.dataset.field] = v;
      });
      if (!fields.amount && !fields.from && !fields.to) return;
      h.onCreate(fields);
    }, 120);
  });

  /* ---------- 删除 ---------- */
  tbody.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.nt-cell-action button');
    if (!btn) return;
    const tr = btn.closest('tr');
    if (!tr || !tr.dataset.id) return;
    h.onDelete(tr.dataset.id);
  });

  /* ---------- 内部 ---------- */

  /** 把账户格里的输入解析成账户，回填真实名，并把 id 交给调用方 */
  function resolveField(tr, input) {
    const res = h.parseAccount ? h.parseAccount(input.value) : { acc: null, display: input.value };
    if (res.acc) {
      input.value = res.display;
      if (tr.dataset.new !== '1' && tr.dataset.id) {
        h.onEdit(tr.dataset.id, input.dataset.field, res.display, res.acc.id);
      }
    }
    hideSuggest();
  }

  /** 点了候选：填名字，并把 id 交出去 */
  function commitAccount(tr, input, acc) {
    input.value = acc.name;
    if (tr.dataset.new !== '1' && tr.dataset.id) {
      h.onEdit(tr.dataset.id, input.dataset.field, acc.name, acc.id);
    }
    hideSuggest();
  }
}
