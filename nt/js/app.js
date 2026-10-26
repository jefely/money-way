/**
 * 入口：装配（state → 门禁 → 视图 → 事件）。
 *
 * 数据流（零知识）：
 *   启动 → 有没有保险库？ → 没有：设置密码（派生密钥 + 加密初始数据）
 *                          → 有：输密码 → 解开 → 明文进内存
 *   每次改动 → state 更新 → saveState() 重新加密写盘
 *
 * 密钥只在 core/auth-manager 的闭包里，本文件不持有、也不外传。
 */

import { createState, addTransaction, updateTransaction, removeTransaction } from './core/state.js';
import { buildFlowRows, buildFooterInfo } from './ui/flow-model.js';
import { loadTemplates, renderRows } from './ui/render-transactions.js';
import { bindRowEditing } from './ui/row-editor.js';
import { showGate, hideGate } from './ui/gate.js';
import { checkBalanced, checkAccountingIdentity } from './core/validate.js';
import { statsForAccounts } from './core/stats.js';
import { hasVault, createVault, unlockVault, saveState } from './browser/storage-adapter.js';

let state = createState();
/** 存盘防抖句柄 */
let _saveTimer = 0;

function seedState() {
  const s = createState();
  return {
    ...s,
    accounts: [
      { id: 'acc-cash', cat: '资产类', sub: '现金', code: 'XJ', name: '现金', opening: '0', billDay: '', repayDay: '' },
      { id: 'acc-bank', cat: '资产类', sub: '储蓄', code: 'HC', name: '招行储', opening: '0', billDay: '', repayDay: '' },
      { id: 'acc-food', cat: '费用类', sub: '餐饮', code: 'CY', name: '餐饮', opening: '0', billDay: '', repayDay: '' },
    ],
  };
}

/** 持久化 + 重渲染。加密失败不能静默吞掉。 */
async function commit(nextState) {
  state = nextState;
  render();
  await flushSave();
}

/** 立即加密写盘。 */
async function flushSave() {
  clearTimeout(_saveTimer);
  _saveTimer = 0;
  try {
    await saveState(state);
    showStatus('');
  } catch (e) {
    showStatus('保存失败：' + e.message);
  }
}

/**
 * 行内编辑：只改 state 不重渲染（否则光标会丢），300ms 后统一加密写盘。
 * 加密 649KB 账本约 2ms，所以这个防抖纯粹是为了减少 IndexedDB 事务次数。
 */
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(flushSave, 300);
}

function render() {
  renderRows(document.getElementById('nt-flow-body'), buildFlowRows(state));
  renderFooterEl(buildFooterInfo(state));
  renderChecks();
}

function renderFooterEl(info) {
  const el = document.getElementById('nt-footer');
  if (el) el.textContent = `共 ${info.count} 笔 · 合计 ${info.totalText}`;
}

/** 两条校验 + 统计（全部来自 core） */
function renderChecks() {
  const bal = checkBalanced(state.transactions);
  const rows = statsForAccounts(state.transactions, state.accounts, { start: '', end: '' });
  const acc = checkAccountingIdentity(rows.map((r) => ({ cat: r.acc.cat, balance: r.stats.balance })));

  setText('nt-check-balanced', bal.ok ? '0 ✓' : `${bal.diff}  ✗`);
  setText('nt-check-identity', acc.ok ? '0 ✓' : `${acc.diff}  ✗`);
  setText('nt-check-detail', `${state.transactions.length} 笔 · ${state.accounts.length} 账户`);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showStatus(msg) {
  const el = document.getElementById('nt-status');
  if (el) el.textContent = msg;
}

/** 列表删除：事件委托（公约 1.1） */
function onListClick(ev) {
  const btn = ev.target.closest('.nt-cell-action button');
  if (!btn) return;
  const tr = btn.closest('tr');
  if (!tr || !tr.dataset.id) return;
  commit(removeTransaction(state, tr.dataset.id));
}

/**
 * 行内编辑的三个回调（由 ui/row-editor.js 触发）。
 * 注意：编辑时不重渲染 —— 重渲染会让输入框失焦、光标跳到开头。
 */
function onRowEdit(id, field, value) {
  const patch = {};
  if (field === 'date') patch.date = normalizeDateInput(value);
  else if (field === 'amount') patch.amount = normalizeAmountInput(value);
  else patch[field] = value;
  state = updateTransaction(state, id, patch);
  // 改了金额/日期会影响页脚与校验，这两处要实时刷新（不重建行）
  renderFooterEl(buildFooterInfo(state));
  renderChecks();
  scheduleSave();
}

function onRowCreate(fields) {
  state = addTransaction(state, {
    date: normalizeDateInput(fields.date || ''),
    from: fields.from || '',
    to: fields.to || '',
    amount: normalizeAmountInput(fields.amount || ''),
    note: fields.note || '',
  });
  render();
  scheduleSave();
}

function onRowDelete(id) {
  commit(removeTransaction(state, id));
}

/** 把 "26-08-30" / "2026-08-30" 统一成 ISO；认不出就原样留着。 */
function normalizeDateInput(v) {
  const s = String(v || '').trim();
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (digits.length === 6) {
    const y = new Date().getFullYear();
    const yy = Number(digits.slice(0, 2));
    const full = yy > y % 100 ? 1900 + yy : 2000 + yy;
    return `${full}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  }
  return s;
}

/** 剥掉 ¥ 与千分位，只留数字。 */
function normalizeAmountInput(v) {
  return String(v || '').replace(/[¥,\s]/g, '');
}

/** 解锁成功 → 显示主界面 */
function enterApp() {
  hideGate();
  render();
  document.getElementById('nt-app').hidden = false;
}

async function boot() {
  await loadTemplates();

  // 行内编辑版没有顶部表单；这里保留一处兼容：若页面里还有 #nt-form 就走老路径。

  // 行内编辑：改已有行不重渲染（保住光标），新增行填完才建单
  bindRowEditing(document.getElementById('nt-flow-body'), {
    onEdit: onRowEdit,
    onCreate: onRowCreate,
    onDelete: onRowDelete,
    onCommit: () => { flushSave(); },
  });

  // 关页面前把没落盘的改动写掉
  window.addEventListener('beforeunload', () => {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = 0; }
  });

  const exists = await hasVault();

  showGate(exists, {
    onUnlock: async (pw) => {
      const res = await unlockVault(pw);
      if (res.ok) {
        state = res.state && res.state.transactions ? res.state : seedState();
        enterApp();
      }
      return res;
    },
    onSetup: async (pw) => {
      state = seedState();
      try {
        await createVault(state, pw);
        enterApp();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: '设置失败：' + e.message };
      }
    },
  });
}

boot();
