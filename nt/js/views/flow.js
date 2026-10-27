// 界面：流水 tab
/**
 * 流水视图（页面装配）
 * 层：第五层 · UI
 *
 * 只做「行内编辑事件 → state → 重渲染」的接线；
 * 合计与余额全部来自 core 的纯函数，本文件不算钱。
 */

import {
  addTransaction, updateTransaction, removeTransaction, nextSeq,
} from '../core/state-store.js';
import { buildFlowRows, buildFooterInfo } from '../ui/flow-model.js';
import { renderRows } from '../ui/render-transactions.js';
import { parseAccountInput, suggestAccounts as suggestByIndex } from '../core/account-resolver.js';
import { bindRowEditing } from '../ui/row-editor.js';
import * as NtModal from '../ui/modal.js';
import { openAddDialog } from '../ui/add-dialog.js';
import { openSyncDialog } from '../ui/sync-dialog.js';

const WIP = '该功能在后续版本接入（当前版本先做单页壳）。';

export function mountFlow(section, ctx) {
  const body = section.querySelector('#nt-flow-body');

  bindRowEditing(body, {
    onEdit,
    onCreate,
    onDelete,
    onCommit: () => { ctx.saveNow(); },
    parseAccount: (v) => parseAccountInput(ctx.getIndex(), v),
    suggestAccounts: (v) => suggestByIndex(ctx.getIndex(), v),
  });

  bindToolbar(section, ctx);

  function render() {
    renderRows(body, buildFlowRows(ctx.getState()));
    ctx.setFooter(footerText());
  }

  function footerText() {
    const info = buildFooterInfo(ctx.getState());
    return `共 ${info.count} 笔 · 合计 ${info.totalText}`;
  }

  function onEdit(id, field, value, resolvedId) {
    const patch = {};
    if (field === 'date') patch.date = normalizeDateInput(value);
    else if (field === 'amount') patch.amount = normalizeAmountInput(value);
    else if (field === 'from' || field === 'to') {
      const accId = resolvedId || (parseAccountInput(ctx.getIndex(), value).acc || {}).id || null;
      patch[field === 'from' ? 'from_id' : 'to_id'] = accId;
    } else {
      patch[field] = value;
    }

    ctx.setState(updateTransaction(ctx.getState(), id, patch));
    ctx.setFooter(footerText());
    ctx.save();
  }

  function onCreate(fields) {
    const from = parseAccountInput(ctx.getIndex(), fields.from || '');
    const to = parseAccountInput(ctx.getIndex(), fields.to || '');
    if (!from.acc && !to.acc) {
      NtModal.info('没找到账户', (b) => {
        b.textContent = '转出 / 转入 至少要填一个已存在的账户（可打简码）。';
      });
      return;
    }

    const state = ctx.getState();
    ctx.setState(addTransaction(state, {
      date: normalizeDateInput(fields.date || todayIso()),
      from_id: from.acc ? from.acc.id : null,
      to_id: to.acc ? to.acc.id : null,
      amount: normalizeAmountInput(fields.amount || ''),
      note: fields.note || '',
      seq: nextSeq(state),
    }));
    render();
    ctx.save();
  }

  function onDelete(id) {
    ctx.setState(removeTransaction(ctx.getState(), id));
    render();
    ctx.save();
  }

  return { render };
}

/* ---------- 工具条 ---------- */

function bindToolbar(section, ctx) {
  section.querySelectorAll('[data-act="add"]').forEach((b) => {
    b.addEventListener('click', () => openAddDialog(ctx));
  });

  const sync = section.querySelector('[data-act="sync"]');
  if (sync) sync.addEventListener('click', () => openSyncDialog(ctx));

  const exp = section.querySelector('[data-act="export"]');
  if (exp) exp.addEventListener('click', () => NtModal.info('导出', (b) => { b.textContent = WIP; }));

  const acc = section.querySelector('[data-act="accounts"]');
  if (acc) acc.addEventListener('click', () => {
    if (ctx && ctx.openAccounts) ctx.openAccounts();
  });
}

/* ---------- 输入归一化 ---------- */

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function normalizeDateInput(v) {
  const s = String(v || '').trim();
  const d = s.replace(/[^0-9]/g, '');
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (d.length === 6) {
    const yy = Number(d.slice(0, 2));
    const full = yy > new Date().getFullYear() % 100 ? 1900 + yy : 2000 + yy;
    return `${full}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
  }
  return s || todayIso();
}

function normalizeAmountInput(v) {
  return String(v || '').replace(/[¥,\s]/g, '');
}
