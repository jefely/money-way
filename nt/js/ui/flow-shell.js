// 界面：流水 ⇄ 账本设置 的横向切换
/**
 * 流水页和账本设置在一条横向滑道里（2026-11 用户要求）：
 *   **设置页在左（第一页），流水页在右（第二页）** —— 默认停在流水页；
 *   窄：一页一屏，点 ⚙（流水页右端）/ ◀（设置页右端）或左右搓动切换；
 *   宽：两页并排，按钮隐藏（CSS 负责）。
 *
 * 「宽」的判据不是屏幕宽度，而是**右栏还放不放得下流水表**：
 *   7 个固定列 528 + 备注至少 50 = 578。
 *   左栏被拖窄时（比如 420），1182 的窗口其实放得下（右栏 762），
 *   所以不能再写死 1200px（2026-11-07 用户：调小窗口就只剩流水记录）。
 *   结果写在 `.nt-flow-shell.nt-flow-wide` 上，由 css/flow.css 消费。
 */

/** 右栏至少要放得下：流水表 7 个固定列 528 + 备注 50 */
const MIN_FLOW_W = 578;

/**
 * @param {HTMLElement} section data-view="flow" 的视图
 * @param {{onSettings?:Function, onFlow?:Function}} [hooks]
 */
export function mountFlowShell(section, hooks) {
  if (!section) return;
  const shell = section.querySelector('#nt-flow-shell');
  if (!shell) return;
  const h = hooks || {};

  /** 左栏宽度：拖过就用存下来的，否则按 CSS 兜底的 50% */
  const leftWidth = () => {
    const saved = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nt-flow-left-w'));
    if (Number.isFinite(saved) && saved > 0) return saved;
    return Math.round(shell.clientWidth * 0.5);
  };

  /**
   * 现在该不该并排：右栏宽度 ≥ 流水表的固定列 + 备注下限才算。
   * 判据跟着**左栏实际宽度**走 —— 左栏拖窄了，更小的窗口也能并排。
   */
  const wide = () => shell.clientWidth - leftWidth() >= MIN_FLOW_W;

  /** 把判据写到 shell 上（CSS 消费），返回是否并排 */
  const applyWide = () => {
    const w = wide();
    shell.classList.toggle('nt-flow-wide', w);
    return w;
  };

  const go = (left) => {
    if (shell.scrollTo) shell.scrollTo({ left, behavior: 'smooth' });
    else shell.scrollLeft = left;
  };

  // 手机默认停在**流水页**（右页）；并排时从头开始即可。
  // mount 时 shell 可能还没量出宽度（刚显示），所以 rAF + 一次兜底延时。
  const place = () => {
    applyWide();
    shell.scrollLeft = wide() ? 0 : shell.clientWidth;
  };
  requestAnimationFrame(place);
  setTimeout(place, 60);
  window.addEventListener('resize', () => {
    applyWide();
    if (wide()) shell.scrollLeft = 0;
  });

  const toSettings = section.querySelector('[data-nav="settings"]');
  if (toSettings) {
    toSettings.addEventListener('click', () => {
      if (typeof h.onSettings === 'function') h.onSettings();
      go(0);                    // 设置页在左
    });
  }

  const toFlow = section.querySelector('[data-nav="back"]');
  if (toFlow) {
    toFlow.addEventListener('click', () => {
      go(shell.clientWidth);    // 流水页在右
      if (typeof h.onFlow === 'function') h.onFlow();
    });
  }

  // 搓动：滑到左半页才算「进了设置页」；只在跨越时回调一次，滚动过程中不反复重画
  let shown = false;
  let timer = 0;
  shell.addEventListener('scroll', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const onSettings = !wide() && shell.scrollLeft < shell.clientWidth * 0.5;
      if (onSettings && !shown) {
        shown = true;
        if (typeof h.onSettings === 'function') h.onSettings();
      } else if (!onSettings && shown) {
        shown = false;
        if (typeof h.onFlow === 'function') h.onFlow();
      }
    }, 120);
  });

  mountSplit(section, shell, () => { applyWide(); place(); });
}

/**
 * 桌面并排时的分割线：拖动改左栏（设置）宽度，宽度记在本机（界面偏好）。
 * 手机是「一页一屏」，分割线由 CSS 隐藏，拖动逻辑也不介入。
 */
const SPLIT_KEY = 'nt_flow_left_w';
const MIN_LEFT = 280;
const MIN_RIGHT = 360;

function mountSplit(section, shell, onWidth) {
  if (shell.querySelector('.nt-flow-split')) return;
  const left = section.querySelector('[data-flow-page="settings"]');
  if (!left) return;

  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'nt-flow-split';
  bar.setAttribute('aria-label', '拖动调整设置区宽度');
  shell.appendChild(bar);

  const place = () => {
    bar.style.left = Math.round(left.getBoundingClientRect().width) + 'px';
  };
  const applyWidth = (w) => {
    const root = document.documentElement;
    if (w > 0) root.style.setProperty('--nt-flow-left-w', Math.round(w) + 'px');
    else root.style.removeProperty('--nt-flow-left-w');
  };

  let saved = 0;
  try { saved = Number(localStorage.getItem(SPLIT_KEY)) || 0; } catch (e) { saved = 0; }
  if (saved > 0) applyWidth(saved);

  requestAnimationFrame(place);
  window.addEventListener('resize', () => requestAnimationFrame(place));

  bar.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();

    const startX = ev.clientX;
    const startW = left.getBoundingClientRect().width;
    const maxW = Math.max(MIN_LEFT, shell.clientWidth - MIN_RIGHT);

    const move = (e) => {
      const w = Math.max(MIN_LEFT, Math.min(maxW, startW + (e.clientX - startX)));
      applyWidth(w);
      place();
      // 左栏变宽/变窄会改变「还能不能并排」→ 立刻重判一次
      if (typeof onWidth === 'function') onWidth();
    };
    const finish = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', finish);
      bar.removeEventListener('pointercancel', finish);
      try { bar.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      try { localStorage.setItem(SPLIT_KEY, String(Math.round(left.getBoundingClientRect().width))); } catch (e) { /* 忽略 */ }
    };

    try { bar.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', finish);
    bar.addEventListener('pointercancel', finish);
  });
}
