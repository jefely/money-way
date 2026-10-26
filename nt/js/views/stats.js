/**
 * 统计视图（分类 / 汇总）
 * 层：第五层 · UI
 *
 * 数据全部来自 core/ledger-stats.js（纯函数）；
 * 本文件只负责「取范围 → 调核心 → 套模板 → 写页脚」，不算钱。
 */

import { categoryGroups, accountRows } from '../core/ledger-stats.js';
import { buildHead, renderMixed, renderEmpty } from '../ui/table.js';
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
  const info = section.querySelector('#nt-stats-info');
  const thead = section.querySelector('#nt-stats-head');
  const body = section.querySelector('#nt-stats-body');

  bindCaps();
  bindScope();

  /* ---------- 渲染 ---------- */

  function render() {
    const state = ctx.getState();
    const range = currentRange();
    info.textContent = scopeLabel();
    renderPills();

    if (sel.cap === 'summary') renderSummary(state, range);
    else renderCategory(state, range);
  }

  function renderCategory(state, range) {
    buildHead(thead, [
      { label: '序', cls: 'nt-c-seq' },
      { label: '分类' },
      { label: '当前结余', cls: 'nt-c-num' },
      { label: '转出', cls: 'nt-c-num' },
      { label: '转入', cls: 'nt-c-num' },
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
            balance: money(c.balance),
            out: money(c.periodOut),
            iin: money(c.periodIn),
          },
        });
      }
      items.push({
        tplId: 'tpl-stat-total',
        data: {
          label: `${g.type}合计`,
          balance: money(g.total.balance),
          out: money(g.total.periodOut),
          iin: money(g.total.periodIn),
        },
      });
    }

    if (!items.length) renderEmpty(body, '这段时间没有数据', 5);
    else renderMixed(body, items);

    ctx.setFooter(`${catCount} 个分类 · ${visibleCount(state)} 个账户 · ${scopeLabel()}`);
  }

  function renderSummary(state, range) {
    buildHead(thead, [
      { label: '序', cls: 'nt-c-seq' },
      { label: '类型', cls: 'nt-c-type' },
      { label: '分类', cls: 'nt-c-cat' },
      { label: '账户名称' },
      { label: '当前结余', cls: 'nt-c-num' },
      { label: '转出', cls: 'nt-c-num' },
      { label: '转入', cls: 'nt-c-num' },
      { label: '转出历史', cls: 'nt-c-num' },
      { label: '转入历史', cls: 'nt-c-num' },
    ]);

    const rows = accountRows(state.accounts, state.transactions, range);
    const items = rows.map((row, i) => ({
      tplId: 'tpl-stat-account',
      data: {
        seq: i + 1,
        type: row.acc.type,
        category: row.acc.category || '—',
        name: row.acc.name,
        balance: money(row.s.balance),
        out: money(row.s.periodOut),
        iin: money(row.s.periodIn),
        histOut: money(row.s.historyOut),
        histIn: money(row.s.historyIn),
      },
    }));

    if (!items.length) renderEmpty(body, '还没有账户', 9);
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
