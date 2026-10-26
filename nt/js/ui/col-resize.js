/**
 * 表格列宽拖动手柄
 * 层：第五层 · UI
 *
 * 手柄只做视觉提示（pointer-events:none）；
 * 真正的拖动在 th 上监听：鼠标按在 th 右边缘 10px 内即开始拖。
 * 拖动时同时改列标行与数据区（colgroup 共用列宽）；松手回调 onResize(col, width)。
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

    // 视觉手柄（不拦截事件）
    const handle = document.createElement('span');
    handle.className = 'nt-col-handle';
    handle.setAttribute('data-col', col);
    th.appendChild(handle);

    th.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.nt-col-handle')) return; // 只从手柄上开始拖
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startW = th.getBoundingClientRect().width;
      let width = Math.round(startW);

      const onMove = (ev) => {
        width = Math.max(MIN_W, Math.min(MAX_W, Math.round(startW + (ev.clientX - startX))));
        scope.style.setProperty('--nt-col-' + col, width + 'px');
        const colEl = tableEl.querySelector('col.nt-c-' + col);
        if (colEl) {
          colEl.style.width = width + 'px';
          colEl.setAttribute('width', String(width));
        }
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (o.onResize) o.onResize(col, width);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}
