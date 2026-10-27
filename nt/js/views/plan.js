// 界面：固定 tab
/**
 * 计划视图（固定收支 + 分期）
 * 层：第五层 · UI
 *
 * 只做装配：两个子表各自独立（ui/fixed-table.js、ui/inst-table.js），
 * 本文件负责切 cap，并把汇总写到顶部信息栏。
 */

import { mountFixedTable } from '../ui/fixed-table.js';
import { mountInstTable } from '../ui/inst-table.js';

export function mountPlan(section, ctx) {
  const caps = section.querySelector('#nt-plan-caps');
  const fixedPane = section.querySelector('#nt-plan-fixed');
  const instPane = section.querySelector('#nt-plan-inst');
  const fixedBody = section.querySelector('#nt-plan-body');
  const instBody = section.querySelector('#nt-inst-body');

  // 信息直接写到底部状态栏，不再占用按钮栏的高度
  const setInfo = (text) => { ctx.setFooter(text); };

  const fixedTable = mountFixedTable(ctx, fixedBody, { onSummary: setInfo });
  const instTable = mountInstTable(ctx, instBody, { onSummary: setInfo });

  let cap = 'fixed';

  caps.addEventListener('click', (ev) => {
    const b = ev.target.closest('.nt-cap');
    if (!b) return;
    cap = b.getAttribute('data-cap');
    for (const x of caps.querySelectorAll('.nt-cap')) {
      x.setAttribute('aria-selected', x === b ? 'true' : 'false');
    }
    fixedPane.hidden = cap !== 'fixed';
    instPane.hidden = cap !== 'inst';
    render();
  });

  function render() {
    if (cap === 'inst') instTable.render();
    else fixedTable.render();
  }

  return { render };
}
