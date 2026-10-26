/**
 * 顶栏工具（UI 层）
 *
 * 主题切换 + 关于弹窗。都不含业务计算。
 */

import { toggleTheme, currentTheme } from './theme-manager.js';
import * as NtModal from './modal.js';

/**
 * @param {{getSummary:()=>Array<[string,string]>}} opts 关于弹窗要显示的信息由调用方给
 */
export function bindHeaderTools(opts) {
  const o = opts || {};

  const themeBtn = document.getElementById('nt-theme-toggle');
  if (themeBtn) {
    themeBtn.setAttribute('aria-label', currentTheme() === 'dark' ? '切换到浅色' : '切换到深色');
    themeBtn.addEventListener('click', () => {
      const next = toggleTheme();
      themeBtn.setAttribute('aria-label', next === 'dark' ? '切换到浅色' : '切换到深色');
    });
  }

  const aboutBtn = document.getElementById('nt-about');
  if (aboutBtn) {
    aboutBtn.addEventListener('click', () => {
      NtModal.open({
        title: '关于 NT账本',
        build: (body) => {
          const dl = document.createElement('dl');
          dl.className = 'nt-modal-kv';
          for (const [k, v] of (o.getSummary ? o.getSummary() : [])) {
            const dt = document.createElement('dt');
            dt.textContent = k;
            const dd = document.createElement('dd');
            dd.textContent = v;
            dl.appendChild(dt);
            dl.appendChild(dd);
          }
          body.appendChild(dl);
        },
        actions: [{ label: '知道了', kind: 'ghost', close: true }],
      });
    });
  }
}
