// 界面：统计 tab
/**
 * 统计视图（分类 / 汇总）
 * 层：第五层 · UI
 *
 * 数据全部来自 core/ledger-stats.js（纯函数）；
 * 本文件只负责「取范围 → 调核心 → 套模板 → 写页脚」，不算钱。
 */

import { categoryGroups, accountRows } from '../core/ledger-stats.js';
import { buildHead, renderMixed, renderEmpty } from '../ui/table.js';
import { mountCellRange } from '../ui/cell-range.js';
import { money } from '../core/format.js';

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
  const thead = section.querySelector('#nt-stats-head');
  const body = section.querySelector('#nt-stats-body');
  // 分类视图 8 列、汇总视图 10 列，列宽完全不同 —— 用类区分，别让 nth-child 互相踩
  const table = section.querySelector('#nt-stats-table');

  bindCaps();
  bindScope();

  // 统计表是只读的：框选只提供「复制」（同时进系统剪贴板，方便贴到 Excel）
  mountCellRange(section.querySelector('#nt-stats-table'), {
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
    if (table) { table.classList.add('is-cat'); table.classList.remove('is-sum'); }

    buildHead(thead, [
      { label: '序', cls: 'nt-c-seq', col: 'seq' },
      { label: '分类', cls: 'nt-c-cat', col: 'cat' },
      { label: '转出金额', cls: 'nt-c-num', col: 'out' },
      { label: '转入金额', cls: 'nt-c-num', col: 'iin' },
      { label: '当前余额', cls: 'nt-c-num', col: 'balance' },
      { label: '历史转出', cls: 'nt-c-num', col: 'histOut' },
      { label: '历史转入', cls: 'nt-c-num', col: 'histIn' },
      { label: '历史结余', cls: 'nt-c-num', col: 'histBalance' },
    ]);

    const groups = categoryGroups(state.accounts, state.transactions, range);
    const items = [];
    let seq = 0;
    let catCount = 0;

    for (const g of groups) {
      for (const c of g.categories) {
        seq += 1;
        catCount += 1;
        items.push({
          tplId: 'tpl-stat-cat',
          data: {
            seq,
            category: c.category,
            out: money(c.periodOut),
            iin: money(c.periodIn),
            balance: money(c.balance),
            histOut: money(c.historyOut || 0),
            histIn: money(c.historyIn || 0),
            histBalance: money(c.historyBalance || 0),
          },
        });
      }
      items.push({
        tplId: 'tpl-stat-total',
        data: {
          label: `${g.type}合计`,
          out: money(g.total.periodOut),
          iin: money(g.total.periodIn),
          balance: money(g.total.balance),
          histOut: money(g.total.historyOut || 0),
          histIn: money(g.total.historyIn || 0),
          histBalance: money(g.total.historyBalance || 0),
        },
      });
    }

    if (!items.length) renderEmpty(body, '这段时间没有数据', 8);
    else renderMixed(body, items);

    ctx.setFooter(`${catCount} 个分类 · ${visibleCount(state)} 个账户 · ${scopeLabel()}`);
  }

  function renderSummary(state, range) {
    if (table) { table.classList.add('is-sum'); table.classList.remove('is-cat'); }

    // 列顺序按核对过的设计：账户名称 · 序号 · 类型 · 分类 · 转出 · 转入 · 当前余额 · 历史 ×3
    buildHead(thead, [
      { label: '账户名称', cls: 'nt-c-name', col: 'name' },
      { label: '序号', cls: 'nt-c-seq', col: 'seq' },
      { label: '类型', cls: 'nt-c-type', col: 'type' },
      { label: '分类', cls: 'nt-c-cat', col: 'cat' },
      { label: '转出金额', cls: 'nt-c-num', col: 'out' },
      { label: '转入金额', cls: 'nt-c-num', col: 'iin' },
      { label: '当前余额', cls: 'nt-c-num', col: 'balance' },
      { label: '历史转出', cls: 'nt-c-num', col: 'histOut' },
      { label: '历史转入', cls: 'nt-c-num', col: 'histIn' },
      { label: '历史结余', cls: 'nt-c-num', col: 'histBalance' },
    ]);

    const rows = accountRows(state.accounts, state.transactions, range);
    const items = rows.map((row, i) => ({
      tplId: 'tpl-stat-account',
      data: {
        name: row.acc.name,
        seq: i + 1,
        type: row.acc.type,
        category: row.acc.category || '—',
        out: money(row.s.periodOut),
        iin: money(row.s.periodIn),
        balance: money(row.s.balance),
        histOut: money(row.s.historyOut),
        histIn: money(row.s.historyIn),
        histBalance: money(row.s.historyBalance),
      },
    }));

    if (!items.length) renderEmpty(body, '还没有账户', 10);
    else renderMixed(body, items);

    ctx.setFooter(`${visibleCount(state)} 个账户 · ${scopeLabel()}`);
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
