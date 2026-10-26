/**
 * 把界面参数写到 :root 的 CSS 变量上（UI 层）
 *
 * 公约 1.2 禁内联 style="..."：这里用 setProperty 写 CSS 变量，
 * 不碰 HTML 的 style 属性。只在调试/配置时调用。
 */

import { toCssList } from '../core/settings.js';

/**
 * @param {object} settings 完整设置（normalize 过的）
 */
export function applySettings(settings) {
  const root = document.documentElement;
  if (!root) return;
  for (const item of toCssList(settings)) {
    if (item.attr) root.setAttribute(item.attr, item.value);
    else if (item.cssVar) root.style.setProperty(item.cssVar, item.value);
  }
}
