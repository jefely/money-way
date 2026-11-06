// 界面：统计页 —— 手机左右滑动在四个页面间循环
/**
 * 用户 2026-11 要的顺序：
 *
 *     分类表 → 分类详情 → 节点表 → 节点详情 → 回到分类表
 *
 * 窄屏下 `.nt-stats-grid` 本来就是「一屏一栏」横向吸附（左栏表 / 右栏详情），
 * 所以「表 → 详情」这一段交给浏览器自己滚，**不抢手势**；
 * 只有当这一屏已经滚到头、手指还在划 —— 那才说明用户想换视图，才切。
 *
 * 判定：touchstart 记下 grid 的 scrollLeft，touchend 看它有没有变。
 * 变了 = 用户滚的是 grid 本身；没变（到边界划不动）= 换页。
 * 宽屏 grid 根本不能横滚，scrollLeft 恒为 0，于是左右划直接换视图。
 */

/** 横向位移阈值（px）：比这个短当作误触 */
const MIN_DX = 70;
/** scrollLeft 变化超过这个值，认为用户确实滚动了容器 */
const SCROLL_EPS = 4;

export function mountStatsSwipe(section, go) {
  if (!section || typeof go !== 'function') return;
  if (section.dataset.swipeBound === '1') return;
  section.dataset.swipeBound = '1';

  let sx = 0;
  let sy = 0;
  let active = false;
  let grid = null;
  let startScroll = 0;

  section.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) { active = false; return; }
    const t = ev.touches[0];
    sx = t.clientX;
    sy = t.clientY;
    active = true;
    grid = ev.target && ev.target.closest ? ev.target.closest('.nt-stats-grid') : null;
    startScroll = grid ? grid.scrollLeft : 0;
  }, { passive: true });

  section.addEventListener('touchend', (ev) => {
    if (!active) return;
    active = false;

    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    // 够长、而且是**横向**为主（斜着划不动，免得滚动列表时误切）
    if (Math.abs(dx) < MIN_DX) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.8) return;

    // 这一划已经让容器滚动过了 → 那是它在换「表 / 详情」，不是换视图
    if (grid && Math.abs(grid.scrollLeft - startScroll) > SCROLL_EPS) return;

    go(dx < 0 ? 1 : -1);
  }, { passive: true });
}
