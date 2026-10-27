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
import { splitByTime } from '../timeline/time-state.js';
import { mountCellRange } from '../ui/cell-range.js';
import { openImportDialog } from '../ui/import-dialog.js';
import { openExportDialog } from '../ui/export-dialog.js';

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

  /**
   * 把导入解析结果写进 state。
   *
   * 通用表能直接导（转出/转入就是账户名）；
   * 账单是单边记录，必须补出另一端，补不出来就跳过并计数 —— 不能静默丢数据。
   */
  function importItems(res) {
    const idx = ctx.getIndex();
    let st = ctx.getState();

    const acc = (v) => {
      if (!v) return null;
      const r = parseAccountInput(idx, String(v).trim());
      return (r && r.acc) || null;
    };

    // 兜底「我的账户」：第一个资产类账户
    const fallbackSelf = (state) => {
      const list = (state.accounts || []).filter((a) => a && a.type === '资产类');
      return list.length ? list[0] : null;
    };

    let added = 0;
    let skipped = 0;

    for (const it of res.items) {
      const amount = Math.abs(Number(it.amount) || 0);
      if (!amount) { skipped += 1; continue; }

      let fromId = null;
      let toId = null;

      if (res.kind === 'generic') {
        const f = acc(it.from);
        const t = acc(it.to);
        if (!f || !t) { skipped += 1; continue; }
        fromId = f.id;
        toId = t.id;
      } else {
        // 账单：单边。支出 = 我的账户 → 对方；收入 = 对方 → 我的账户
        const self = acc(it.method) || fallbackSelf(st);
        const other = acc(it.party);
        if (!self || !other) { skipped += 1; continue; }

        const isIncome = /收入/.test(it.dir || '');
        if (isIncome) { fromId = other.id; toId = self.id; }
        else { fromId = self.id; toId = other.id; }
      }

      st = addTransaction(st, {
        date: it.date,
        from_id: fromId,
        to_id: toId,
        amount,
        note: it.note || it.item || it.party || '',
      });
      added += 1;
    }

    ctx.setState(st);
    ctx.save();
    render();

    ctx.setFooter(`导入 ${added} 笔` + (skipped ? `，跳过 ${skipped} 笔（账户认不出）` : ''));
  }

  bindToolbar(section, ctx);

  // 单元格区域框选：长按起手，可复制 / 粘贴 / 批量删除行
  const flowTable = section.querySelector('.nt-table-flow');
  mountCellRange(flowTable, {
    onNotice: (t) => ctx.setFooter(t),
    onDeleteRows: (ids) => {
      let st = ctx.getState();
      for (const id of ids) st = removeTransaction(st, id);
      ctx.setState(st);
      ctx.save();
      render();
    },
  });

  function render() {
    const st = ctx.getState();
    // 未来分期推成虚拟行（只读），让「计划」和「已发生」在同一张表里分得清
    let virtual = [];
    try {
      virtual = splitByTime(st.transactions, st.accounts, st.scheduled || [], {
        targetDate: todayIso(),
      }).virtual;
    } catch (e) {
      // 分期数据坏了不该挡住流水页，但错误必须留痕，否则虚拟行悄悄消失
      if (typeof console !== 'undefined') console.error('[flow] splitByTime 失败', e);
      window.__tlError = String(e && e.message || e);
    }
    renderRows(body, buildFlowRows(st, virtual));
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
  if (exp) {
    exp.addEventListener('click', () => openExportDialog({
      getState: () => ctx.getState(),
      codeOf: (id) => {
        const a = ctx.getIndex().byId.get(id);
        return a ? (a.code || a.name || '') : '';
      },
    }));
  }

  const imp = section.querySelector('[data-act="import"]');
  if (imp) {
    imp.addEventListener('click', () => {
      openImportDialog({ onImport: (res) => importItems(res) });
    });
  }

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
