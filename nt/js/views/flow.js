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
  removeBatch, restoreBatch,
} from '../core/state-store.js';
import { buildFlowRows, buildFooterInfo } from '../ui/flow-model.js';
import { renderRows } from '../ui/render-transactions.js';
import { parseAccountInput, suggestAccounts as suggestByIndex, ensurePendingAccount } from '../core/account-resolver.js';
import { bindRowEditing } from '../ui/row-editor.js';
import * as NtModal from '../ui/modal.js';
import { openAddDialog } from '../ui/add-dialog.js';
import { openSyncDialog } from '../ui/sync-dialog.js';
import { splitByTime } from '../timeline/time-state.js';
import { mountCellRange } from '../ui/cell-range.js';
import { showUndo } from '../ui/undo-bar.js';
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
   * 两端账户：认得出就用真账户，认不出的那一侧挂到「待分类」——**不整笔丢掉**。
   * 账单里的对方多半是商户名（「地铁」「某某餐厅」），它们本来就不是这个账本里的账户；
   * 旧版要求两端都解析成功，于是用户选完文件、看完预览、点「导入 N 笔」，
   * 一笔也没进来，只在页脚看到一个「跳过」。数据先落地的价值大得多。
   */
  function importItems(res) {
    let st = ctx.getState();
    const idx = ctx.getIndex();

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

    // 待分类账户按需创建（一次导入最多建一个）；st 会被换成含它的新 state
    let pendingAcc = null;
    const pending = () => {
      if (pendingAcc) return pendingAcc;
      const r = ensurePendingAccount(st);
      st = r.state;
      pendingAcc = r.acc;
      return pendingAcc;
    };

    let added = 0;
    let skipped = 0;
    let guessed = 0;

    for (const it of res.items) {
      const amount = Math.abs(Number(it.amount) || 0);
      if (!amount) { skipped += 1; continue; }

      let fromId = null;
      let toId = null;
      let loose = false;      // 这一笔有没有一侧落到「待分类」
      let dead = false;       // 两端都空 / 两端同账户 → 没有意义，跳过

      if (res.kind === 'generic') {
        const f = acc(it.from);
        const t = acc(it.to);
        if (f) fromId = f.id;
        else if (String(it.from || '').trim()) { fromId = pending().id; loose = true; }
        if (t) toId = t.id;
        else if (String(it.to || '').trim()) { toId = pending().id; loose = true; }
        if (!fromId && !toId) dead = true;
      } else {
        // 账单：单边。支出 = 我的账户 → 对方；收入 = 对方 → 我的账户
        const self = acc(it.method) || fallbackSelf(st);
        const other = acc(it.party);

        const selfId = self ? self.id : pending().id;
        const otherId = other ? other.id : pending().id;
        if (!self || !other) loose = true;

        const isIncome = /收入/.test(it.dir || '');
        if (isIncome) { fromId = otherId; toId = selfId; }
        else { fromId = selfId; toId = otherId; }
      }

      // 自己转自己：金额不落地，只会让统计多一笔假流水
      if (!dead && fromId && toId && fromId === toId) dead = true;
      if (dead) { skipped += 1; continue; }

      st = addTransaction(st, {
        date: it.date,
        from_id: fromId,
        to_id: toId,
        amount,
        note: it.note || it.item || it.party || '',
      });
      added += 1;
      if (loose) guessed += 1;
    }

    ctx.setState(st);
    ctx.save();
    render();

    ctx.setFooter(`导入 ${added} 笔`
      + (guessed ? `，${guessed} 笔有一侧账户认不出（已挂到「待分类」，可在流水表里改）` : '')
      + (skipped ? `，跳过 ${skipped} 笔（金额为空或两端同账户）` : ''));
  }

  bindToolbar(section, ctx, {
    onImport: importItems,
    // 整本备份：直接用备份里的账户 / 流水 / 计划替换当前 state
    onImportTemplate: (next, stats) => {
      ctx.setState(next);
      ctx.saveNow();
      render();
      ctx.setFooter(`已从备份恢复：账户 ${stats.accounts} 个 · 流水 ${stats.transactions} 笔`
        + ` · 固定 ${stats.fixed} 条 · 分期 ${stats.inst} 条`);
    },
  });

  // 单元格区域框选：长按起手，可复制 / 粘贴 / 批量删除行
  const flowTable = section.querySelector('.nt-table-flow');
  mountCellRange(flowTable, {
    onNotice: (t) => ctx.setFooter(t),
    onDeleteRows: (ids) => {
      const before = ctx.getState();
      const r = removeBatch(before, 'transactions', ids);
      ctx.setState(r.state);
      ctx.save();
      render();

      // 框选一次能删掉整片，误删的代价太大 —— 给 8 秒撤销
      showUndo(`已删除 ${r.removed.length} 笔流水`, () => {
        const s0 = ctx.getState();
        ctx.setState(restoreBatch(s0, 'transactions', r.removed));
        ctx.saveNow();
        render();
        ctx.setFooter(`已恢复 ${r.removed.length} 笔流水`);
      });
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

/**
 * 工具条接线。
 *
 * 注意这里是**模块级**函数：mountFlow 内部的 importItems 拿不到，
 * 必须由调用方通过 h.onImport 传进来。早先这里直接写 `onImport: (res) => importItems(res)`，
 * 结果是「确认导入」时抛 `importItems is not defined` —— 对话框能开、能预览，
 * 但一笔也写不进库，而且只在点确认那一刻才炸。
 */
function bindToolbar(section, ctx, h) {
  const o = h || {};

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
      // 导出 .xlsx 模板时账户列写全名（和单文件版的备份一致）
      nameOf: (id) => {
        const a = ctx.getIndex().byId.get(id);
        return a ? (a.name || '') : '';
      },
    }));
  }

  const imp = section.querySelector('[data-act="import"]');
  if (imp) {
    imp.addEventListener('click', () => {
      openImportDialog({
        onImport: (res) => {
          if (o.onImport) o.onImport(res);
        },
        onImportTemplate: (state, stats) => {
          if (o.onImportTemplate) o.onImportTemplate(state, stats);
        },
      });
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
