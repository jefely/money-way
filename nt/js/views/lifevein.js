// 界面：LifeVein tab（上下滑动的统计展示页）
/**
 * LifeVein 视图（页面装配）
 * 层：第五层 · UI
 *
 * 只做三件事：把 core/lifevein-model.js 的行画成气泡、上下滚动、分批加载更早的。
 * 不算钱 —— 合计、余额、方向全在 core 里算好。
 */

import { buildLifeVein } from '../core/lifevein-model.js';
import { money, moneyAlways } from '../core/format.js';

/** 一次画多少条；点「更早」再往前加一批 */
const CHUNK = 100;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** 2026-11-08 → 11-08（气泡旁只放月日，年份在合计区） */
function dateText(iso) {
  const s = String(iso || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(5) : s;
}

/** 泡的大小档：这一笔金额越大，泡越大（余额在泡外，不参与） */
function sizeOf(amount) {
  const n = Math.abs(Number(amount) || 0);
  if (n >= 1000) return 'l';
  if (n >= 100) return 'm';
  return 's';
}

function signOf(dir) {
  if (dir === 'in') return '+';
  if (dir === 'transfer') return '⇄';
  return '−';
}

function otherText(dir, name) {
  if (dir === 'in') return '← ' + name;
  if (dir === 'transfer') return '⇄ ' + name;
  return '→ ' + name;
}

export function mountLifeVein(section, ctx) {
  const listEl = section.querySelector('[data-lv-list]');
  const scrollEl = section.querySelector('[data-lv-scroll]');
  const totalsEl = section.querySelector('[data-lv-totals]');
  const moreBtn = section.querySelector('[data-lv-more]');

  let rows = [];
  let shown = 0;

  function rowEl(row) {
    const li = el('li', 'nt-lv-row');
    li.dataset.dir = row.dir;
    li.dataset.size = sizeOf(row.amount);
    li.title = [row.date, row.note].filter(Boolean).join(' ');

    li.appendChild(el('span', 'nt-lv-date', dateText(row.date)));
    li.appendChild(el('span', 'nt-lv-dot'));

    const bubble = el('span', 'nt-lv-bubble');
    if (row.isOpening) bubble.appendChild(el('span', 'nt-lv-tag', '期初'));
    bubble.appendChild(el('span', 'nt-lv-name', row.nodeName || '（缺节点）'));
    bubble.appendChild(el('span', 'nt-lv-amt', signOf(row.dir) + money(row.amount)));
    if (row.otherName) {
      bubble.appendChild(el('span', 'nt-lv-other', otherText(row.dir, row.otherName)));
    }
    li.appendChild(bubble);

    li.appendChild(el('span', 'nt-lv-bal', '余额 ' + moneyAlways(row.balance)));
    return li;
  }

  /**
   * 画当前窗口里的行。
   * keepScroll = true 时（加载更早那批）保持视口不动：高度差补到 scrollTop 上，
   * 否则每加载一批，用户正在看的那一条就会往下跳。
   */
  function paint(keepScroll) {
    const prevH = scrollEl.scrollHeight;
    const prevTop = scrollEl.scrollTop;
    listEl.textContent = '';

    if (!rows.length) {
      listEl.appendChild(el('li', 'nt-lv-empty', '还没有中域（资产 / 负债）的流水'));
      moreBtn.hidden = true;
      return;
    }

    const start = Math.max(0, rows.length - shown);
    for (let i = start; i < rows.length; i += 1) listEl.appendChild(rowEl(rows[i]));

    moreBtn.hidden = start <= 0;
    moreBtn.textContent = `更早的 ${start} 条`;

    if (keepScroll) scrollEl.scrollTop = prevTop + (scrollEl.scrollHeight - prevH);
    else scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  function render() {
    const model = buildLifeVein(ctx.getState());
    rows = model.rows;
    totalsEl.textContent = '收入 ' + moneyAlways(model.totals.income)
      + ' · 支出 ' + moneyAlways(model.totals.expense)
      + ' · 净 ' + moneyAlways(model.totals.net);
    shown = Math.min(rows.length, CHUNK);
    paint(false);

    ctx.setFooter(rows.length
      ? `LifeVein · ${rows.length} 个泡 · ${dateText(model.span.from)} ~ ${dateText(model.span.to)}`
      : 'LifeVein · 等第一笔资产 / 负债的流水');
  }

  moreBtn.addEventListener('click', () => {
    shown = Math.min(rows.length, shown + CHUNK);
    paint(true);
  });

  return { render };
}
