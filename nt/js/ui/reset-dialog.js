// 界面：节点模板弹窗里的「重置」区
/**
 * 重置不再是一个独立弹窗（用户 2026-11：整合进「节点模板」弹窗）。
 * 这里只负责生成那一块界面 + 自己的确认逻辑，按钮也在块内，不占弹窗的 actions。
 *
 * 两档：清空整本，或只把账户表换回内置三户、流水和计划留下。
 * 都必须输入「重置」两个字才执行。
 */

import { SEED_ACCOUNTS } from '../core/reset-book.js';

/**
 * @param {object} ctx app 上下文（需要 getState / resetAll / resetAccounts）
 * @param {Function} close 关闭外层弹窗
 * @returns {HTMLElement}
 */
export function resetSection(ctx, close) {
  const state = ctx.getState();
  const nTx = (state.transactions || []).length;
  const nAcc = (state.accounts || []).filter((a) => a && !a.isHidden).length;
  const nPlan = (state.scheduled || []).length;
  let mode = 'wipe';

  const wrap = document.createElement('div');
  wrap.className = 'nt-reset-block';

  const title = document.createElement('p');
  title.className = 'nt-reset-title';
  title.textContent = '③ 重置';
  wrap.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'nt-sync-hint';
  hint.textContent = `当前 ${nAcc} 个节点、${nTx} 笔流水、${nPlan} 条计划。`
    + '清空会删掉这些并回到设密码之前。'
    + `只重置节点会换回内置的 ${SEED_ACCOUNTS.length} 个，流水和计划保留；`
    + '名字对得上的会接回去，对不上的要到校验页里改。';
  wrap.appendChild(hint);

  const bar = document.createElement('div');
  bar.className = 'nt-exp-bar';
  const wipe = modeBtn('清空整本', 'wipe');
  const keep = modeBtn('只重置节点', 'keep');
  bar.appendChild(wipe);
  bar.appendChild(keep);
  wrap.appendChild(bar);

  const word = document.createElement('input');
  word.type = 'text';
  word.className = 'nt-input';
  word.placeholder = '输入 重置';
  word.setAttribute('aria-label', '输入重置');
  wrap.appendChild(word);

  const err = document.createElement('p');
  err.className = 'nt-sync-hint';
  wrap.appendChild(err);

  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'nt-btn nt-btn-sm nt-btn-danger';
  go.textContent = '执行重置';
  go.addEventListener('click', async () => {
    if (word.value.trim() !== '重置') {
      err.textContent = '请输入「重置」两个字';
      return;
    }
    if (close) close();
    if (mode === 'keep') {
      if (ctx.resetAccounts) await ctx.resetAccounts();
      return;
    }
    if (ctx.resetAll) await ctx.resetAll();
  });
  wrap.appendChild(go);

  function modeBtn(label, value) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-btn nt-btn-sm';
    b.textContent = label;
    b.addEventListener('click', () => {
      mode = value;
      wipe.setAttribute('aria-pressed', mode === 'wipe' ? 'true' : 'false');
      keep.setAttribute('aria-pressed', mode === 'keep' ? 'true' : 'false');
    });
    b.setAttribute('aria-pressed', value === 'wipe' ? 'true' : 'false');
    return b;
  }

  return wrap;
}
