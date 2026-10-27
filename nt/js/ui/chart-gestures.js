// 界面：环网图的手势（拖动 / 缩放 / 平移 / 旋转）
/**
 * 图表手势
 * 层：第五层 · UI
 *
 * 照单文件版（personal/index.html §10081-10129）的做法：
 *   · 滚轮           → 缩放（0.3 ~ 6 倍）
 *   · 单指/左键拖动    → 平移
 *   · Shift + 横拖    → 旋转
 *   · 双指捏合        → 缩放
 *   · 双击            → 复位
 *
 * 变换写成一个 transform，顺序固定：
 *   translate(tx, ty) rotate(rot) scale(zoom)
 * 顺序不能换 —— 先平移再旋转缩放，坐标系才是直觉上的「图跟着手指走」。
 */

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 6;
const STEP = 0.1;

/** 视图状态（跨视图切换保留） */
let view = { zoom: 1, rot: 0, tx: 0, ty: 0 };

/** 复位 */
export function resetView() {
  view = { zoom: 1, rot: 0, tx: 0, ty: 0 };
}

/** 当前状态（给外部读） */
export function currentView() {
  return { ...view };
}

/**
 * 给图表容器挂手势。
 *
 * @param {HTMLElement} box    手势接收区（一般是 .pw-chart）
 * @param {SVGElement|HTMLElement} target  要被变换的元素（一般是 svg）
 */
export function mountChartGestures(box, target) {
  if (!box || !target) return null;

  // 同一个容器只挂一次：重复挂会让滚轮一次滚两格、拖动速度翻倍
  if (box.dataset.gestureBound === '1') return box.__gestures || null;
  box.dataset.gestureBound = '1';

  // 每次变换都重新取当前 svg：
  // 路径页每次重绘都会重建 <svg>，闭包里存一次会写到已经离场的旧元素上。
  const current = () => {
    const el = box.querySelector('svg');
    return el || target;
  };

  const apply = () => {
    const el = current();
    if (!el) return;
    el.style.transformOrigin = '50% 50%';
    el.style.willChange = 'transform';
    el.style.transform =
      `translate(${view.tx.toFixed(1)}px, ${view.ty.toFixed(1)}px) `
      + `rotate(${view.rot.toFixed(2)}deg) scale(${view.zoom.toFixed(3)})`;
  };

  apply();

  /* ---------- 滚轮缩放 ---------- */

  const onWheel = (ev) => {
    ev.preventDefault();
    view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom + (ev.deltaY > 0 ? -STEP : STEP)));
    apply();
  };
  box.addEventListener('wheel', onWheel, { passive: false });

  /* ---------- 拖动平移 / Shift 旋转 ---------- */

  let drag = null;

  const onDown = (ev) => {
    // 点在弧块上时不拖：那是「选中账户」的点击
    const t = ev.target;
    if (t && t.closest && t.closest('.mw-ring, .pw-ring, .pw-edge, .nt-chord')) return;

    drag = { x: ev.clientX, y: ev.clientY, tx: view.tx, ty: view.ty, shift: ev.shiftKey };
    try { box.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  };

  const onMove = (ev) => {
    if (!drag) return;

    if (ev.shiftKey || drag.shift) {
      view.rot += (ev.clientX - drag.x) * 0.3;
      drag.x = ev.clientX;
    } else {
      view.tx = drag.tx + (ev.clientX - drag.x);
      view.ty = drag.ty + (ev.clientY - drag.y);
    }
    apply();
  };

  const onUp = () => { drag = null; };

  box.addEventListener('pointerdown', onDown);
  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerup', onUp);
  box.addEventListener('pointercancel', onUp);

  /* ---------- 双指捏合缩放 ---------- */

  let pinch = null;

  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onTouchStart = (ev) => {
    if (ev.touches.length === 2) {
      drag = null;
      pinch = { d: Math.max(1, dist(ev.touches[0], ev.touches[1])), z: view.zoom };
    }
  };

  const onTouchMove = (ev) => {
    if (ev.touches.length === 2 && pinch) {
      ev.preventDefault();
      const d2 = dist(ev.touches[0], ev.touches[1]);
      view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.z * (d2 / pinch.d)));
      apply();
    }
  };

  const onTouchEnd = () => { pinch = null; };

  box.addEventListener('touchstart', onTouchStart, { passive: true });
  box.addEventListener('touchmove', onTouchMove, { passive: false });
  box.addEventListener('touchend', onTouchEnd, { passive: true });

  /* ---------- 双击复位 ---------- */

  const onDbl = () => { resetView(); apply(); };
  box.addEventListener('dblclick', onDbl);

  box.__gestures = {
    apply,
    reset: () => { resetView(); apply(); },
    destroy: () => {
      box.removeEventListener('wheel', onWheel);
      box.removeEventListener('pointerdown', onDown);
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerup', onUp);
      box.removeEventListener('pointercancel', onUp);
      box.removeEventListener('touchstart', onTouchStart);
      box.removeEventListener('touchmove', onTouchMove);
      box.removeEventListener('touchend', onTouchEnd);
      box.removeEventListener('dblclick', onDbl);
      delete box.dataset.gestureBound;
      delete box.__gestures;
    },
  };

  return box.__gestures;
}
