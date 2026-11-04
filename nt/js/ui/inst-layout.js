// 界面：分期表的列宽记忆 / 新增定位
/**
 * 分期表专属的布局辅助
 * 层：第五层 · UI
 *
 * 从 inst-table.js 抽出来的两件事：
 *   · 前 3 个固定列的宽度记忆（走 localStorage，和月份列宽同一个思路）
 *   · 新增一条之后，把它的首月列 / 新行滚进视野
 *
 * 为什么单独一个文件：inst-table.js 已经贴着公约 300 行有效代码的红线，
 * 而这两件事都不是「画表」本身，抽出来各管各的。
 */

/** 固定 3 列：账户名称/分期金额 · 账单日/还款日 · 本息合计 */
export const FIXED_COLS = 3;

/** 前 3 列的宽度边界：与 ui/table-layout.js 的 MIN_W / MAX_W 一致 */
export const MIN_INST_W = 30;
export const MAX_INST_W = 600;

const WIDTH_KEY = 'nt_inst_cw';

/** 读回上次拖好的前 3 列宽度；没有/不合法返回 null */
export function readFixedWidths() {
  try {
    const widths = String(localStorage.getItem(WIDTH_KEY) || '')
      .split(',')
      .map((x) => Math.round(Number(x) || 0));
    if (widths.length < FIXED_COLS) return null;
    const fixed = widths.slice(0, FIXED_COLS);
    return fixed.every((w) => w >= MIN_INST_W) ? fixed : null;
  } catch (e) {
    return null;
  }
}

/**
 * 把上次拖好的前 3 列宽度写回表头和数据行的 col。
 *
 * 分期表没登记进 TABLE_COLS（它是 3 个固定列 + N 个动态月份列的混合表），
 * 所以列宽不走账本参数，和 `nt_inst_mw` 一样放 localStorage。
 * 写入见 table-layout.js 拖动结束时调用的 saveFixedWidths。
 */
export function applyFixedWidths(table) {
  const widths = readFixedWidths();
  if (!widths) return;

  table.classList.add('cols-custom');
  const cols = table.querySelectorAll('#nt-inst-cols col');
  const rows = table.querySelectorAll('thead tr');
  for (let i = 0; i < FIXED_COLS; i += 1) {
    const w = Math.max(MIN_INST_W, Math.min(MAX_INST_W, widths[i]));
    for (const tr of rows) {
      const th = tr.children[i];
      if (!th) continue;
      // CSS 里给固定列写了 min/max，内联清掉才能真正拖窄
      th.style.minWidth = '0';
      th.style.maxWidth = 'none';
      th.style.width = w + 'px';
    }
    if (cols[i]) cols[i].style.width = w + 'px';
  }
}

/** 拖动结束后，把前 3 列的当前实际宽度存起来 */
export function saveFixedWidths(table) {
  const head = table.querySelector('thead tr');
  if (!head) return;
  const widths = [...head.children]
    .slice(0, FIXED_COLS)
    .map((cell) => Math.round(cell.getBoundingClientRect().width));
  if (widths.length !== FIXED_COLS || !widths.every((w) => w > 0)) return;
  try {
    localStorage.setItem(WIDTH_KEY, widths.join(','));
  } catch (e) { /* 忽略 */ }
}

/**
 * 新增之后把「这条分期铺到的第一格」滚进视野。
 *
 * 分期表可以宽到几十个月份列，用户又常常正停在表格最右边：
 * 新记录若从下个月开始，格子全在当前视口之外，看起来就是
 * 「记录只有名字和金额、没有具体分期」（2026-11 用户实测）。
 * 这里只在新格子/新行确实不可见时才滚，避免每次添加都把表格拽走。
 */
export function revealRow(tbody, info) {
  if (!info || !info.firstMonth) return;
  const table = tbody.closest('table');
  const wrap = tbody.closest('.nt-tablewrap');
  if (!table || !wrap) return;

  const wr = wrap.getBoundingClientRect();
  const firstTh = document.querySelector(
    '#nt-inst-head .nt-inst-month[data-month="' + info.firstMonth + '"]',
  );
  const frozen = table.querySelector('thead .nt-th:nth-child(1)');
  const frozenW = frozen ? frozen.getBoundingClientRect().width : 0;

  if (firstTh) {
    const tr = firstTh.getBoundingClientRect();
    const visLeft = wr.left + frozenW + 4;
    const visRight = wr.right - 4;
    if (tr.left < visLeft || tr.right > visRight) {
      wrap.scrollLeft += Math.round(tr.left - visLeft);
    }
  }

  const row = [...tbody.querySelectorAll('tr.nt-inst-main')]
    .find((tr) => tr.dataset.id === info.id);
  if (row) {
    const rr = row.getBoundingClientRect();
    if (rr.top < wr.top + 40 || rr.bottom > wr.bottom - 4) {
      wrap.scrollTop += Math.round(rr.top - wr.top) - 60;
    }
  }
}
