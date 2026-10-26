/**
 * 把界面参数写到对应作用域的 CSS 变量上（UI 层）
 *
 * 公约 1.2 禁内联 style="..."：这里用 setProperty 写 CSS 变量，
 * 不碰 HTML 的 style 属性。只在调试/配置时调用。
 *
 * 作用域：global → :root；flow / 其他 → [data-view="flow"] 等标签页容器。
 */

import { toCssList, GROUP_SCOPE } from '../core/settings.js';

/**
 * @param {object} settings 完整设置（normalize 过的）
 */
export function applySettings(settings, theme) {
  const root = document.documentElement;
  if (!root) return;
  for (const item of toCssList(settings, theme)) {
    const scope = GROUP_SCOPE[item.group] || 'global';
    const target = scope === 'global' ? root : document.querySelector('[data-view="' + scope + '"]');
    if (!target) continue;
    if (item.attr) target.setAttribute(item.attr, item.value);
    else if (item.cssVar) target.style.setProperty(item.cssVar, item.value);
  }
}
