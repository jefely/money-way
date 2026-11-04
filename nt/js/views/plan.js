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

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'nt-btn nt-btn-sm';
  addBtn.textContent = '添加';
  addBtn.hidden = true;
  addBtn.addEventListener('click', () => {
    // 只在**不在分期页**时才切过去：show() 会重建表单（清空输入框），
    // 用户填好再点「添加」时若又重建一次，读到的就是空值 ——
    // 表现是「点了添加没反应，只在页脚说先填分期银行」（2026-11 用户实测）。
    if (cap !== 'inst') show('inst');
    instTable.submit();
  });
  caps.insertAdjacentElement('afterend', addBtn);

  let cap = 'fixed';

  function show(next) {
    cap = next;
    for (const x of caps.querySelectorAll('.nt-cap')) {
      x.setAttribute('aria-selected', x.getAttribute('data-cap') === cap ? 'true' : 'false');
    }
    fixedPane.hidden = cap !== 'fixed';
    instPane.hidden = cap !== 'inst';
    addBtn.hidden = cap !== 'inst';
    render();
  }

  caps.addEventListener('click', (ev) => {
    const b = ev.target.closest('.nt-cap');
    if (!b) return;
    show(b.getAttribute('data-cap'));
  });

  function render() {
    if (cap === 'inst') instTable.render();
    else fixedTable.render();
  }

  return { render };
}
