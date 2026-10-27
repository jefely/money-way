// 界面：全局：把界面参数写成 CSS 变量（主题/列宽）
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
    else if (item.cssVar) {
      target.style.setProperty(item.cssVar, item.value);

      // <col> 的 CSS width 用 var() 在表格布局里不生效，必须同步写 inline width。
      // 注意用 querySelectorAll：每个页面都有一张自己的表，
      // 只写第一张会让其它表的列宽塌成 0。
      if (item.cssVar.startsWith('--nt-col-')) {
        const name = item.cssVar.slice(9);
        const w = parseFloat(item.value) || 0;
        if (w > 0) {
          for (const col of document.querySelectorAll('col.nt-c-' + name)) {
            col.style.width = item.value;
            col.setAttribute('width', String(w));
          }
        }
      }
    }
  }

  // 每张表各自算总宽 = 该表各列之和。
  // 不设的话 table-layout:fixed 会把列按比例拉回去（col 写 84px、实际渲染 193px）。
  for (const table of document.querySelectorAll('table.nt-table')) {
    let total = 0;
    let missing = false;
    for (const col of table.querySelectorAll('colgroup col')) {
      const w = parseFloat(col.style.width);
      if (!Number.isFinite(w) || w <= 0) { missing = true; continue; }
      total += w;
    }
    if (!missing && total > 0) table.style.width = total + 'px';
  }
}
