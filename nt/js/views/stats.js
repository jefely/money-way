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
import { saveSharedWidth } from '../ui/col-widths.js';
import { paintCategoryPanels, paintDetailPanel, bindStatsDetail } from '../ui/stats-category.js';
import { mountStatsSplit } from '../ui/stats-split.js';
import { mountStatsSwipe } from '../ui/stats-swipe.js';
import { loadStatOrder, moveStatUp } from '../ui/stat-order.js';
import { renderStatTables } from '../ui/stats-group-tables.js';
import { mountStatsNotes } from '../ui/stats-notes.js';

const pad = (n) => String(n).padStart(2, '0');

/**
 * 分类 → 色号。和 graph/mw-slot-calculator 的 colorList 同一套规则：
 * 分类名按字符排序后依次取色，所以同一个分类永远同一个颜色。
 * （那边取的是「当前范围内出现过的分类」，这里取「全部账户的分类」——
 *   范围选「全部」时两者完全一致，平时颜色也不会随月份跳。）
 */
function colorIndexOf(accounts) {
  const cats = [...new Set((accounts || [])
    .filter((a) => a && !a.isHidden)
    .map((a) => String(a.category || '').trim())
    .filter(Boolean))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return new Map(cats.map((c, i) => [c, i]));
}

export function mountStats(section, ctx) {
  const now = new Date();
  const sel = {
    cap: 'category',
    // 窄屏一次只显示一栏：'list' = 六类表，'detail' = 详情（见 stats.css 的 data-pane）
    pane: 'list',
    scope: 'month',
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    start: '',
    end: '',
  };

  const caps = section.querySelector('#nt-stats-caps');
  const scopeCaps = section.querySelector('#nt-stats-scope');
  const yearInp = section.querySelector('#nt-stats-year');
  const pills = section.querySelector('#nt-stats-pills');
  const grid = section.querySelector('#nt-stats-grid');
  const summaryWrap = section.querySelector('#nt-stats-summary-wrap');
  const notesPane = section.querySelector('#nt-stats-notes');
  const renderNotes = notesPane ? mountStatsNotes(ctx, notesPane, currentRange) : () => {};
  const summaryHost = section.querySelector('#nt-stats-sum');

  bindCaps();
  bindScope();
  // 手机左右滑动。两个方向走的是**两条不同的路**（用户 2026-11 定义）：
  //
  //   左滑（从右往左，深入链）：
  //     分类主页 → 分类详情 → 节点主页 → 节点详情 → 分类主页 …
  //   右滑（从左往右）：
  //     分类主页 ⇄ 节点主页 直接对跳；详情页则退回**自己的**主页
  //
  // 右滑那两条主页之间的对跳是用户明确要求的；「详情 → 自己的主页」是补的 ——
  // 不补的话详情页右滑就没有反应，手感像是坏了。
  const SWIPE_LEFT = {
    'category:list': { cap: 'category', pane: 'detail' },
    'category:detail': { cap: 'summary', pane: 'list' },
    'summary:list': { cap: 'summary', pane: 'detail' },
    'summary:detail': { cap: 'category', pane: 'list' },
  };
  const SWIPE_RIGHT = {
    'category:list': { cap: 'summary', pane: 'list' },
    'summary:list': { cap: 'category', pane: 'list' },
    'category:detail': { cap: 'category', pane: 'list' },
    'summary:detail': { cap: 'summary', pane: 'list' },
  };

  mountStatsSwipe(section, (dir) => {
    const key = sel.cap + ':' + sel.pane;
    const next = (dir > 0 ? SWIPE_LEFT : SWIPE_RIGHT)[key];
    if (!next) return;
    sel.pane = next.pane;
    setCap(next.cap, true);
  });
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
    applyPane();

    const boxes = sameCap ? [...section.querySelectorAll('.nt-tablewrap')] : [];
    const saved = boxes.map((b) => [b.scrollTop, b.scrollLeft]);
    const gridEl = section.querySelector('#nt-stats-grid');
    const gridLeft = gridEl ? gridEl.scrollLeft : 0;

    const state = ctx.getState();
    const range = currentRange();
    renderPills();

    if (notesPane) notesPane.hidden = sel.cap !== 'notes';
    if (sel.cap === 'notes') { if (grid) grid.hidden = true; if (summaryWrap) summaryWrap.hidden = true; renderNotes(); }
    else if (sel.cap === 'summary') renderSummary(state, range);
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

  /** 某张小表的 ▲：往上移一位后重画（顺序存 ui/stat-order.js） */
  function reorderUp(type) {
    if (!moveStatUp(type)) return;
    render();
  }

  function renderCategory(state, range) {
    if (grid) grid.hidden = false;
    if (summaryWrap) summaryWrap.hidden = true;
    const r = paintCategoryPanels(grid, state, range, {
      onResize: (w) => saveSharedWidth(ctx, '分类统计/列宽', w),
      order: loadStatOrder(),
      onMoveUp: reorderUp,
    });
    const d = paintDetailPanel(grid, state, range);
    const q = d.query ? ` · 详情「${d.query}」${d.matches} 笔` : '';
    ctx.setFooter(`${r.categories} 个分类 · ${visibleCount(state)} 个节点 · ${scopeLabel()}${q}`);
  }

  function renderSummary(state, range) {
    if (grid) grid.hidden = true;
    if (summaryWrap) summaryWrap.hidden = false;
    // 节点视图：布局逻辑完全沿用分类表 —— 左 6 类节点表 + 右「详情」。
    // 第一列用**节点专用**的宽度参数（节点名普遍比分类名长）。
    const groups = nodeStats(state.accounts, state.transactions, range);
    const n = renderStatTables(summaryHost, groups, {
      firstCol: '节点',
      kind: 'node',
      table: 'node',
      empty: '还没有节点',
      onResize: (w) => saveSharedWidth(ctx, '节点统计/列宽', w),
      order: loadStatOrder(),
      onMoveUp: reorderUp,
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
    if (yearInp) {
      yearInp.hidden = sel.scope !== 'month';
      if (sel.scope === 'month') yearInp.value = String(sel.year);
    }
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
      // 两个日期框中间加一个「至」（用户 2026-11-07）：光并排两个日期框看不出是区间
      const sep = document.createElement('span');
      sep.className = 'nt-pills-sep';
      sep.textContent = '至';
      pills.appendChild(sep);
      pills.appendChild(dateInput(sel.end, (v) => { sel.end = v; render(); }));
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'nt-btn nt-btn-sm nt-pills-clear';
      clear.textContent = '清空';
      clear.addEventListener('click', () => { sel.scope = 'all'; render(); });
      pills.appendChild(clear);
    }
  }

  if (yearInp) {
    yearInp.addEventListener('change', () => {
      const n = parseInt(yearInp.value, 10);
      if (Number.isFinite(n) && n > 1900 && n < 2200) { sel.year = n; render(); }
      else yearInp.value = String(sel.year);
    });
  }

  /* ---------- 事件 ---------- */

  function bindCaps() {
    caps.addEventListener('click', (ev) => {
      const b = ev.target.closest('.nt-cap');
      if (!b) return;
      setCap(b.getAttribute('data-cap'));
    });
  }

  /** 切到某个视图（分类 / 节点）：更新胶囊选中态后重画。滑动切换也走这里。
   *  @param {string} name 'category' | 'summary'
   *  @param {boolean} [keepPane] 保留当前「表 / 详情」那一栏（滑动用）；
   *         点胶囊切视图时默认回到「表」。 */
  function setCap(name, keepPane) {
    if (!name) return;
    sel.cap = name;
    if (!keepPane) sel.pane = 'list';
    for (const x of caps.querySelectorAll('.nt-cap')) {
      x.setAttribute('aria-selected', x.getAttribute('data-cap') === name ? 'true' : 'false');
    }
    render();
  }

  /** 窄屏的「现在显示表还是详情」写到 grid 上，由 CSS 的 data-pane 规则消费 */
  function applyPane() {
    for (const g of section.querySelectorAll('.nt-stats-grid')) g.dataset.pane = sel.pane;
    slidePane();
  }

  /**
   * 换页时的滑动效果（用户 2026-11：「增加切换屏幕的滑动效果」）。
   *
   * 窄屏是**一次只显示一栏**（stats.css 的 data-pane 规则），换页就是 display 切换 ——
   * 以前是硬切，看起来像闪一下。这里给新出现的那一栏一个 200ms 的横向滑入：
   * 从行进方向的一侧进来，方向由「四页的固定顺序」决定，不看是点按钮还是搓的。
   */
  const PANE_ORDER = ['category:list', 'category:detail', 'summary:list', 'summary:detail'];
  let lastPaneKey = sel.cap + ':' + sel.pane;

  function slidePane() {
    const key = sel.cap + ':' + sel.pane;
    if (key === lastPaneKey) return;
    const from = PANE_ORDER.indexOf(key) > PANE_ORDER.indexOf(lastPaneKey) ? 1 : -1;
    lastPaneKey = key;

    const host = sel.cap === 'summary' ? summaryWrap : grid;
    if (!host) return;
    const pane = sel.pane === 'detail'
      ? host.querySelector('.nt-stats-panel:not([data-kind="groups"])')
      : host.querySelector('.nt-stats-panel[data-kind="groups"]');
    if (!pane || typeof pane.animate !== 'function') return;
    pane.animate(
      [
        { transform: 'translateX(' + (from > 0 ? 16 : -16) + '%)', opacity: 0.2 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: 200, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
  }

  function bindScope() {
    scopeCaps.addEventListener('click', (ev) => {
      const b = ev.target.closest('.nt-cap');
      if (!b) return;
      sel.scope = b.getAttribute('data-scope');
      if (sel.scope === 'range' && (!sel.start || !sel.end)) {
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        sel.start = `${y}-${pad(m)}-01`;
        sel.end = monthEnd(y, m);
      }
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
