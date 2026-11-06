// 界面：统计页 —— 手机左右滑动在四个页面间循环
/**
 * 用户 2026-11 要的顺序：
 *
 *     分类表 → 分类详情 → 节点表 → 节点详情 → 回到分类表
 *
 * 窄屏下**一次只显示一栏**（见 stats.css 的 data-pane 规则），所以滑动就是纯粹的
 * 状态切换，不存在「停在两栏中间」的中间态。
 *
 * 早先是「两栏并排 + 横向滚动吸附」，滑动既要滚容器又要切视图，两者抢手势 ——
 * 用户实测从右往左划时详情页会卡在半边。改成单栏状态机之后这个问题从根上没了。
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

  section.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) { active = false; return; }
    const t = ev.touches[0];
    sx = t.clientX;
    sy = t.clientY;
    active = true;
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

    go(dx < 0 ? 1 : -1);
  }, { passive: true });
}
