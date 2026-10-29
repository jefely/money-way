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
  removeBatch, restoreBatch, noteTextByCode, ensureAccountByText,
} from '../core/state-store.js';
import { createScheduled } from '../core/schema.js';
import { buildFlowRows, buildFooterInfo } from '../ui/flow-model.js';
import { moneyOrBlank } from '../core/format.js';
import { renderRows, patchRow } from '../ui/render-transactions.js';
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
  // 只在进入流水页的第一次 render 时滚到末尾；之后（建单/删除触发 render）
  // 不再动滚动位置 —— 否则输入金额转正那一瞬间视图会跳（用户 2026-10-30）
  let scrollInit = false; let lastRowCount = 0;

  bindRowEditing(body, {
    onEdit,
    onCreate,
    onDelete,
    onCommit: () => { ctx.saveNow(); },
    parseAccount: (v) => parseAccountInput(ctx.getIndex(), v),
    suggestAccounts: (v) => suggestByIndex(ctx.getIndex(), v),
    // 备注简码：失焦时把「简码」换成备注表里的文本（仅备注栏用，不碰账户简码）
    resolveNote: (v) => noteTextByCode(ctx.getState(), v),
    // 金额失焦后统一成「¥1,234.56」的财务格式（用户 2026-10-30）
    formatAmount: (v) => moneyOrBlank(normalizeAmountInput(v)),
  });

  /* ---------- 「固定」列复选框 ----------
     勾上 = 按这笔流水生成一条固定收支规则（频率默认每月、日期取流水的日）；
     取消 = 删掉由它生成的那条规则。关联字段是 scheduled.srcTxId。
     事件挂在 tbody 上（每次 render 都会重建行，绑在行上会丢）。 */
  body.addEventListener('change', (ev) => {
    const box = ev.target && ev.target.closest && ev.target.closest('.nt-fixed-box');
    if (!box) return;
    const tr = box.closest('tr');
    const id = tr && tr.dataset.id;
    if (id) toggleFixed(id, box.checked);
  });

  /** 勾选框 → 固定收支规则。生成后到「固定」页可以改频率 / 日期。 */
  function toggleFixed(txId, on) {
    const st = ctx.getState();
    const list = st.scheduled || [];

    if (!on) {
      ctx.setState({ ...st, scheduled: list.filter((s) => !s || s.srcTxId !== txId) });
      ctx.save();
      render();
      return;
    }

    const tx = (st.transactions || []).find((t) => t && t.id === txId);
    // 期初流水没有业务日期，不该变成规则
    if (!tx || tx.opening) { render(); return; }
    if (list.some((s) => s && s.srcTxId === txId)) return;   // 已经生成过

    // 日期取「几号」：260801 → 1 号；260825 → 25 号
    const day = Number(String(tx.date || '').slice(-2)) || 1;
    const sched = createScheduled({
      freq: 'monthly',
      day,
      from_id: tx.from_id,
      to_id: tx.to_id,
      amount: tx.amount,
      note: tx.note,
      srcTxId: txId,
    });

    ctx.setState({ ...st, scheduled: [...list, sched] });
    ctx.save();
    render();
    ctx.setFooter(`已加入固定收支：每月 ${day} 号 · 可在「固定」页改频率或删除`);
  }

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
    // 整本备份 / .lz 快照：直接用备份里的账户 / 流水 / 计划替换当前 state
    onImportTemplate: (next, stats) => {
      ctx.setState(next);
      ctx.saveNow();
      render();
      const tail = (stats.scheduled != null)
        ? ` · 计划 ${stats.scheduled} 条`
        : ` · 固定 ${stats.fixed || 0} 条 · 分期 ${stats.inst || 0} 条`;
      ctx.setFooter(`已从备份恢复：账户 ${stats.accounts} 个 · 流水 ${stats.transactions} 笔${tail}`);
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
    const rows = buildFlowRows(st, virtual);
    renderRows(body, rows); lastRowCount = rows.length;
    // 滚到「数据末尾」：最后一笔数据贴着视口底，40 行空行在它下面继续
    // （直接滚到 scrollHeight 的话，视口里全是空行，刚录的那笔反而看不见）
    const wrap = body.closest('.nt-tablewrap');
    if (wrap && !scrollInit) {
      scrollInit = true;
      // 用户 2026-10-30：把最后一条有内容的行放在视口第 6 行 ——
      // 打开就能看到最后 6 行内容，下面全是可输入的空行。
      // 行高取「非 spacer 行」：spacer 只是个撑高度的空行，高度算出来是双倍。
      const first = body.querySelector('tr[data-id]') || body.querySelector('tr[data-new="1"]');
      const rowH = first ? first.getBoundingClientRect().height || 34 : 34;
      wrap.scrollTop = Math.max(0, (rows.length - 6) * rowH);
    }
    ctx.setFooter(footerText());
  }

  function footerText() {
    const i = buildFooterInfo(ctx.getState());
    return `共 ${i.count} 笔 · 合计 ${i.totalText}`;
  }

  function onEdit(id, field, value, resolvedId) {
    const patch = {};
    if (field === 'date') patch.date = normalizeDateInput(value);
    else if (field === 'amount') patch.amount = normalizeAmountInput(value);
    else if (field === 'from' || field === 'to') {
      // 流水只负责记录：认不出的文本自动建一个未分类账户（不拦录入）
      let accId = resolvedId || (parseAccountInput(ctx.getIndex(), value).acc || {}).id || null;
      if (!accId) { const r = ensureAccountByText(ctx.getState(), value); if (r.id) { ctx.setState(r.state); accId = r.id; } }
      patch[field === 'from' ? 'from_id' : 'to_id'] = accId;
    } else {
      patch[field] = value;
    }

    // 虚拟滚动的窗口快照也要更新，否则一滚动重建就显示旧值
    if (field === 'note') patchRow(id, { note: value });
    else if (field === 'date') patchRow(id, { dateEdit: value });
    else if (field === 'amount') patchRow(id, { amountEdit: value });
    else if (field === 'from' || field === 'to') patchRow(id, { [field]: value });

    ctx.setState(updateTransaction(ctx.getState(), id, patch));
    ctx.setFooter(footerText());
    ctx.save();
  }

  function onCreate(fields) {
    // 流水只负责记录（用户 2026-10-30）：转出/转入可以随便写，
    // 认不出的文本自动建一个未分类账户，不拦录入。
    let s = ctx.getState();
    const from = parseAccountInput(ctx.getIndex(), fields.from || '');
    const to = parseAccountInput(ctx.getIndex(), fields.to || '');
    let fromId = from.acc ? from.acc.id : null;
    let toId = to.acc ? to.acc.id : null;
    if (!fromId && fields.from) { const r = ensureAccountByText(s, fields.from); s = r.state; fromId = r.id; }
    if (!toId && fields.to) { const r = ensureAccountByText(s, fields.to); s = r.state; toId = r.id; }
    if (!fromId && !toId) return;   // 两边都空：不建单

    // 还没填金额 = 用户只是先把账户名写上了（自由录入：想在哪个空行写就在哪行写）。
    // 这时只把账户登记进设置表，不建一笔金额为空的流水。
    if (!normalizeAmountInput(fields.amount || '')) { ctx.setState(s); ctx.save(); render(); return; }

    // 建单要重建整表；先把滚动位置记下来，重建后放回去 ——
    // 否则在末尾空行里敲金额，整页会跳回第一行（用户 2026-10-30）
    const wrap = body.closest('.nt-tablewrap'); const keepTop = wrap ? wrap.scrollTop : 0;

    ctx.setState(addTransaction(s, {
      date: normalizeDateInput(fields.date || todayIso()),
      from_id: fromId,
      to_id: toId,
      amount: normalizeAmountInput(fields.amount || ''),
      note: fields.note || '',
      seq: nextSeq(s),
    }));
    render();
    // 建单后表格高度刚变，同步设 scrollTop 会被 clamp 回顶部 —— 等一帧再放回去
    if (wrap) requestAnimationFrame(() => { wrap.scrollTop = keepTop; });
    return ctx.save();
  }

  function onDelete(id) {
    ctx.setState(removeTransaction(ctx.getState(), id));
    render();
    ctx.save();
  }

  /**
   * 切回流水页时用：重置「已定位」标记并重渲染 —— 定位逻辑集中在 render 里，
   * 这里不另算一遍（之前两处各算一次，行高取错就定不到位，用户 2026-10-30）。
   */
  function focusEnd() {
    scrollInit = false;
    render();
  }

  return { render, focusEnd };
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
  const d = new Date(); const m = String(d.getMonth() + 1).padStart(2, '0');
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
