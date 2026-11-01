// 界面：横向滚动指示条
/**
 * 横向滚动指示条
 *
 * 为什么需要它：移动端 Chrome / Safari 的滚动条是 overlay 的，
 * 默认**不显示**，`::-webkit-scrollbar` 在手机上也不生效 ——
 * 于是分期表这种宽表看不出「还能往右拖」（用户 2026-11-01）。
 *
 * 做法：在滚动容器的**父级**画一条细横条，宽度 = 视口 / 内容，
 * 位置随 scrollLeft 走。放父级而不是滚动容器里，是因为
 * 滚动容器里的 absolute 子元素会跟着内容一起滚，那就白画了。
 */

/**
 * @param {HTMLElement} host 定位用（通常是 .nt-plan-inst）
 * @param {HTMLElement} wrap 滚动容器（.nt-tablewrap）
 * @returns {{sync:()=>void}|null}
 */
export function mountScrollHint(host, wrap) {
  if (!host || !wrap) return null;

  let hint = host.querySelector('.nt-scroll-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'nt-scroll-hint';
    hint.setAttribute('aria-hidden', 'true');
    host.appendChild(hint);
  }

  function sync() {
    const cw = wrap.clientWidth;
    const sw = wrap.scrollWidth;

    if (!cw || sw <= cw + 1) {
      hint.style.display = 'none';
      return;
    }
    hint.style.display = 'block';

    const ratio = cw / sw;
    const w = Math.max(28, Math.round(cw * ratio));
    const span = sw - cw;
    const left = span > 0 ? Math.round((wrap.scrollLeft / span) * (cw - w)) : 0;

    hint.style.width = w + 'px';
    hint.style.transform = `translateX(${left}px)`;
  }

  wrap.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();

  return { sync };
}
