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

/** 日期沿用流水表的 260801（YYMMDD）格式 */
const d6 = (s) => String(s || '').replace(/-/g, '').slice(2, 8);

/** 左边小表第一列（分类/关键字）的宽度：和节点统计表一样可拖，存本地 */
function savedColW() {
  try {
    const n = Number(localStorage.getItem('nt_note_col_w'));
    return Number.isFinite(n) && n >= 40 ? Math.round(n) : 92;
  } catch (e) {
    return 92;
  }
}

/** 备注查询各列宽度（照搬节点分类列表：每列都能拖，存本地） */
function savedDetailCols() {
  try {
    const a = JSON.parse(localStorage.getItem('nt_note_detail_cols') || 'null');
    if (Array.isArray(a) && a.length === 6 && a.every((n) => Number.isFinite(Number(n)) && Number(n) >= 40)) return a.map(Number);
  } catch (e) { /* 忽略 */ }
  return [44, 84, 108, 118, 96, 180];
}

/** 备注统计页挂载；返回统计页每次重画时调用的 render */
export function mountStatsNotes(ctx, pane, getRange) {
  let picked = null; // {kind:'type'|'keyword', value}
  let firstW = savedColW();
  let detailCols = savedDetailCols();

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
  input.placeholder = '点左侧分类/关键字，或输入关键字/简码';
  input.setAttribute('aria-label', '备注查询');
  const clearBtn = el('button', 'nt-btn nt-btn-sm', '清空');
  clearBtn.type = 'button';
  head.appendChild(title);
  head.appendChild(input);
  head.appendChild(clearBtn);
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
    if (picked && picked.kind === kind && picked.value === value) {
      picked = null; input.value = '';
    } else {
      picked = { kind, value }; input.value = value;
    }
    render();
  }

  function table(titleText, rows, nameOf, kind) {
    const sec = el('section', 'nt-note-stat');
    sec.appendChild(el('h4', 'nt-note-stat-title', titleText));
    const tableEl = el('table', 'nt-table nt-note-stat-table');
    const cg = el('colgroup');
    const c0 = el('col'); c0.style.width = firstW + 'px'; cg.appendChild(c0);
    for (let i = 0; i < 3; i += 1) cg.appendChild(el('col'));
    tableEl.appendChild(cg);
    const thead = el('thead');
    const hr = el('tr');
    const heads = [kind === 'keyword' ? '关键字' : '分类', '期初累计', '本期发生', '期末累计'];
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
      if (String(t.noteKeyword || '').includes(kw) || String(t.note || '').includes(kw)) return true;
      const note = (state.notes || []).find((n) => String(n.keyword || '').trim() === String(t.noteKeyword || '').trim());
      return !!note && String(note.code || '').toLowerCase().startsWith(kw.toLowerCase());
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
    const tableEl = el('table', 'nt-table nt-table-stats nt-note-detail-table');
    const dcg = el('colgroup');
    const widths = detailCols.slice();
    for (let i = 0; i < 6; i += 1) {
      const c = el('col');
      if (i < 5) c.style.width = widths[i] + 'px';
      dcg.appendChild(c);
    }
    tableEl.appendChild(dcg);
    const thead = el('thead');
    const hr = el('tr');
    for (const h of ['序', '日期', '转出', '转入', '金额', '备注']) hr.appendChild(el('th', 'nt-th', h));
    thead.appendChild(hr);
    tableEl.appendChild(thead);
    // 每列都能拖宽（照搬节点分类列表）：标题右缘拖动，宽度存本地
    [...hr.children].forEach((th, i) => {
      th.appendChild(el('span', 'nt-col-handle'));
      th.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0 && ev.pointerType === 'mouse') return;
        const r = th.getBoundingClientRect();
        if (ev.clientX < r.right - 14 || ev.clientX > r.right + 2) return;
        ev.preventDefault(); ev.stopPropagation();
        const startX = ev.clientX;
        const startW = Math.round(r.width);
        const col = dcg.children[i];
        const move = (e2) => {
          widths[i] = Math.max(40, Math.round(startW + e2.clientX - startX));
          col.style.width = widths[i] + 'px';
        };
        const up = () => {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          try { localStorage.setItem('nt_note_detail_cols', JSON.stringify(widths)); } catch (e) { /* 忽略 */ }
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
    });
    const tb = el('tbody');
    const acc = new Map((ctx.getState().accounts || []).map((a) => [a.id, a.name || '']));
    list.forEach((t, i) => {
      const tr = el('tr', 'nt-row');
      tr.appendChild(el('td', 'nt-cell', String(t.seq || i + 1)));
      tr.appendChild(el('td', 'nt-cell', d6(t.date)));
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
  clearBtn.addEventListener('click', () => {
    picked = null;
    input.value = '';
    render();
  });

  return function renderNotes() {
    pane.hidden = false;
    render();
    ctx.setFooter('备注统计 · 左边两块小表，点分类/关键字看流水');
  };
}
