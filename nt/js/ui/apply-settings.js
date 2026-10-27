// 界面：全局：把界面参数写成 CSS 变量（主题/列宽）
/**
 * 把界面参数写到对应作用域的 CSS 变量上（UI 层）
 *
 * **只写变量，不碰列宽、不碰表宽**。
 * 列宽/表宽/冻结列由 ui/table-layout.js 一个地方负责 ——
 * 之前这里也写 <col> 宽度和 table.style.width，和 col-resize.js 打架，
 * 导致「拖一列动一排」「列宽乱跳」。现在职责切开：
 *
 *   applySettings  →  写 --nt-* 变量
 *   syncTable      →  按变量设置 <col> 宽度 + 表宽 + 冻结 left
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
