// 界面：同步弹窗里的日期竖轮（手指上下拖，正中间那格生效）
/**
 * 竖轮（UI 层，无依赖）
 *
 * 只负责「1..maxDay 的数字列 + 拖动 + 吸附 + 回调」；
 * 选中哪一天、窗口怎么算，由调用方决定（见 ui/sync-dialog.js）。
 *
 * · pointerdown/move/up + setPointerCapture：手指移出也不断
 * · 松手吸附到最近一格；点按某一格也会把它转到中间
 * · 值变化才回调，拖回原位不重复触发
 */

const ITEM_H = 32;
const VISIBLE = 5;

/**
 * @param {{maxDay:number, value:number, onChange?:(day:number)=>void}} opts
 * @returns {{el:HTMLElement, setMaxDay:(max:number)=>void, setValue:(day:number)=>void, value:(...args:any[])=>number}}
 */
export function buildWheel(opts) {
  const o = opts || {};
  let maxDay = Math.max(1, Math.min(31, Number(o.maxDay) || 31));
  let day = Math.max(1, Math.min(maxDay, Number(o.value) || 1));
  let index = day - 1;
  let offset = 0;
  let drag = null;

  const H = ITEM_H * VISIBLE;

  const wrap = document.createElement('div');
  wrap.className = 'nt-sync-wheel';
  wrap.style.height = H + 'px';
  wrap.setAttribute('role', 'spinbutton');
  wrap.setAttribute('aria-label', '窗口结束日（上下拖动选择）');

  const track = document.createElement('div');
  track.className = 'nt-sync-wheel-track';
  wrap.appendChild(track);

  const center = document.createElement('div');
  center.className = 'nt-sync-wheel-center';
  center.style.top = (H / 2 - ITEM_H / 2) + 'px';
  center.style.height = ITEM_H + 'px';
  wrap.appendChild(center);

  const target = (i) => H / 2 - ITEM_H / 2 - i * ITEM_H;

  function paint(anim) {
    track.style.transition = anim ? 'transform .18s ease-out' : 'none';
    track.style.transform = 'translateY(' + offset + 'px)';
  }

  function markActive() {
    for (let i = 0; i < track.children.length; i += 1) {
      track.children[i].classList.toggle('on', i === index);
    }
  }

  function fill() {
    track.textContent = '';
    for (let d = 1; d <= maxDay; d += 1) {
      const it = document.createElement('div');
      it.className = 'nt-sync-wheel-item';
      it.style.height = ITEM_H + 'px';
      it.textContent = String(d);
      track.appendChild(it);
    }
  }

  function apply(i, anim) {
    index = Math.max(0, Math.min(maxDay - 1, i));
    offset = target(index);
    paint(anim);
    markActive();
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
    drag = { y: ev.clientY, o: offset, moved: false, id: ev.pointerId };
    try { wrap.setPointerCapture(ev.pointerId); } catch (e) { /* 合成事件 */ }
    track.style.transition = 'none';
  });

  wrap.addEventListener('pointermove', (ev) => {
    if (!drag || drag.id !== ev.pointerId) return;
    const dy = ev.clientY - drag.y;
    if (Math.abs(dy) > 4) drag.moved = true;
    offset = drag.o + dy;
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
      const rel = ev.clientY - (r.top + r.height / 2);
      const i = Math.min(maxDay - 1, Math.max(0, index + Math.round(rel / ITEM_H)));
      const next = i + 1;
      const changed = next !== day;
      day = next;
      apply(i, true);
      if (changed && typeof o.onChange === 'function') o.onChange(day);
      return;
    }
    apply(Math.round((H / 2 - ITEM_H / 2 - offset) / ITEM_H), true);
    if (day - 1 !== index) {
      // 吸附后落点变了（拖到一半松手）
      const next = index + 1;
      const changed = next !== day;
      day = next;
      if (changed && typeof o.onChange === 'function') o.onChange(day);
    }
  }

  wrap.addEventListener('pointerup', finish);
  wrap.addEventListener('pointercancel', finish);

  fill();
  apply(index, false);

  return {
    el: wrap,
    /** 切月份时重新限制天数；当前值超界就钳到月末 */
    setMaxDay(max) {
      maxDay = Math.max(1, Math.min(31, Number(max) || 31));
      day = Math.min(day, maxDay);
      fill();
      apply(day - 1, false);
    },
    setValue(v) { setValue(v, true); },
    value() { return day; },
  };
}
