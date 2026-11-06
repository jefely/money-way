// 界面：节点模板弹窗里的「重置」区
/**
 * 重置不再是独立弹窗（用户 2026-11：整合进「节点模板」弹窗）。
 *
 * 交互也改了：以前是「先选模式、再点确定」两段式，容易误解成「选完就生效」。
 * 现在是**输入框下面直接排两个动作按钮**，点哪个就执行哪个，但仍然要先输入
 * 「重置」两个字（防误触）。
 *
 *   清空流水记录 —— 只清掉 transactions，节点和计划都留着
 *   重置节点模板 —— 换回内置三户，流水和计划留着（名字对得上的会接回去）
 */

import { SEED_ACCOUNTS } from '../core/reset-book.js';

/**
 * @param {object} ctx app 上下文（需要 getState / setState / saveNow / resetAccounts / rerender）
 * @param {Function} close 关闭外层弹窗
 * @returns {HTMLElement}
 */
export function resetSection(ctx, close) {
  const state = ctx.getState();
  const nTx = (state.transactions || []).length;
  const nAcc = (state.accounts || []).filter((a) => a && !a.isHidden).length;
  const nPlan = (state.scheduled || []).length;

  const wrap = document.createElement('div');
  wrap.className = 'nt-reset-block';

  const title = document.createElement('p');
  title.className = 'nt-reset-title';
  title.textContent = '③ 重置';
  wrap.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'nt-sync-hint';
  hint.textContent = `当前 ${nAcc} 个节点、${nTx} 笔流水、${nPlan} 条计划。`
    + '「清空流水记录」只删流水，节点和计划都留着；'
    + `「重置节点模板」把节点换回内置的 ${SEED_ACCOUNTS.length} 个，流水和计划留着。`;
  wrap.appendChild(hint);

  const word = document.createElement('input');
  word.type = 'text';
  word.className = 'nt-input';
  word.placeholder = '输入 重置';
  word.setAttribute('aria-label', '输入重置');
  wrap.appendChild(word);

  const err = document.createElement('p');
  err.className = 'nt-sync-hint';
  wrap.appendChild(err);

  // 输入框**下方**并排两个动作按钮（用户 2026-11：不先选模式再确定，直接点动作）
  const bar = document.createElement('div');
  bar.className = 'nt-exp-bar';
  bar.appendChild(action('清空流水记录', 'wipeFlow'));
  bar.appendChild(action('重置节点模板', 'resetNodes'));
  wrap.appendChild(bar);

  function action(label, kind) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-btn nt-btn-sm';
    b.textContent = label;
    b.addEventListener('click', async () => {
      if (word.value.trim() !== '重置') {
        err.textContent = '请输入「重置」两个字';
        return;
      }
      err.textContent = '';
      if (close) close();
      if (kind === 'wipeFlow') {
        // 只清流水：节点、计划、备注都保留
        const st = ctx.getState();
        ctx.setState({ ...st, transactions: [] });
        if (ctx.saveNow) ctx.saveNow();
        if (ctx.rerender) ctx.rerender();
        if (ctx.setFooter) ctx.setFooter('已清空流水记录');
        return;
      }
      if (ctx.resetAccounts) await ctx.resetAccounts();
    });
    return b;
  }

  return wrap;
}
