// 界面：流水 ⇄ 账本设置 的横向切换
/**
 * 流水页和账本设置在一条横向滑道里（2026-11 用户要求）：
 *   手机：一页一屏，左右搓动切换；
 *   ≥1200px：两页并排各半，按钮隐藏（CSS 负责）。
 *
 * 本文件只管两件事：两个图标的点击、以及滑动到设置页时回调一次
 * （设置页的数据可能被流水页改过，切过去要重画）。
 */

const DESKTOP_MIN = 1200;

/**
 * @param {HTMLElement} section data-view="flow" 的视图
 * @param {{onSettings?:Function, onFlow?:Function}} [hooks]
 */
export function mountFlowShell(section, hooks) {
  if (!section) return;
  const shell = section.querySelector('#nt-flow-shell');
  if (!shell) return;
  const h = hooks || {};

  const go = (left) => {
    if (shell.scrollTo) shell.scrollTo({ left, behavior: 'smooth' });
    else shell.scrollLeft = left;
  };

  const toSettings = section.querySelector('[data-nav="settings"]');
  if (toSettings) {
    toSettings.addEventListener('click', () => {
      if (typeof h.onSettings === 'function') h.onSettings();
      go(shell.clientWidth);
    });
  }

  const toFlow = section.querySelector('[data-nav="back"]');
  if (toFlow) {
    toFlow.addEventListener('click', () => {
      go(0);
      if (typeof h.onFlow === 'function') h.onFlow();
    });
  }

  // 搓动到最后半页才算「进了设置页」；只回调一次，避免滚动过程中反复重画
  let shown = false;
  let timer = 0;
  shell.addEventListener('scroll', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const wide = window.innerWidth >= DESKTOP_MIN;
      const onSettings = !wide && shell.scrollLeft > shell.clientWidth * 0.5;
      if (onSettings && !shown) {
        shown = true;
        if (typeof h.onSettings === 'function') h.onSettings();
      } else if (!onSettings && shown) {
        shown = false;
        if (typeof h.onFlow === 'function') h.onFlow();
      }
    }, 120);
  });
}
