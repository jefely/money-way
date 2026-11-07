// 界面：节点设置 / 流水记录 的宽度预算
/**
 * 两张「铺满型」表的宽度预算
 * 层：第五层 · UI（读 DOM、写变量与最小宽度；算术在 core/table-fit.js）
 *
 * 用户 2026-11 定的目标：
 *   · **节点设置**：手机上 8 列全部看见，**不许横滑** —— 内容都是定长的
 *     （简码 ≤5 位、类型 4 字、分类 4 字、期初是金额），压得下。
 *   · **流水记录**：保留左右横滑 —— 备注是不定长文本，压窄等于把内容切掉。
 *
 * 两张表同一个模型，差别只在「压」还是「滑」：
 *   表宽 = max(容器宽, 最小宽度)；放不下时节点设置压列、流水记录加最小宽度去横滑。
 *
 * 这里写的是**表元素自己**上的变量 / 最小宽度：
 *   参数（--nt-col-<表>-<列>，在 :root 或视图上）不动。面板里显示的仍然是
 *   用户自己调的值；压出来的宽度只是这一屏上的观感。拖过一次之后，
 *   参数就是量出来的 px（ui/col-widths 的 onColResize），那时总宽本来就不超，
 *   压缩自然不再触发 —— 所以「拖了又变回去」不会发生。
 */

import { TABLE_COLS, TABLE_DEFAULT_WIDTHS, parseTableWidths } from '../core/table-cols.js';
import { fitWidths, maxDragWidth } from '../core/table-fit.js';

/**
 * 节点设置：压到极限时每列的下限（14px 字号下实测的内容宽 + 内边距）。
 *   ZHG 32 · [资产] 45 · 储蓄 36 · 关键字（备注区表头）38 · 招行储7912 70
 * 只在「屏幕比参数总宽还窄」时才用到；正常屏上一律用参数值。
 */
const ACC_MINS = { code: 42, seq: 20, type: 46, cat: 38, name: 72 };
/** 节点设置：可压的列（期初吃剩余，移/删是正方形按钮） */
const ACC_SOFT = ['code', 'seq', 'type', 'cat', 'name'];
/**
 * 节点设置：期初余额列的下限。
 *
 * **这就是「拖不动」的根因**：以前这里是 86（够放 "123,456.78"），
 * 而 390 屏上五列参数已经占满 289，期初正好被压到 86 —— 余量 0，
 * 于是任何一列都只会「拖不动」。
 * 用户 2026-11-07 明确授权：**允许期初的数字因为列被拖窄而遮挡**，
 * 所以下限收到一条缝（16px），余量让给拖动。
 */
const ACC_SHARE_MIN = 16;
/** 按钮列读不到时的兜底（CSS 里是 var(--nt-row-h-accounts, 32px)） */
const BTN_FALLBACK = 32;
/**
 * 流水记录：备注列至少留多宽。
 * 这一条就是「流水表保留横滑」的全部机关：备注 120 + 其余 7 列 = 最小宽度，
 * 手机比这个窄，表就按最小宽度渲染、左右滑。
 */
const FLOW_NOTE_MIN = 120;
/** 流水记录：宽度由 CSS !important 钉死的列（固定收支 / 删除） */
const FLOW_FIXED = { fixed: 40, action: 40 };

function varOf(table, col) {
  return '--nt-col-' + table + '-' + col;
}

/**
 * 参数里的列宽（px）。
 * 从**父级**读：表元素自己身上可能有上一次压出来的覆盖，不能当成参数。
 */
function paramWidths(tableEl, id) {
  const cols = TABLE_COLS[id].cols;
  const base = parseTableWidths(TABLE_DEFAULT_WIDTHS[id], id);
  const cs = getComputedStyle(tableEl.parentElement || tableEl);
  return cols.map((c, i) => {
    const raw = parseFloat(cs.getPropertyValue(varOf(id, c)));
    return Number.isFinite(raw) && raw > 0 ? raw : (base[i] || 0);
  });
}

/** 按钮列现在的宽度（宽度 = 行高，正方形） */
function btnPx(tableEl) {
  const th = tableEl.querySelector('thead .nt-th[data-col="up"]');
  const w = th ? Math.round(th.getBoundingClientRect().width) : 0;
  return w > 0 ? w : BTN_FALLBACK;
}

/**
 * 节点设置：把五列压进一屏。
 * 参数够宽时**一个像素都不动**（返回 null → 摘掉覆盖，回到参数值）；
 * 屏比参数总宽窄时按原比例压，只在下限处兜底。
 * @param {HTMLTableElement} tableEl
 */
export function fitAccounts(tableEl) {
  if (!tableEl) return;
  const wrap = tableEl.closest('.nt-tablewrap');
  const avail = wrap ? wrap.clientWidth : 0;
  // 视图还没展开（宽度 0）—— 等 ResizeObserver 再叫一次
  if (!avail) return;

  const cols = TABLE_COLS.accounts.cols;
  const widths = paramWidths(tableEl, 'accounts');
  const list = ACC_SOFT.map((c) => widths[cols.indexOf(c)]);
  const budget = avail - btnPx(tableEl) * 2 - ACC_SHARE_MIN;
  const target = fitWidths(list, budget, ACC_MINS, ACC_SOFT);

  ACC_SOFT.forEach((c, i) => {
    const v = varOf('accounts', c);
    if (target) tableEl.style.setProperty(v, target[i] + 'px');
    else tableEl.style.removeProperty(v);
  });
}

/**
 * 流水记录：按「其余列之和 + 备注下限」写表的最小宽度。
 *
 * 量的是**当前渲染宽度**而不是参数：拖动过程中那些宽度是手指给的，
 * 每帧调一次这里，最小宽度就跟着长，备注不会被拖窄。
 */
export function fitFlow(tableEl) {
  if (!tableEl) return;
  let sum = 0;
  for (const c of TABLE_COLS.flow.cols) {
    if (c === 'note') continue;          // 备注吃剩余，不算进固定和
    if (FLOW_FIXED[c]) { sum += FLOW_FIXED[c]; continue; }
    const th = tableEl.querySelector('thead .nt-th[data-col="' + c + '"]');
    const w = th ? Math.round(th.getBoundingClientRect().width) : 0;
    sum += w > 0 ? w : 60;
  }
  tableEl.style.minWidth = Math.round(sum + FLOW_NOTE_MIN) + 'px';
}

/** 分类/节点列表：备注列在窄屏上「想要多宽」（没拖过时用这个） */
const CATQ_NOTE_MIN = 90;
/** 分类/节点列表：备注列的下限（拖到头停住，内容允许被截 —— 用户 2026-11 授权） */
const CATQ_NOTE_FLOOR = 16;
/** 分类/节点列表：前 5 列压到极限时的下限（14px 实测内容宽 + 内边距） */
const CATQ_MINS = { seq: 28, date: 52, from: 56, to: 56, amount: 52 };
/** 分类/节点列表：有独立列宽、可拖的那几列（备注吃剩余，不在此列） */
const CATQ_SOFT = ['seq', 'date', 'from', 'to', 'amount'];

/**
 * 分类/节点列表：前 5 列压进容器，**备注列吃剩余**。
 *
 * 和节点设置同一个模型，区别只在「备注要留多少」：
 * 参数里备注那一格存的就是**上次拖出来的实际宽度**（CSS 不消费它，只给这里当期望值），
 * 所以拖过一次之后，这条按「备注 = 上次的宽度」算预算 —— 五列正好放得下，
 * 不会再压一次（否则就是对用户的手势反悔）。
 * 没拖过时（参数是 0）按 90 留，先给备注一个能看的地方。
 */
export function fitCatq(tableEl) {
  if (!tableEl) return;
  const wrap = tableEl.closest('.nt-tablewrap');
  const avail = wrap ? wrap.clientWidth : 0;
  if (!avail) return;

  const cols = TABLE_COLS.catq.cols;
  const widths = paramWidths(tableEl, 'catq');
  const noteNow = widths[cols.indexOf('note')] || 0;
  const noteWant = noteNow >= 24 ? noteNow : CATQ_NOTE_MIN;
  const list = CATQ_SOFT.map((c) => widths[cols.indexOf(c)]);
  const target = fitWidths(list, avail - noteWant, CATQ_MINS, CATQ_SOFT);

  CATQ_SOFT.forEach((c, i) => {
    const v = varOf('catq', c);
    if (target) tableEl.style.setProperty(v, target[i] + 'px');
    else tableEl.style.removeProperty(v);
  });
}

/**
 * 拖动某一列时的上限（0 = 不另外限制）。
 * 节点设置 / 分类列表 / 节点列表：弹性来源都只有一列（期初余额 / 备注），
 * 拖到头 = 它到下限的那一刻；表宽不变，拖不出横滑。
 * 流水记录：备注的下限由最小宽度保证，拖动不需要额外限制（表会跟着变宽）。
 */
export function dragMaxWidth(tableEl, startW) {
  if (!tableEl) return 0;
  const absorb = tableEl.classList.contains('nt-table-accounts') ? 'opening'
    : tableEl.classList.contains('nt-table-catq') ? 'note'
      : '';
  if (!absorb) return 0;
  const th = tableEl.querySelector('thead .nt-th[data-col="' + absorb + '"]');
  const now = th ? th.getBoundingClientRect().width : 0;
  if (!now) return 0;
  const floor = absorb === 'opening' ? ACC_SHARE_MIN : CATQ_NOTE_FLOOR;
  return maxDragWidth(startW, now, floor);
}

/**
 * 挂上预算逻辑。三个触发点：
 *   · nt-layout —— 面板改参数 / 拖动保存之后（applySettings 派发）
 *   · ResizeObserver —— 视图展开 / 转屏 / 窗口变化
 *   · window.resize —— 老机型没有 ResizeObserver 时兜底
 * 拖动过程中不重算（那时宽度由手指决定，重算会把它弹回去）。
 */
export function mountWidthFit() {
  const acc = document.querySelector('table.nt-table-accounts');
  const flow = document.querySelector('table.nt-table-flow');
  const catqs = [...document.querySelectorAll('table.nt-table-catq')];
  if (!acc && !flow && !catqs.length) return;
  const run = () => {
    if (document.body.classList.contains('nt-col-resizing')) return;
    if (acc) fitAccounts(acc);
    if (flow) fitFlow(flow);
    for (const t of catqs) fitCatq(t);
  };
  window.addEventListener('nt-layout', run);
  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', run);
  if (typeof ResizeObserver === 'function') {
    // 两张 catq 表在统计页的左右两栏，宽度可能不同 —— 各观察各的
    for (const t of [acc, ...catqs]) {
      if (!t) continue;
      const wrap = t.closest('.nt-tablewrap');
      if (wrap) new ResizeObserver(run).observe(wrap);
    }
  }
  run();
}
