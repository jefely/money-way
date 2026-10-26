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

  let totalColW = 0;

  for (const item of toCssList(settings, theme)) {
    const scope = GROUP_SCOPE[item.group] || 'global';
    const target = scope === 'global' ? root : document.querySelector('[data-view="' + scope + '"]');
    if (!target) continue;
    if (item.attr) target.setAttribute(item.attr, item.value);
    else if (item.cssVar) {
      target.style.setProperty(item.cssVar, item.value);
      // <col> 的 CSS width 用 var() 在表格布局里不生效，同步写 inline width
      if (item.cssVar.startsWith('--nt-col-')) {
        const name = item.cssVar.slice(9);
        const col = document.querySelector('col.nt-c-' + name);
        if (col) {
          // 只累加实际存在的 <col>，否则会把不存在的列也算进表格宽度
          totalColW += parseFloat(item.value) || 0;
          col.style.width = item.value;
          col.setAttribute('width', String(parseFloat(item.value) || 0));
        }
      }
    }
  }

  // 表格宽度必须等于各列宽总和：否则 table-layout:fixed 会把列按比例拉宽，
  // 出现「col 设了 84px、实际渲染 193px」的错乱。
  const table = document.querySelector('.nt-table');
  if (table && totalColW > 0) table.style.width = totalColW + 'px';
}
