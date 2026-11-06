// 界面：统计页 —— 左栏（6 大分类）与右侧查询区之间的分界条
/**
 * 分类统计的分界条
 * 层：第五层 · UI
 *
 * 拖「分类查询1」的左边框 = 调整左侧 6 大分类栏的宽度；右侧两块查询区
 * 由栅格 `repeat(2, 1fr)` 平均分配剩下的宽度（用户 2026-11）。
 *
 * 宽度只写一个 CSS 变量 `--nt-stats-left-w`；存在 localStorage（界面偏好，
 * 不进加密账本 —— 和路径页侧栏宽度一个性质）。
 */

const KEY = 'nt_stats_left_w';
const MIN_LEFT = 240;
const MIN_RIGHT = 260;

function savedWidth() {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n >= MIN_LEFT ? n : 0;
  } catch (e) {
    return 0;
  }
}

/** 把左栏宽度应用到栅格（px）；传 0 表示恢复默认（45%） */
function applyWidth(w) {
  const root = document.documentElement;
  if (w > 0) root.style.setProperty('--nt-stats-left-w', Math.round(w) + 'px');
  else root.style.removeProperty('--nt-stats-left-w');
}

/**
 * 挂上分界条（只挂一次）。
 *
 * 分类视图和节点视图各是一块 `.nt-stats-grid`，两块都挂 —— 它们共用同一个
 * 宽度变量 `--nt-stats-left-w`，所以在哪个视图拖的，切过去都一样宽。
 */
export function mountStatsSplit(section) {
  if (!section) return;
  for (const grid of section.querySelectorAll('.nt-stats-grid')) mountOne(grid);
}

function mountOne(grid) {
  if (!grid || grid.querySelector('.nt-stats-split')) return;

  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'nt-stats-split';
  bar.setAttribute('aria-label', '拖动调整左侧分类区宽度');
  grid.appendChild(bar);

  const leftPanel = () => grid.querySelector('.nt-stats-panel');
  const place = () => {
    const p = leftPanel();
    if (p) bar.style.left = Math.round(p.getBoundingClientRect().width) + 'px';
  };

  const saved = savedWidth();
  if (saved) applyWidth(saved);
  requestAnimationFrame(place);
  // 左栏尺寸变化（窗口缩放、从隐藏变可见、重开后第一次进统计页）都要重新定位分界条。
  // 只监听 window.resize 不够：重开时统计页是隐藏的，place 量到 0。
  const first = grid.querySelector('.nt-stats-panel');
  if (first && typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => place());
    ro.observe(first);
  }
  window.addEventListener('resize', () => requestAnimationFrame(place));

  bar.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    ev.preventDefault();
    ev.stopPropagation();

    const startX = ev.clientX;
    const p0 = leftPanel();
    const startW = p0 ? p0.getBoundingClientRect().width : 0;
    const maxW = Math.max(MIN_LEFT, grid.clientWidth - MIN_RIGHT);

    const move = (e) => {
      const w = Math.max(MIN_LEFT, Math.min(maxW, startW + (e.clientX - startX)));
      applyWidth(w);
      bar.style.left = Math.round(w) + 'px';
    };
    const finish = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', finish);
      bar.removeEventListener('pointercancel', finish);
      try { bar.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      const p = leftPanel();
      if (p) {
        try { localStorage.setItem(KEY, String(Math.round(p.getBoundingClientRect().width))); } catch (e) { /* 忽略 */ }
      }
    };

    try { bar.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', finish);
    bar.addEventListener('pointercancel', finish);
  });
}
