// 界面：设置 → 重置
/**
 * 重置确认。必须输入「重置」两个字。
 * 层：第五层 · UI
 *
 * 两档：清空整本，或只把账户表换回内置三户、流水和计划留下。
 */

import * as NtModal from './modal.js';
import { SEED_ACCOUNTS } from '../core/reset-book.js';

export function openResetDialog(ctx) {
  let word = null;
  let err = null;
  let mode = 'wipe';
  const state = ctx.getState();
  const nTx = (state.transactions || []).length;
  const nAcc = (state.accounts || []).filter((a) => a && !a.isHidden).length;
  const nPlan = (state.scheduled || []).length;

  NtModal.open({
    title: '重置',
    build: (body) => {
      const hint = document.createElement('p');
      hint.className = 'nt-sync-hint';
      hint.textContent = `当前 ${nAcc} 个账户、${nTx} 笔流水、${nPlan} 条计划。`
        + '清空会删掉这些并回到设密码之前。'
        + `只重置账户会换回内置的 ${SEED_ACCOUNTS.length} 个，流水和计划保留；`
        + '名字对得上的会接回去，对不上的要到校验页里改。';
      body.appendChild(hint);

      const bar = document.createElement('div');
      bar.className = 'nt-exp-bar';
      const wipe = modeBtn('清空整本', 'wipe');
      const keep = modeBtn('只重置账户', 'keep');
      bar.appendChild(wipe);
      bar.appendChild(keep);
      body.appendChild(bar);

      word = document.createElement('input');
      word.type = 'text';
      word.className = 'nt-input';
      word.placeholder = '输入 重置';
      word.setAttribute('aria-label', '输入重置');
      body.appendChild(word);

      err = document.createElement('p');
      err.className = 'nt-sync-hint';
      body.appendChild(err);

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
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '确定',
        kind: 'danger',
        close: false,
        onClick: async ({ close }) => {
          if (!word || word.value.trim() !== '重置') {
            if (err) err.textContent = '请输入「重置」两个字';
            return;
          }
          close();
          if (mode === 'keep') {
            if (ctx.resetAccounts) await ctx.resetAccounts();
            return;
          }
          if (ctx.resetAll) await ctx.resetAll();
        },
      },
    ],
  });
}
