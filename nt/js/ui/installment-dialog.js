/**
 * 新增分期弹窗（UI 层）
 *
 * 收集：账户 / 本金 / 利息 / 期数 / 首月 / 还款日。
 * 校验交给 core：期数 > 0、首月格式、金额 > 0。
 * 落库由调用方负责（addScheduled）。
 */

import * as NtModal from './modal.js';
import { normalizeMonth } from '../core/schema.js';

/**
 * @param {{
 *   accounts: Array<{id,name,type}>,
 *   onSubmit: (patch:object) => Promise<unknown>|unknown,
 *   onDone?: () => void
 * }} opts
 */
export function openInstallmentDialog(opts) {
  const o = opts || {};
  const accounts = (o.accounts || []).filter((a) => !a.isHidden);

  let nameSel = null;
  let principalIn = null;
  let interestIn = null;
  let periodsIn = null;
  let monthIn = null;
  let dayIn = null;
  let errBox = null;

  NtModal.open({
    title: '新增分期',
    build: (body) => {
      const tip = document.createElement('p');
      tip.className = 'nt-sync-hint';
      tip.textContent = '每月应还 =（本金 + 利息）÷ 期数。首月填 YYMM，例如 2610 表示 2026 年 10 月。';
      body.appendChild(tip);

      const grid = document.createElement('div');
      grid.className = 'nt-form-grid';

      nameSel = document.createElement('select');
      nameSel.className = 'nt-input';
      for (const a of accounts) {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name + (a.type ? '（' + a.type + '）' : '');
        nameSel.appendChild(opt);
      }
      grid.appendChild(field('账户', nameSel));

      principalIn = numberInput('12000');
      grid.appendChild(field('本金', principalIn));

      interestIn = numberInput('720');
      grid.appendChild(field('利息', interestIn));

      periodsIn = numberInput('12');
      grid.appendChild(field('期数', periodsIn));

      monthIn = document.createElement('input');
      monthIn.className = 'nt-input';
      monthIn.placeholder = '2610';
      monthIn.maxLength = 6;
      monthIn.inputMode = 'numeric';
      grid.appendChild(field('首月', monthIn));

      dayIn = numberInput('5');
      grid.appendChild(field('还款日', dayIn));

      body.appendChild(grid);

      errBox = document.createElement('p');
      errBox.className = 'nt-import-err';
      body.appendChild(errBox);

      if (!accounts.length) {
        errBox.textContent = '还没有账户，先去「设置」页建一个。';
      }
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '保存',
        kind: 'primary',
        close: false,
        onClick: async ({ close: c }) => {
          const r = collect();
          if (r.error) {
            errBox.textContent = r.error;
            return;
          }
          await o.onSubmit(r.patch);
          c();
          if (o.onDone) o.onDone();
        },
      },
    ],
  });

  function collect() {
    const principal = Number(principalIn.value) || 0;
    const interest = Number(interestIn.value) || 0;
    const periods = Math.floor(Number(periodsIn.value) || 0);
    const day = Math.floor(Number(dayIn.value) || 0);
    const firstMonth = normalizeMonth(monthIn.value);

    if (!nameSel.value) return { error: '先选一个账户' };
    if (!(principal > 0)) return { error: '本金要大于 0' };
    if (interest < 0) return { error: '利息不能是负数' };
    if (!(periods > 0)) return { error: '期数要大于 0' };
    if (!firstMonth) return { error: '首月格式不对，应该像 2610 这样' };
    if (!(day >= 1 && day <= 31)) return { error: '还款日要在 1~31 之间' };

    return {
      patch: {
        to_id: nameSel.value,
        from_id: null,
        amount: Math.round(((principal + interest) / periods) * 100) / 100,
        day,
        note: '分期',
        inst: { periods, firstMonth, principal, interest },
      },
    };
  }
}

function field(label, el) {
  const box = document.createElement('label');
  box.className = 'nt-form-row';
  const span = document.createElement('span');
  span.textContent = label;
  box.appendChild(span);
  box.appendChild(el);
  return box;
}

function numberInput(placeholder) {
  const i = document.createElement('input');
  i.className = 'nt-input';
  i.type = 'text';
  i.inputMode = 'decimal';
  i.placeholder = placeholder || '';
  return i;
}
