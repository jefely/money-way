// 界面：流水 tab
/**
 * 流水视图（页面装配）
 * 层：第五层 · UI
 *
 * 只做「行内编辑事件 → state → 重渲染」的接线；
 * 合计与余额全部来自 core 的纯函数，本文件不算钱。
 */

import { addTransaction, updateTransaction, nextSeq, restoreBatch, noteTextByCode } from '../core/state-store.js';
import { afterTxEdit } from '../core/draft-book.js';
import { removeFlowTx, removeFlowBatch, unvoidKeys, markPlanHandled } from '../ui/plan-links.js';
import { mountComposer } from '../ui/composer.js';
import { createScheduled } from '../core/schema.js';
import { buildFlowRows, buildFooterInfo } from '../ui/flow-model.js';
import { moneyOrBlank, normalizeTypedDate, todayIso } from '../core/format.js';
import { fingerprintBag, takeIfNew, keysForIncoming } from '../core/import-dedupe.js';
import { renderRows, patchRow, promoteRow } from '../ui/render-transactions.js';
import { parseAccountInput, suggestAccounts as suggestByIndex, ensurePendingAccount } from '../core/account-resolver.js';
import { endFromText, endsFromFields, joinHeld } from '../ui/flow-ends.js';
import { bindRowEditing } from '../ui/row-editor.js';
import { bindCellEdit } from '../ui/cell-edit.js';
import { openAddDialog } from '../ui/add-dialog.js';
import { openSyncDialog } from '../ui/sync-dialog.js';
import { splitByTime } from '../timeline/time-state.js';
import { bindPlanRowActions, scrollToLast as scrollLast } from '../ui/plan-rows.js';
import { mountCellRange } from '../ui/cell-range.js';
import { showUndo } from '../ui/undo-bar.js';
import { openImportHub } from '../ui/import-hub.js';
import { applyBillPlan } from '../core/bill-apply.js';
import { openExportDialog } from '../ui/export-dialog.js';

export function mountFlow(section, ctx) {
  const body = section.querySelector('#nt-flow-body');
  // 只在进入流水页的第一次 render 时滚到末尾；之后（建单/删除触发 render）
  // 不再动滚动位置 —— 否则输入金额转正那一瞬间视图会跳（用户 2026-10-30）
  let scrollInit = false;
  /** 上次渲染时的数据版本；切 tab 回来时用它判断要不要真的重画 */
  let renderedVer = -1;

  const composer = mountComposer(section, ctx, body, () => render(true));
  bindPlanRowActions(body, ctx, () => render(true));

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

    // 源流水已代表当月这一期；标成已处理，否则自动到账会再补一笔。
    let next = { ...st, scheduled: [...list, sched] };
    next = markPlanHandled(next, sched.id, tx.date);
    ctx.setState(next);
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

    // 账单（支付宝 / 微信 / 招行）：走「六大核心元素」的强提取。
    // 节点按交易分类或商户自动建，方向按收/支，日期按用户填的起始日过滤。
    if (res && res.kind === 'bill') {
      const r = applyBillPlan(st, res, { from: res.fromDate, myAccountId: res.myAccountId, includeNeutral: res.includeNeutral });
      ctx.setState(r.state);
      ctx.save();
      render();
      const s = r.stats;
      ctx.setFooter(`导入 ${s.added} 笔`
        + (s.dup ? `，标红疑似重复 ${s.dup} 笔（可逐条删）` : '')
        + (s.created ? `，新建节点 ${s.created} 个` : '')
        + (s.transfer ? `，资金流转按转账导入 ${s.transfer} 笔` : '')
        + (s.before ? `，早于起始日跳过 ${s.before} 笔` : '')
        + (s.pending ? `，${s.pending} 笔资金流转待补另一端` : '')
        + (s.blank ? `，${s.blank} 笔缺一侧（按 U 区规则未入账）` : ''));
      return;
    }

    const idx = ctx.getIndex();

    const acc = (v) => {
      if (!v) return null;
      const r = parseAccountInput(idx, String(v).trim());
      return (r && r.acc) || null;
    };

    // 兜底「我的账户」：第一个资产类账户

    // 待分类账户按需创建（一次导入最多建一个）；st 会被换成含它的新 state
    let pendingAcc = null;
    const pending = () => {
      if (pendingAcc) return pendingAcc;
      const r = ensurePendingAccount(st);
      st = r.state;
      pendingAcc = r.acc;
      return pendingAcc;
    };

    let added = 0, skipped = 0, guessed = 0, dup = 0;
    const bag = fingerprintBag(st.transactions);

    for (const it of res.items) {
      const amount = Math.abs(Number(it.amount) || 0);
      if (!amount) { skipped += 1; continue; }

      let fromId = null; let toId = null;
      let loose = false;      // 这一笔有没有一侧落到「待分类」
      let dead = false;       // 两端都空 / 两端同账户 → 没有意义，跳过
      // 通用表：两端都是账户名
      const f = acc(it.from);
      const t = acc(it.to);
      if (f) fromId = f.id;
      else if (String(it.from || '').trim()) { fromId = pending().id; loose = true; }
      if (t) toId = t.id;
      else if (String(it.to || '').trim()) { toId = pending().id; loose = true; }
      if (!fromId && !toId) dead = true;

      // 自己转自己：金额不落地，只会让统计多一笔假流水
      if (!dead && fromId && toId && fromId === toId) dead = true;
      if (dead) { skipped += 1; continue; }

      const note = it.note || it.item || it.party || '';
      const billId = it.tradeNo ? String(it.tradeNo) : '';
      const row = { date: it.date, from_id: fromId, to_id: toId, amount, note, billId };
      if (!takeIfNew(bag, keysForIncoming(row))) { dup += 1; continue; }

      st = addTransaction(st, row);
      added += 1;
      if (loose) guessed += 1;
    }

    ctx.setState(st);
    ctx.save(); render();

    ctx.setFooter(`导入 ${added} 笔`
      + (dup ? `，跳过重复 ${dup} 笔` : '')
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
    onRestore: (next) => {
      ctx.setState(next);
      ctx.saveNow(); render();
      ctx.setFooter('已从加密备份恢复');
    },
  });

  // Excel 式单元格：单击选中（不显示光标、弹键盘）、再点取消、双击定位光标
  const cellEditor = bindCellEdit(body);

  // 单元格区域框选：长按起手，可复制 / 粘贴 / 批量删除行
  const flowTable = section.querySelector('.nt-table-flow');
  mountCellRange(flowTable, {
    editor: cellEditor,
    onNotice: (t) => ctx.setFooter(t),
    onDeleteRows: (ids) => {
      const r = removeFlowBatch(ctx.getState(), ids);
      ctx.setState(r.state); ctx.save(); render();

      // 框选一次能删掉整片，误删的代价太大 —— 给 8 秒撤销
      showUndo(`已删除 ${r.removed.length} 笔流水`, () => {
        const s0 = ctx.getState();
        const restored = restoreBatch(s0, 'transactions', r.removed);
        ctx.setState(unvoidKeys(restored, r.keys));
        ctx.saveNow(); render();
        ctx.setFooter(`已恢复 ${r.removed.length} 笔流水`);
      });
    },
  });

  function render(force) {
    const ver = typeof ctx.getVersion === 'function' ? ctx.getVersion() : -1;

    // 数据没变、表格还在 → 不重建。
    // 切 tab 回来就走这条：200 多行 DOM 重造一次约 45ms，而这时 DOM 本来就是对的
    // （用户 2026-11-01：从别的标签切回流水会卡，每次卡的时间差不多）。
    if (!force && ver >= 0 && ver === renderedVer && body.querySelector('tr')) {
      if (!scrollInit) { scrollInit = true; scrollLast(body); }
      ctx.setFooter(footerText()); return;
    }
    renderedVer = ver;

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
    // 整表重建前先放下单元格状态：旧 DOM 一换，引用就是死的
    if (cellEditor) cellEditor.reset();
    renderRows(body, rows);
    if (!scrollInit) { scrollInit = true; scrollLast(body); }
    ctx.setFooter(footerText());
    // 草稿行被删掉后，一句话输入条的引导也要跟着归零（用户 2026-11）
    if (composer && typeof composer.syncDraft === 'function') composer.syncDraft();
  }

  function footerText() {
    const i = buildFooterInfo(ctx.getState());
    return `共 ${i.count} 笔 · 合计 ${i.totalText}` + (i.drafts ? ` · 草稿 ${i.drafts} 笔未入账` : '');
  }

  function onEdit(id, field, value, resolvedId) {
    const patch = {};
    if (field === 'date') patch.date = normalizeTypedDate(value);
    else if (field === 'amount') patch.amount = normalizeAmountInput(value);
    else if (field === 'from' || field === 'to') {
      const tx = (ctx.getState().transactions || []).find((t) => t && t.id === id);
      const hit = endFromText(ctx.getState(), ctx.getIndex(), value, resolvedId, tx && tx.note);
      if (hit.state !== ctx.getState()) ctx.setState(hit.state);
      if (hit.note !== (tx && tx.note || '')) patch.note = hit.note;
      patch[field === 'from' ? 'from_id' : 'to_id'] = hit.id;
    } else {
      patch[field] = value;
    }

    // 虚拟滚动的窗口快照也要更新，否则一滚动重建就显示旧值
    if (field === 'note') patchRow(id, { note: value });
    else if (field === 'date') patchRow(id, { dateEdit: value });
    else if (field === 'amount') patchRow(id, { amountEdit: value });
    else if (field === 'from' || field === 'to') patchRow(id, { [field]: value });

    ctx.setState(afterTxEdit(updateTransaction(ctx.getState(), id, patch), id, field));
    ctx.setFooter(footerText());
    ctx.save();
    // 手动把草稿补全（或改回非草稿）时，一句话输入条的引导也要跟着归零
    if (composer && typeof composer.syncDraft === 'function') composer.syncDraft();
  }

  function onCreate(fields, tr) {
    // 流水只负责记录（用户 2026-10-30）：转出/转入可以随便写，
    // 认不出的文本自动建一个未分类账户，不拦录入。
    const ends = endsFromFields(ctx.getState(), ctx.getIndex(), fields);
    const s = ends.state;
    if (!ends.fromId && !ends.toId) return;

    // 还没填金额 = 用户只是先把账户名写上了（自由录入：想在哪个空行写就在哪行写）。
    // 这时只把账户登记进设置表，不建一笔金额为空的流水。
    // 这里**绝不能 render()** —— 一重建整表，用户刚打进去的名字就被清空，
    // 看起来就是「输入的未建档账户自动消失」（用户 2026-10-30 报的正是这个）。
    if (!normalizeAmountInput(fields.amount || '')) { ctx.setState(s); ctx.save(); return; }

    ctx.setState(addTransaction(s, {
      date: normalizeTypedDate(fields.date || todayIso()),
      from_id: ends.fromId,
      to_id: ends.toId,
      amount: normalizeAmountInput(fields.amount || ''),
      note: joinHeld(fields.note, ends.held),
      seq: nextSeq(s),
    }));

    // 建单不再重建整表（用户 2026-11-01：取消虚拟滚动，照单文件版的模式）：
    // 把这一行**就地转正** + 末尾补一个空行，别的行一行都不动 ——
    // 这样其它空行里写了一半的内容、光标、草稿全都原封不动。
    const all = buildFlowRows(ctx.getState());
    promoteRow(body, tr, all[all.length - 1]);
    // DOM 已经和数据对上了：把版本记下来，下次切 tab 回来不必再重建
    renderedVer = typeof ctx.getVersion === 'function' ? ctx.getVersion() : -1;
    ctx.setFooter(footerText());
    return ctx.save();
  }

  function onDelete(id) {
    // 删掉自动到账的那一期 → 同时作废，避免下次自动补回来
    ctx.setState(removeFlowTx(ctx.getState(), id));
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
      shareBackup: () => (ctx.shareBackup ? ctx.shareBackup() : Promise.reject(new Error('不能备份'))), encryptedBackupText: () => (ctx.encryptedBackupText ? ctx.encryptedBackupText() : Promise.reject(new Error('不能备份'))),
      onBackedUp: () => { if (ctx.markBackup) ctx.markBackup(); },
    }));
  }

  const imp = section.querySelector('[data-act="import"]');
  if (imp) {
    imp.addEventListener('click', () => {
      const open = (aliases) => openImportHub({
        mergeText: (text) => (ctx.mergeText ? ctx.mergeText(text) : 0),
        setFooter: (t) => ctx.setFooter(t),
        accounts: ctx.getState().accounts,
        aliases: aliases || [],
        onImport: (res) => { if (o.onImport) o.onImport(res); },
        onImportTemplate: (state, stats) => { if (o.onImportTemplate) o.onImportTemplate(state, stats); },
        restoreBackup: (text, password) => (ctx.restoreBackup ? ctx.restoreBackup(text, password) : Promise.reject(new Error('不能恢复'))),
        onRestore: (next) => { if (o.onRestore) o.onRestore(next); },
      });
      // 别名表是软件级的（跨账本），开窗口前取一次；读不到就按空表走
      (typeof ctx.loadAliases === 'function' ? ctx.loadAliases() : Promise.resolve([]))
        .then(open).catch(() => open([]));
    });
  }

  const acc = section.querySelector('[data-act="accounts"]');
  if (acc) acc.addEventListener('click', () => {
    if (ctx && ctx.openAccounts) ctx.openAccounts();
  });
}

function normalizeAmountInput(v) {
  return String(v || '').replace(/[¥,\s]/g, '');
}
