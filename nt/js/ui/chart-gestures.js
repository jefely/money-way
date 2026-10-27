// 界面：环网图的手势（拖动 / 缩放 / 平移 / 旋转）
/**
 * 图表手势
 * 层：第五层 · UI
 *
 * 变换写成一个 transform，顺序固定：
 *   translate(tx, ty) rotate(rot) scale(zoom)
 * 顺序不能换 —— 先平移再旋转缩放，坐标系才是直觉上的「图跟着手指走」。
 *
 * 操作：
 *   · 滚轮 / 双指捏合     → 缩放
 *   · 单指 / 左键拖动      → 平移（不受限，可以拖出容器）
 *   · 右键长按拖动         → 旋转（Shift+左键也保留，给桌面老习惯）
 *   · 双指旋转             → 旋转（两指连线转多少，图就转多少）
 *   · 双击                 → 复位
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

const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * 平移增益。手势已按显示宽度换算过单位（屏幕 px → viewBox 单位），
 * 4 → 2 → 1 → 0.5 → 0.35 → 回到 0.5：0.35 手感偏慢（用户反馈「变慢了」），
 * 0.5 是他确认过「正常」的那一档。
 */
const PAN_GAIN = 1.2;

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

  // 每次变换都重新取当前目标：
  // 路径页每次重绘都会重建 <svg>，闭包里存一次会写到已经离场的旧元素上。
  //
  // 优先拿内部的 <g class="mw-zoom">：对它做 CSS transform 是**矢量重绘**，
  // 放到多大都清晰；对 <svg> 根元素做则会被光栅化成位图，放大就糊 ——
  // 这正是「手势放大后模糊、收放侧栏反而清晰」的原因（收放会触发重新光栅化）。
  const current = () => {
    const g = box.querySelector('.mw-zoom');
    if (g) return g;
    const el = box.querySelector('svg');
    return el || target;
  };

  /**
   * 屏幕像素 → viewBox 单位 的换算系数。
   *
   * 手势作用在内部的 <g> 上，它的坐标系是 viewBox（6000×6000），
   * 而手指移动是屏幕 px。不换算的话 translate(100px) 只等于屏幕上
   * 100 × (显示宽/6000) ≈ 6px —— 表现就是「使劲搓、移得很慢」。
   *
   * 缓存结果：以前每帧都 querySelector + getBoundingClientRect，
   * 250 条线的图上会掉帧，拖动起来就是「一开始慢、后面一下窜出去」。
   */
  let cachedK = 0;
  const resetK = () => { cachedK = 0; };
  const unitScale = () => {
    if (cachedK) return cachedK;
    const svg = box.querySelector('svg');
    if (!svg) return 1;
    const r = svg.getBoundingClientRect();
    if (!r || !r.width) return 1;
    const vb = String(svg.getAttribute('viewBox') || '').split(/[\s,]+/);
    const size = Number(vb[2]) || r.width;
    cachedK = size / r.width;
    return cachedK;
  };
  if (typeof window !== 'undefined') window.addEventListener('resize', resetK);

  const apply = () => {
    const el = current();
    if (!el) return;
    const k = (el.tagName && el.tagName.toLowerCase() === 'g') ? unitScale() : 1;
    // 对 SVG 子元素：transform-box 用 view-box，原点才是画布中心
    el.style.transformBox = 'view-box';
    el.style.transformOrigin = '50% 50%';
    // ⚠️ 不要设 will-change: transform。
    // 它会把该元素提升成合成层，Chrome 于是把内容光栅化成一张位图再缩放 ——
    // 放大就糊；收展侧栏触发重新光栅化，反而变清晰（用户观察到的正是这个）。
    // SVG 的矢量变换不需要合成层加速，宁可每次重绘。
    el.style.willChange = '';
    el.style.transform =
      `translate(${(view.tx * k).toFixed(1)}px, ${(view.ty * k).toFixed(1)}px) `
      + `rotate(${view.rot.toFixed(2)}deg) scale(${view.zoom.toFixed(3)})`;
  };

  apply();

  /**
   * 每帧最多 apply 一次。
   * 250 条线 + 43 个弧块的图，pointermove 一次就重排一次样式表，
   * 手机上拖动会明显卡顿；合并到 rAF 后一帧只画一次。
   */
  let rafId = 0;
  const schedule = () => {
    if (typeof requestAnimationFrame !== 'function') { apply(); return; }
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      apply();
    });
  };

  /* ---------- 滚轮缩放 ---------- */

  const onWheel = (ev) => {
    ev.preventDefault();
    view.zoom = clampZoom(view.zoom + (ev.deltaY > 0 ? -STEP : STEP));
    apply();
  };
  box.addEventListener('wheel', onWheel, { passive: false });

  /* ---------- 拖动：左键平移 / 右键（或 Shift）旋转 ---------- */

  let drag = null;

  const onDown = (ev) => {
    // 点在弧块上时不拖：那是「选中账户」的点击
    const t = ev.target;
    if (t && t.closest && t.closest('.mw-ring, .pw-ring, .pw-edge, .nt-chord')) return;

    // 右键 = 旋转（用户要求从 Shift+左键 改成右键长按）
    const rotateMode = ev.button === 2 || (ev.buttons & 2) === 2 || ev.shiftKey;

    box.classList.add('is-dragging');
    // 拖动期间走合成层：250 条曲线每帧矢量重绘在手机上就是卡顿，
    // 合成层是位图拉伸（略糊但跟手），松手再换回矢量（清晰）。
    const gl = current();
    if (gl) gl.style.willChange = 'transform';

    drag = {
      x: ev.clientX,
      y: ev.clientY,
      tx: view.tx,
      ty: view.ty,
      rot: view.rot,
      rotateMode,
    };
    try { box.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  };

  const onMove = (ev) => {
    if (!drag) return;

    if (drag.rotateMode) {
      // 用「相对起点的横移」算绝对角度，避免每帧累加的漂移。
      // 方向与增益都按 nt-v0.75 那一版定稿（用户确认那一版手感最对）。
      view.rot = drag.rot + (ev.clientX - drag.x) * 0.08;
    } else {
      view.tx = drag.tx + (ev.clientX - drag.x) * PAN_GAIN;
      view.ty = drag.ty + (ev.clientY - drag.y) * PAN_GAIN;
    }
    schedule();
  };

  const onUp = () => {
    drag = null;
    box.classList.remove('is-dragging');
    const gl = current();
    if (gl) {
      gl.style.willChange = '';
      // 踢一脚让它按矢量重画一遍（同值赋 transform 不会触发重绘）
      const t = gl.style.transform;
      gl.style.transform = t.replace(/scale\(([\d.]+)\)/, 'scale($1) ');
      requestAnimationFrame(() => { gl.style.transform = t; });
    }
  };

  box.addEventListener('pointerdown', onDown);
  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerup', onUp);
  box.addEventListener('pointercancel', onUp);

  /* ---------- 右键菜单：图区里不要弹出来 ---------- */

  const onContextMenu = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    return false;
  };
  box.addEventListener('contextmenu', onContextMenu);

  /* ---------- 双指：捏合缩放 + 旋转 ---------- */

  let pinch = null;

  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  /** 两指连线的角度（度），转到 [-180, 180] 避免跨 ±180 时跳变 */
  const angleOf = (a, b) => {
    let deg = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI;
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    return deg;
  };

  const onTouchStart = (ev) => {
    if (ev.touches.length === 2) {
      drag = null;
      const [a, b] = ev.touches;
      pinch = {
        d: Math.max(1, dist(a, b)),
        z: view.zoom,
        a: angleOf(a, b),
        r: view.rot,
      };
    }
  };

  const onTouchMove = (ev) => {
    if (ev.touches.length === 2 && pinch) {
      ev.preventDefault();
      const [a, b] = ev.touches;
      view.zoom = clampZoom(pinch.z * (dist(a, b) / pinch.d));

      // 双指旋转：两指连线转了多少度，图就转多少（-180~180 之间）
      let delta = angleOf(a, b) - pinch.a;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      view.rot = pinch.r + delta;

      schedule();
    }
  };

  const onTouchEnd = () => { pinch = null; };

  box.addEventListener('touchstart', onTouchStart, { passive: true });
  box.addEventListener('touchmove', onTouchMove, { passive: false });
  box.addEventListener('touchend', onTouchEnd, { passive: true });

  /* ---------- 双击复位 ---------- */

  const onDbl = (ev) => {
    // 点在弧块上不复位：手机连点两个弧块会被识别成 dblclick，
    // 图就突然跳回 1 倍（用户看到的「点图块导致缩放跳动、角度也变」）。
    const t = ev && ev.target;
    if (t && t.closest && t.closest('.mw-ring, .pw-ring, .pw-edge, .nt-chord')) return;
    resetView();
    apply();
  };
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
      box.removeEventListener('contextmenu', onContextMenu);
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
