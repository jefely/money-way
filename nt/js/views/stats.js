// 界面：统计 tab
/**
 * 统计视图（分类 / 汇总）
 * 层：第五层 · UI
 *
 * 数据全部来自 core/ledger-stats.js（纯函数）；
 * 本文件只负责「取范围 → 调核心 → 套模板 → 写页脚」，不算钱。
 */

import { accountRows } from '../core/ledger-stats.js';
import { mountCellRange } from '../ui/cell-range.js';
import { paintCategoryPanels, bindCategoryQueries } from '../ui/stats-category.js';
import { mountStatsSplit } from '../ui/stats-split.js';
import { renderSummaryTables } from '../ui/stats-summary-tables.js';

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
  bindCategoryQueries(grid, () => render(), () => ctx.getState());
  // 左栏（6 大分类）与右侧查询区之间的分界条：拖它调整左栏宽度
  mountStatsSplit(section);

  // 统计表是只读的：框选只提供「复制」（同时进系统剪贴板，方便贴到 Excel）
  mountCellRange(summaryWrap, {
    paste: 'off',
    onNotice: (t) => ctx.setFooter(t),
  });

  /* ---------- 渲染 ---------- */

  function render() {
    const state = ctx.getState();
    const range = currentRange();
    renderPills();

    if (sel.cap === 'summary') renderSummary(state, range);
    else renderCategory(state, range);
  }

  function renderCategory(state, range) {
    if (grid) grid.hidden = false;
    if (summaryWrap) summaryWrap.hidden = true;
    const r = paintCategoryPanels(grid, state, range);
    const q = r.query ? ` · 分类查询「${r.query}」${r.matches} 笔` : '';
    ctx.setFooter(`${r.categories} 个分类 · ${visibleCount(state)} 个节点 · ${scopeLabel()}${q}`);
  }

  function renderSummary(state, range) {
    if (grid) grid.hidden = true;
    if (summaryWrap) summaryWrap.hidden = false;
    // 按节点类型分组画：每组一张小表，类型名做成合计行左侧的标签，
    // 列 = 节点名称 | 序号 | 分类 | 转出 | 转入 | 本期余额 | 历史 ×3 | 期初余额
    const rows = accountRows(state.accounts, state.transactions, range);
    renderSummaryTables(summaryHost, rows);
    ctx.setFooter(`${visibleCount(state)} 个节点 · ${scopeLabel()}`);
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
