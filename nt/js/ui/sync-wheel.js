// 界面：同步弹窗里的滚轮（日 / 年月共用）
/**
 * 滚轮（UI 层，无依赖）
 *
 * 只负责「一格一格的滑动 + 吸附 + 回调」：
 *   · axis = 'y'：竖列，手指上下拖（日）
 *   · axis = 'x'：横排，手指左右拖（年月）
 * 正中间那一格才是生效值；松手吸附到最近一格；点按某一格也会把它转到中间。
 *
 * labels 给了就用它当显示文本（年月），否则显示 1..maxDay（日）。
 */

const ITEM_H = 32;
const ITEM_W = 70;

/**
 * @param {{
 *   maxDay?:number, value?:number, onChange?:(v:number)=>void,
 *   axis?:'x'|'y', itemSize?:number, visible?:number, labels?:string[]
 * }} opts
 */
export function buildWheel(opts) {
  const o = opts || {};
  const axis = o.axis === 'x' ? 'x' : 'y';
  const ITEM = Math.max(16, Number(o.itemSize) || (axis === 'x' ? ITEM_W : ITEM_H));
  const VISIBLE = Math.max(3, Number(o.visible) || 5);
  let labels = Array.isArray(o.labels) ? o.labels.slice() : null;
  let maxDay = Math.max(1, Math.min(999, Number(o.maxDay) || (labels ? labels.length : 31)));
  let day = Math.max(1, Math.min(maxDay, Number(o.value) || 1));
  let index = day - 1;
  let offset = 0;
  let drag = null;

  const SIZE = ITEM * VISIBLE;
  // 高亮框必须落在「正中那一格」的中点。
  // 早先用 Math.floor((VISIBLE-1)/2)：偶数格时 8 格算成 3，而选中项中心在 3.5，
  // 框就比数字高了半格 —— 手机上看到的就是「数字不落在框里」（用户 2026-11-01）。
  const centerSize = ((VISIBLE - 1) / 2) * ITEM;

  const wrap = document.createElement('div');
  wrap.className = 'nt-sync-wheel' + (axis === 'x' ? ' h' : '');
  if (axis === 'x') {
    wrap.style.width = SIZE + 'px';
    // 30 高：与右侧「存」按钮（30×30 正方形）同一行等高（用户 2026-11-01）
    wrap.style.height = '30px';
  } else {
    wrap.style.height = SIZE + 'px';
  }
  wrap.setAttribute('role', 'spinbutton');
  wrap.setAttribute('aria-label', axis === 'x' ? '年月（左右拖动选择）' : '日（上下拖动选择）');

  const track = document.createElement('div');
  track.className = 'nt-sync-wheel-track';
  if (axis === 'x') track.style.display = 'flex';
  wrap.appendChild(track);

  const center = document.createElement('div');
  center.className = 'nt-sync-wheel-center';
  if (axis === 'x') {
    center.style.left = centerSize + 'px';
    center.style.top = '0';
    center.style.width = ITEM + 'px';
    center.style.height = '100%';
  } else {
    center.style.top = centerSize + 'px';
    center.style.left = '0';
    center.style.right = '0';
    center.style.height = ITEM + 'px';
  }
  wrap.appendChild(center);

  const target = (i) => SIZE / 2 - ITEM / 2 - i * ITEM;
  const coord = (ev) => (axis === 'x' ? ev.clientX : ev.clientY);

  function paint(anim) {
    track.style.transition = anim ? 'transform .18s ease-out' : 'none';
    track.style.transform = axis === 'x'
      ? 'translateX(' + offset + 'px)'
      : 'translateY(' + offset + 'px)';
  }

  function markActive() {
    for (let i = 0; i < track.children.length; i += 1) {
      track.children[i].classList.toggle('on', i === index);
    }
  }

  function fill() {
    track.textContent = '';
    for (let i = 1; i <= maxDay; i += 1) {
      const it = document.createElement('div');
      it.className = 'nt-sync-wheel-item';
      if (axis === 'x') it.style.width = ITEM + 'px';
      else it.style.height = ITEM + 'px';
      it.textContent = labels ? String(labels[i - 1] == null ? i : labels[i - 1]) : String(i);
      track.appendChild(it);
    }
  }

  function apply(i, anim) {
    index = Math.max(0, Math.min(maxDay - 1, i));
    offset = target(index);
    paint(anim);
    markActive();
  }

  function emit() {
    const next = index + 1;
    if (next === day) return;
    day = next;
    if (typeof o.onChange === 'function') o.onChange(day);
  }

  function setValue(v, anim) {
    const next = Math.max(1, Math.min(maxDay, Number(v) || 1));
    const changed = next !== day;
    day = next;
    apply(day - 1, anim);
    if (changed && typeof o.onChange === 'function') o.onChange(day);
  }

  wrap.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    drag = { p: coord(ev), o: offset, moved: false, id: ev.pointerId };
    try { wrap.setPointerCapture(ev.pointerId); } catch (e) { /* 合成事件 */ }
    track.style.transition = 'none';
  });

  wrap.addEventListener('pointermove', (ev) => {
    if (!drag || drag.id !== ev.pointerId) return;
    const d = coord(ev) - drag.p;
    if (Math.abs(d) > 4) drag.moved = true;
    offset = drag.o + d;
    paint(false);
  });

  function finish(ev) {
    if (!drag) return;
    const d = drag;
    drag = null;
    try { wrap.releasePointerCapture(d.id); } catch (e) { /* 忽略 */ }

    if (!d.moved && ev && ev.type === 'pointerup') {
      // 点按：点哪一格就把哪一格转到中间
      const r = wrap.getBoundingClientRect();
      const rel = coord(ev) - (axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2);
      const i = Math.min(maxDay - 1, Math.max(0, index + Math.round(rel / ITEM)));
      apply(i, true);
      emit();
      return;
    }
    apply(Math.round((SIZE / 2 - ITEM / 2 - offset) / ITEM), true);
    emit();
  }

  wrap.addEventListener('pointerup', finish);
  wrap.addEventListener('pointercancel', finish);

  // 鼠标滚轮：指针停在滚动条上时上下（横排则左右）滚，一格一格走。
  // 80ms 内只认一次 —— 鼠标滚轮一次手势会连发好几个 wheel，不节流会直接跳过好几个月。
  let wheelAt = 0;
  wrap.addEventListener('wheel', (ev) => {
    const d = axis === 'x'
      ? (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY)
      : ev.deltaY;
    if (!d) return;
    ev.preventDefault();
    const now = Date.now();
    if (now - wheelAt < 80) return;
    wheelAt = now;
    apply(index + (d > 0 ? 1 : -1), true);
    emit();
  }, { passive: false });

  fill();
  apply(index, false);

  return {
    el: wrap,
    value() { return day; },
    setValue(v) { setValue(v, true); },
    /** 切月份时重新限制天数（当前值超界就钳到月末） */
    setMaxDay(max) {
      maxDay = Math.max(1, Math.min(999, Number(max) || 1));
      day = Math.min(day, maxDay);
      fill();
      apply(day - 1, false);
    },
    /** 换一组显示文本（年月用），长度即格数 */
    setLabels(list) {
      labels = Array.isArray(list) ? list.slice() : null;
      maxDay = Math.max(1, labels ? labels.length : maxDay);
      day = Math.min(day, maxDay);
      fill();
      apply(day - 1, false);
    },
  };
}
