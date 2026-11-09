// 界面：统计页第三块「备注」——左两表 + 右备注查询（点分类/关键字出流水）
/**
 * 备注统计页
 * 层：第五层 · UI
 *
 * 用户 2026-11-09：布局照节点统计页做两块 ——
 *   · 左边两块小表：备注分类（分类/期初/本期流入/本期流出/期末）、备注（关键字/同四列）；
 *   · 右边是「备注查询」：点左边任一行（分类或关键字），列出对应流水（序/日期/转出/转入/金额/备注）；
 *   · 日期筛选沿用统计页的 range；上方输入框按关键字/备注内容过滤右边。
 */

import { noteBalances, rollupBalancesByType } from '../core/note-stats.js';
import { statAmount, money } from '../core/format.js';
import { mountStatsSplit } from './stats-split.js';
import { mountStatColResize } from './stat-resize.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/** 左边小表第一列（分类/关键字）的宽度：和节点统计表一样可拖，存本地 */
function savedColW() {
  try {
    const n = Number(localStorage.getItem('nt_note_col_w'));
    return Number.isFinite(n) && n >= 40 ? Math.round(n) : 92;
  } catch (e) {
    return 92;
  }
}

/** 备注统计页挂载；返回统计页每次重画时调用的 render */
export function mountStatsNotes(ctx, pane, getRange) {
  let picked = null; // {kind:'type'|'keyword', value}
  let firstW = savedColW();

  pane.textContent = '';
  const grid = el('div', 'nt-stats-grid');
  grid.dataset.pane = 'list';
  const left = el('section', 'nt-stats-panel');
  left.dataset.kind = 'groups';
  const right = el('section', 'nt-stats-panel nt-stats-panel-query');
  const head = el('div', 'nt-stats-panel-head nt-stats-panel-head-query');
  const title = el('b', '', '备注查询');
  const input = el('input', 'nt-stats-query-input');
  input.type = 'search';
  input.placeholder = '点左侧分类/关键字，或输入关键字';
  input.setAttribute('aria-label', '备注查询');
  head.appendChild(title);
  head.appendChild(input);
  const wrap = el('div', 'nt-tablewrap nt-note-detail-wrap');
  const body = el('div', 'nt-note-detail');
  wrap.appendChild(body);
  right.appendChild(head);
  right.appendChild(wrap);
  grid.appendChild(left);
  grid.appendChild(right);
  pane.appendChild(grid);
  // 左/右分栏拖动：和节点统计页同一个统计分栏（共用 --nt-stats-left-w）
  mountStatsSplit(pane);

  function range() {
    return getRange ? getRange() : null;
  }

  function pick(kind, value) {
    picked = picked && picked.kind === kind && picked.value === value ? null : { kind, value };
    render();
  }

  function table(titleText, rows, nameOf, kind) {
    const sec = el('section', 'nt-note-stat');
    sec.appendChild(el('h4', 'nt-note-stat-title', titleText));
    const tableEl = el('table', 'nt-table nt-note-stat-table');
    const cg = el('colgroup');
    const c0 = el('col'); c0.style.width = firstW + 'px'; cg.appendChild(c0);
    for (let i = 0; i < 4; i += 1) cg.appendChild(el('col'));
    tableEl.appendChild(cg);
    const thead = el('thead');
    const hr = el('tr');
    const heads = [kind === 'keyword' ? '关键字' : '分类', '期初余额', '本期流出', '期末余额'];
    heads.forEach((h, i) => {
      const th = el('th', 'nt-th', h);
      if (i === 0) th.dataset.col = 'cat';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tableEl.appendChild(thead);
    mountStatColResize(tableEl, {
      onResize: (w) => {
        firstW = Math.round(w);
        try { localStorage.setItem('nt_note_col_w', String(firstW)); } catch (e) { /* 忽略 */ }
      },
    });
    const tb = el('tbody');
    for (const r of rows) {
      const tr = el('tr', 'nt-row' + (picked && picked.kind === kind && picked.value === nameOf(r) ? ' nt-note-picked' : ''));
      const name = el('td', 'nt-cell nt-cell-pick', nameOf(r));
      tr.appendChild(name);
      for (const v of [r.opening, r.decrease, r.end]) {
        tr.appendChild(el('td', 'nt-cell nt-cell-num' + (Math.abs(Number(v) || 0) < 0.05 ? ' nt-cell-zero' : ''), statAmount(Number(v) || 0)));
      }
      tr.addEventListener('click', () => pick(kind, nameOf(r)));
      tb.appendChild(tr);
    }
    tableEl.appendChild(tb);
    sec.appendChild(tableEl);
    return sec;
  }

  function detailRows() {
    const state = ctx.getState();
    const kw = String(input.value || '').trim();
    const rows = (state.transactions || []).filter((t) => {
      if (!t || !(Math.abs(Number(t.amount) || 0) > 0)) return false;
      const r = range();
      if (r && r.start && String(t.date || '') < r.start) return false;
      if (r && r.end && String(t.date || '') > r.end) return false;
      if (picked) {
        if (picked.kind === 'keyword') return String(t.noteKeyword || '') === picked.value;
        const typeOf = new Map((state.notes || []).map((n) => [String(n.keyword || '').trim(), String(n.type || '').trim()]));
        return (typeOf.get(String(t.noteKeyword || '').trim()) || '（未设分类）') === picked.value;
      }
      if (!kw) return false;
      return String(t.noteKeyword || '').includes(kw) || String(t.note || '').includes(kw);
    });
    return rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }

  function render() {
    const rows = noteBalances(ctx.getState(), range());
    left.textContent = '';
    if (!rows.length) {
      left.appendChild(el('p', 'nt-sync-hint nt-imp-sub', '这个日期范围内还没有带金额的备注。'));
    } else {
      left.appendChild(table('备注分类', rollupBalancesByType(rows), (r) => r.label, 'type'));
      left.appendChild(table('备注', rows, (r) => r.keyword, 'keyword'));
    }

    body.textContent = '';
    const list = detailRows();
    if (!list.length) {
      body.appendChild(el('p', 'nt-sync-hint nt-imp-sub', picked ? '没有匹配的流水。' : '点左侧的备注分类或关键字，查看对应流水。'));
      return;
    }
    const tableEl = el('table', 'nt-table nt-note-detail-table');
    const thead = el('thead');
    const hr = el('tr');
    for (const h of ['序', '日期', '转出', '转入', '金额', '备注']) hr.appendChild(el('th', '', h));
    thead.appendChild(hr);
    tableEl.appendChild(thead);
    const tb = el('tbody');
    const acc = new Map((ctx.getState().accounts || []).map((a) => [a.id, a.name || '']));
    list.forEach((t, i) => {
      const tr = el('tr', 'nt-row');
      tr.appendChild(el('td', 'nt-cell', String(t.seq || i + 1)));
      tr.appendChild(el('td', 'nt-cell', String(t.date || '')));
      tr.appendChild(el('td', 'nt-cell', acc.get(t.from_id) || ''));
      tr.appendChild(el('td', 'nt-cell', acc.get(t.to_id) || ''));
      tr.appendChild(el('td', 'nt-cell nt-cell-num', money(Number(t.amount) || 0)));
      tr.appendChild(el('td', 'nt-cell', String(t.note || t.noteKeyword || '')));
      tb.appendChild(tr);
    });
    tableEl.appendChild(tb);
    body.appendChild(tableEl);
  }

  input.addEventListener('input', () => {
    picked = null;
    render();
  });

  return function renderNotes() {
    pane.hidden = false;
    render();
    ctx.setFooter('备注统计 · 左边两块小表，点分类/关键字看流水');
  };
}
