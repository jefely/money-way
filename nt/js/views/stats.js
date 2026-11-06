// 界面：统计 tab
/**
 * 统计视图（分类 / 汇总）
 * 层：第五层 · UI
 *
 * 数据全部来自 core/ledger-stats.js（纯函数）；
 * 本文件只负责「取范围 → 调核心 → 套模板 → 写页脚」，不算钱。
 */

import { nodeStats } from '../core/stats-panels.js';
import { mountCellRange } from '../ui/cell-range.js';
import { paintCategoryPanels, paintDetailPanel, bindStatsDetail } from '../ui/stats-category.js';
import { mountStatsSplit } from '../ui/stats-split.js';
import { renderStatTables } from '../ui/stats-group-tables.js';

const pad = (n) => String(n).padStart(2, '0');

export function mountStats(section, ctx) {
  const now = new Date();
  const sel = {
    cap: 'category',
    scope: 'month',
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    start: '',
    end: '',
  };

  const caps = section.querySelector('#nt-stats-caps');
  const scopeCaps = section.querySelector('#nt-stats-scope');
  const pills = section.querySelector('#nt-stats-pills');
  const grid = section.querySelector('#nt-stats-grid');
  const summaryWrap = section.querySelector('#nt-stats-summary-wrap');
  const summaryHost = section.querySelector('#nt-stats-sum');

  bindCaps();
  bindScope();
  // 两个视图各有一块「详情」：分类按分类查、节点按节点查，绑定逻辑是同一份
  bindStatsDetail(grid, () => render(), () => ctx.getState());
  if (summaryWrap) bindStatsDetail(summaryWrap, () => render(), () => ctx.getState());
  // 左栏（6 大分类）与右侧详情区之间的分界条：拖它调整左栏宽度
  mountStatsSplit(section);

  // 统计表是只读的：框选只提供「复制」（同时进系统剪贴板，方便贴到 Excel）
  mountCellRange(summaryWrap, {
    paste: 'off',
    onNotice: (t) => ctx.setFooter(t),
  });

  /* ---------- 渲染 ---------- */

  // 切月份 / 年份 / 区间只是重画表格，不该把用户滚到的位置弹回顶部（用户 2026-11）。
  // 记下各滚动容器（三个分类面板 + 汇总）的位置，重画后放回去；
  // 切换「分类 ↔ 汇总」时容器结构本来就变了，不恢复。
  let lastCap = sel.cap;

  function render() {
    const sameCap = sel.cap === lastCap;
    lastCap = sel.cap;

    const boxes = sameCap ? [...section.querySelectorAll('.nt-tablewrap')] : [];
    const saved = boxes.map((b) => [b.scrollTop, b.scrollLeft]);
    const gridEl = section.querySelector('#nt-stats-grid');
    const gridLeft = gridEl ? gridEl.scrollLeft : 0;

    const state = ctx.getState();
    const range = currentRange();
    renderPills();

    if (sel.cap === 'summary') renderSummary(state, range);
    else renderCategory(state, range);

    if (!sameCap) return;
    const after = [...section.querySelectorAll('.nt-tablewrap')];
    after.forEach((b, i) => {
      const s = saved[i];
      if (!s) return;
      if (b.scrollTop !== s[0]) b.scrollTop = s[0];
      if (b.scrollWidth > b.clientWidth && s[1]) b.scrollLeft = s[1];
    });
    if (gridEl) gridEl.scrollLeft = gridLeft;
  }

  function renderCategory(state, range) {
    if (grid) grid.hidden = false;
    if (summaryWrap) summaryWrap.hidden = true;
    const r = paintCategoryPanels(grid, state, range);
    const d = paintDetailPanel(grid, state, range);
    const q = d.query ? ` · 详情「${d.query}」${d.matches} 笔` : '';
    ctx.setFooter(`${r.categories} 个分类 · ${visibleCount(state)} 个节点 · ${scopeLabel()}${q}`);
  }

  function renderSummary(state, range) {
    if (grid) grid.hidden = true;
    if (summaryWrap) summaryWrap.hidden = false;
    // 节点视图：布局逻辑完全沿用分类表 —— 左 6 类节点表 + 右「详情」
    const groups = nodeStats(state.accounts, state.transactions, range);
    const n = renderStatTables(summaryHost, groups, {
      firstCol: '节点',
      table: 'node',
      empty: '还没有节点',
    });
    const d = paintDetailPanel(summaryWrap, state, range);
    const q = d.query ? ` · 详情「${d.query}」${d.matches} 笔` : '';
    ctx.setFooter(`${n} 个节点 · ${scopeLabel()}${q}`);
  }

  /* ---------- 范围与标签 ---------- */

  function currentRange() {
    if (sel.scope === 'month') return { start: `${sel.year}-${pad(sel.month)}-01`, end: monthEnd(sel.year, sel.month) };
    if (sel.scope === 'year') return { start: `${sel.year}-01-01`, end: `${sel.year}-12-31` };
    if (sel.scope === 'range') return { start: sel.start, end: sel.end };
    return { start: '', end: '9999-12-31' };
  }

  function scopeLabel() {
    if (sel.scope === 'month') return `${sel.year} 年 ${sel.month} 月`;
    if (sel.scope === 'year') return `${sel.year} 年`;
    if (sel.scope === 'range') return `${sel.start || '…'} ~ ${sel.end || '…'}`;
    return '全部';
  }

  function yearOptions() {
    const state = ctx.getState();
    const set = new Set([now.getFullYear()]);
    for (const tx of state.transactions || []) {
      const y = String(tx.date || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) set.add(Number(y));
    }
    return Array.from(set).sort((a, b) => b - a);
  }

  function renderPills() {
    pills.hidden = sel.scope === 'all';
    // 三种 scope 共用这个容器，但排法不同：
    //   month → 12 个数字必须一行（CSS 按 [data-scope="month"] 排 12 列）
    //   year  → 年份个数不定，保持默认的 6 列栅格
    //   range → 两个日期输入，不能被 12 列切碎
    pills.dataset.scope = sel.scope;
    pills.textContent = '';
    if (sel.scope === 'year') {
      for (const y of yearOptions()) {
        pills.appendChild(pill(`${y}年`, y === sel.year, () => { sel.year = y; render(); }));
      }
    } else if (sel.scope === 'month') {
      for (let m = 1; m <= 12; m += 1) {
        pills.appendChild(pill(String(m), m === sel.month, () => { sel.month = m; render(); }));
      }
    } else if (sel.scope === 'range') {
      pills.appendChild(dateInput(sel.start, (v) => { sel.start = v; render(); }));
      pills.appendChild(dateInput(sel.end, (v) => { sel.end = v; render(); }));
    }
  }

  /* ---------- 事件 ---------- */

  function bindCaps() {
    caps.addEventListener('click', (ev) => {
      const b = ev.target.closest('.nt-cap');
      if (!b) return;
      sel.cap = b.getAttribute('data-cap');
      for (const x of caps.querySelectorAll('.nt-cap')) {
        x.setAttribute('aria-selected', x === b ? 'true' : 'false');
      }
      render();
    });
  }

  function bindScope() {
    scopeCaps.addEventListener('click', (ev) => {
      const b = ev.target.closest('.nt-cap');
      if (!b) return;
      sel.scope = b.getAttribute('data-scope');
      for (const x of scopeCaps.querySelectorAll('.nt-cap')) {
        x.setAttribute('aria-selected', x === b ? 'true' : 'false');
      }
      render();
    });

    const clear = section.querySelector('[data-scope="all"]');
    if (clear) {
      clear.addEventListener('click', () => {
        sel.scope = 'all';
        for (const x of scopeCaps.querySelectorAll('.nt-cap')) x.setAttribute('aria-selected', 'false');
        render();
      });
    }
  }

  return { render };
}

/* ---------- 本页私有小工具 ---------- */

function monthEnd(year, month) {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${pad(month)}-${pad(last)}`;
}

function visibleCount(state) {
  return (state.accounts || []).filter((a) => a && !a.isHidden).length;
}

function pill(label, active, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nt-pill';
  b.textContent = label;
  b.setAttribute('aria-selected', active ? 'true' : 'false');
  b.addEventListener('click', onClick);
  return b;
}

function dateInput(value, onChange) {
  const input = document.createElement('input');
  input.className = 'nt-input nt-input-sm';
  input.type = 'date';
  input.value = value || '';
  input.addEventListener('change', () => onChange(input.value));
  return input;
}
