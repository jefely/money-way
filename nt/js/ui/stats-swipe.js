// 界面：统计页 —— 手机左右滑动切换「分类 / 节点」
/**
 * 用户 2026-11：手机上左右滑直接换视图，两个视图循环切。
 *
 * 只在**这一屏没有横向可滚的东西**时才接管手势 —— 表格列多、或者用户把
 * 分类列拖得很宽时，容器本身要能横滑看后面的列，这时候抢手势就是灾难。
 * 判定放在 touchstart：手指按下时看落点所在的可滚容器是否真的溢出。
 */

/** 横向位移阈值（px）：比这个短当作误触 */
const MIN_DX = 70;

export function mountStatsSwipe(section, go) {
  if (!section || typeof go !== 'function') return;
  if (section.dataset.swipeBound === '1') return;
  section.dataset.swipeBound = '1';

  let sx = 0;
  let sy = 0;
  let active = false;
  let scrollable = false;

  section.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) { active = false; return; }
    const t = ev.touches[0];
    sx = t.clientX;
    sy = t.clientY;
    active = true;
    // 手指落在一个「真的能横滚」的容器里 → 这一屏归它，不切视图
    const wrap = ev.target && ev.target.closest ? ev.target.closest('.nt-tablewrap') : null;
    scrollable = !!(wrap && wrap.scrollWidth > wrap.clientWidth + 4);
  }, { passive: true });

  section.addEventListener('touchend', (ev) => {
    if (!active) return;
    active = false;
    if (scrollable) return;

    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    // 够长、而且是**横向**为主（斜着划不动，免得滚动列表时误切）
    if (Math.abs(dx) < MIN_DX) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.8) return;
    go(dx < 0 ? 1 : -1);
  }, { passive: true });
}
