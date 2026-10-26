/**
 * 表格列宽拖动手柄
 * 层：第五层 · UI
 *
 * 手柄挂在列标行每个 th 的右边缘；拖动时同时改列标行与数据区（colgroup 共用列宽）。
 * 拖动即时改 CSS 变量，松手回调 onResize(col, width)，由调用方同步到「默认列宽」并保存。
 */

import { COL_KEYS } from '../core/settings.js';

const MIN_W = 20;
const MAX_W = 600;

export function mountColResize(tableEl, opts) {
  const o = opts || {};
  if (!tableEl || tableEl.dataset.colResize === '1') return;
  tableEl.dataset.colResize = '1';

  const scope = tableEl.closest('[data-view]') || document.documentElement;
  const ths = tableEl.querySelectorAll('thead .nt-th');

  ths.forEach((th, i) => {
    const col = COL_KEYS[i];
    if (!col) return;
    th.setAttribute('data-col', col);

    const handle = document.createElement('span');
    handle.className = 'nt-col-handle';
    handle.setAttribute('data-col', col);

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = th.getBoundingClientRect().width;
      let width = Math.round(startW);
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

      const onMove = (ev) => {
        width = Math.max(MIN_W, Math.min(MAX_W, Math.round(startW + (ev.clientX - startX))));
        scope.style.setProperty('--nt-col-' + col, width + 'px');
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        if (o.onResize) o.onResize(col, width);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });

    th.appendChild(handle);
  });
}
