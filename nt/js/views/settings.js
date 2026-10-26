/**
 * 设置视图（账户结构 + 六个功能）
 * 层：第五层 · UI
 *
 * 账户列表只读展示 + 删除；新增 / 改简码走既有的账户弹窗（ui/account-actions.js）。
 * 余额与期初全部来自 core 的纯函数，本文件不算钱。
 */

import { removeAccount } from '../core/state-store.js';
import { balanceOf } from '../core/balance-calculator.js';
import { renderMixed, renderEmpty } from '../ui/table.js';
import { money } from '../core/format.js';
import * as NtModal from '../ui/modal.js';
import { applyTheme, saveTheme } from '../ui/theme-manager.js';

const TYPES = ['资产类', '负债类', '收入类', '权益类', '费用类'];
const ACT_LABEL = { password: '修改密码', config: '配置', layout: '布局' };

export function mountSettings(section, ctx) {
  const body = section.querySelector('#nt-accounts-body');

  bindActions();
  body.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act="del"]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const id = tr && tr.dataset.id;
    if (!id) return;
    const acc = ctx.getIndex().byId.get(id);
    NtModal.confirmDanger(
      '删除账户',
      `确定删除「${acc ? acc.name : ''}」？引用它的流水也会一起删除。`,
      () => {
        ctx.setState(removeAccount(ctx.getState(), id));
        render();
        ctx.saveNow();
      },
      '删除',
    );
  });

  function render() {
    const state = ctx.getState();
    const visible = (state.accounts || []).filter((a) => a && !a.isHidden);

    const items = [];
    let seq = 0;

    for (const type of TYPES) {
      const accs = visible.filter((a) => a.type === type);
      if (!accs.length) continue;

      let groupOpening = 0;
      const rows = [];
      for (const acc of accs) {
        seq += 1;
        const op = openingAmount(state, acc.id);
        groupOpening += op;
        rows.push({
          id: acc.id,
          seq,
          type: acc.type,
          category: acc.category || '—',
          code: acc.code || '—',
          name: acc.name,
          opening: money(op),
        });
      }

      items.push({ tplId: 'tpl-account-group', data: { label: type, total: money(groupOpening) } });
      for (const row of rows) {
        items.push({
          tplId: 'tpl-account-row',
          data: row,
          decorate: (tr, r) => { tr.dataset.id = r.id; },
        });
      }
    }

    if (!items.length) renderEmpty(body, '还没有账户', 7);
    else renderMixed(body, items);

    ctx.setFooter(`${visible.length} 个账户 · ${(state.transactions || []).length} 笔流水`);
  }

  /* ---------- 六个功能 ---------- */

  function bindActions() {
    const bar = section.querySelector('.nt-vbar');
    if (!bar) return;
    const acts = bar.querySelectorAll('[data-act]');
    for (const el of acts) {
      el.addEventListener('click', () => onAction(el.getAttribute('data-act')));
    }
  }

  function onAction(act) {
    if (act === 'accounts') {
      if (ctx.openAccounts) ctx.openAccounts();
      return;
    }
    if (act === 'balance') { showBalance(); return; }
    if (act === 'theme') { showTheme(); return; }
    if (act === 'reset') { showReset(); return; }
    NtModal.info(ACT_LABEL[act] || act, (b) => { b.textContent = '该功能在后续版本接入。'; });
  }

  function showBalance() {
    const state = ctx.getState();
    const sum = {};
    for (const acc of state.accounts || []) {
      if (!acc) continue;
      const v = balanceOf(acc, state.transactions).balance;
      sum[acc.type] = (sum[acc.type] || 0) + v;
    }
    const asset = sum['资产类'] || 0;
    const liability = sum['负债类'] || 0;
    const equity = sum['权益类'] || 0;
    const income = sum['收入类'] || 0;
    const expense = sum['费用类'] || 0;
    const diff = Math.round((asset + expense - liability - equity - income) * 100) / 100;

    NtModal.info('期初配平', (b) => {
      const kv = document.createElement('dl');
      kv.className = 'nt-kv';
      addKV(kv, '资产类', money(asset));
      addKV(kv, '负债类', money(liability));
      addKV(kv, '权益类', money(equity));
      addKV(kv, '收入类', money(income));
      addKV(kv, '费用类', money(expense));
      addKV(kv, '资产 + 费用 − 负债 − 权益 − 收入', money(diff), Math.abs(diff) < 0.005 ? 'ok' : 'bad');
      b.appendChild(kv);
    });
  }

  function showTheme() {
    NtModal.open({
      title: '主题',
      build: (b) => {
        const p = document.createElement('p');
        p.textContent = '选择一个主题，立即生效并记住。';
        b.appendChild(p);
      },
      actions: [
        {
          label: '浅色',
          kind: 'ghost',
          close: false,
          onClick: ({ close }) => { applyTheme('light'); saveTheme('light'); close(); },
        },
        {
          label: '深色',
          kind: 'ghost',
          close: false,
          onClick: ({ close }) => { applyTheme('dark'); saveTheme('dark'); close(); },
        },
        { label: '关闭', kind: 'ghost', close: true },
      ],
    });
  }

  function showReset() {
    NtModal.open({
      title: '重置',
      body: '重置账本会清空全部数据（账户 + 流水），且不可恢复。',
      actions: [
        { label: '取消', kind: 'ghost', close: true },
        { label: '重置账本（清空）', kind: 'danger', close: false, onClick: () => { doReset(); } },
      ],
    });
  }

  async function doReset() {
    try {
      if (ctx.resetAll) await ctx.resetAll();
    } catch (e) {
      NtModal.info('重置失败', (b) => { b.textContent = e.message; });
    }
  }

  return { render };
}

function openingAmount(state, id) {
  let sum = 0;
  for (const t of state.transactions || []) {
    if (t.opening && (t.to_id === id || t.from_id === id)) sum += Number(t.amount) || 0;
  }
  return sum;
}

function addKV(dl, k, v, cls) {
  const dt = document.createElement('dt');
  dt.textContent = k;
  const dd = document.createElement('dd');
  dd.textContent = v;
  if (cls) dd.className = cls;
  dl.appendChild(dt);
  dl.appendChild(dd);
}
