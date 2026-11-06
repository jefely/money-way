// 界面：统计小表的字号自适应
/**
 * 内容放不下就把这张表的字号缩小一点（用户 2026-11）。
 *
 * 场景：手机上 390px 要塞 5 列，节点名又长（「招行信1007」）、金额又大
 * （「203,048」），固定 14px 一定挤爆。金额取整、去掉 ¥ 之后大半能放下，
 * 剩下的边角情况由这里兜底。
 *
 * 做法是**估算**而不是逐格测量：`scrollWidth` 在 `table-layout:fixed` 的
 * 单元格上不可靠（td 不是滚动容器），所以按「每个字符占多少 em」直接算：
 * 全角 1em、半角 0.58em。误差靠 4% 余量吸收。
 *
 * 结果写 `--nt-stat-font-fit`（表级内联变量），CSS 里作为
 * `font-size: var(--nt-stat-font-fit, var(--nt-stat-font, 14px))` 的第一顺位，
 * 所以用户在参数里调的基础字号不会被覆盖，只是在这张表上收窄。
 */

/** 全角字符范围（CJK、假名、韩文、全角标点）。够用了，不必精确到 Unicode 全部。 */
const FULL_WIDTH = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/** 一串文字的「等效 em 宽度」：全角 1，半角 0.58 */
export function textEm(s) {
  let em = 0;
  for (const ch of String(s == null ? '' : s)) em += FULL_WIDTH.test(ch) ? 1 : 0.58;
  return em;
}

const MIN_FONT = 9;

/**
 * 按这一张表的实际列宽算一个能放下全部内容的字号。
 * @param {HTMLElement} tableEl
 * @returns {number|null} 该用的字号；不需要缩小时返回 null
 */
export function fitFontOf(tableEl) {
  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  const colW = ths.map((th) => th.getBoundingClientRect().width);
  if (!colW.some((w) => w > 0)) return null;

  const root = getComputedStyle(document.documentElement).getPropertyValue('--nt-stat-font');
  const base = parseFloat(root) || 14;

  let need = base;
  for (const tr of tableEl.querySelectorAll('tbody tr')) {
    [...tr.children].forEach((td, i) => {
      const em = textEm(td.textContent);
      const avail = (colW[i] || 0) - 10; // 左右各 5px padding
      if (em <= 0 || avail <= 0) return;
      need = Math.min(need, avail / em);
    });
  }

  const size = Math.max(MIN_FONT, Math.min(base, need * 0.96));
  // 只差一丁点就不动，免得每次重画都在缩/不缩之间跳
  if (size >= base - 0.3) return null;
  return Math.floor(size * 10) / 10;
}

/**
 * 给一张表套上自适应字号（放得下就不设变量，回到基础字号）。
 * 必须在表已经进 DOM、且宽度可量的时候调用（见 renderStatTables 的 rAF）。
 */
export function applyFitFont(tableEl) {
  if (!tableEl) return;
  const size = fitFontOf(tableEl);
  if (size == null) tableEl.style.removeProperty('--nt-stat-font-fit');
  else tableEl.style.setProperty('--nt-stat-font-fit', size + 'px');
}
