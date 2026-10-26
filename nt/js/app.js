/**
 * 入口：装配（门禁 → state → 索引 → 视图 → 事件）。
 *
 * 数据流（ID 模型 + 简码 + 零知识）：
 *   启动 → 有没有保险库？ → 没有：设置密码 → 有：输密码 → 解开
 *   行内编辑 → 输入简码/名字 → 解析成 ID → 改 state → 防抖加密写盘
 *
 * 索引策略：state.accounts 一变就重建一次（100 个账户约 0.05ms），
 * 之后每次按键查 byCode / byName 都是 O(1)。
 */

import {
  createState, addAccount, addTransaction, updateTransaction,
  removeTransaction, nextSeq,
} from './core/state-store.js';
import { ACCOUNT_TYPE, normalizeCode } from './core/schema.js';
import { balancesOf } from './core/balance-calculator.js';
import { buildAccountIndex } from './core/account-index.js';
import { parseAccountInput, suggestAccounts as suggestByIndex } from './core/account-resolver.js';
import { buildFlowRows, buildFooterInfo } from './ui/flow-model.js';
import { loadTemplates, renderRows } from './ui/render-transactions.js';
import { bindRowEditing } from './ui/row-editor.js';
import { showGate, hideGate } from './ui/gate.js';
import { hasVault, createVault, unlockVault, saveState } from './browser/db.js';
import { migrate } from './core/migrate.js';

let state = createState();
let index = buildAccountIndex(state.accounts);
let _saveTimer = 0;

/** state 一变就重建索引（唯一入口） */
function setState(next) {
  state = next;
  index = buildAccountIndex(state.accounts);
}

function seedState() {
  let s = createState();
  s = addAccount(s, { id: 'acc_cash', code: 'XJ', name: '现金', type: ACCOUNT_TYPE.ASSET, category: '现金' });
  s = addAccount(s, { id: 'acc_bank', code: 'ZHC', name: '招行储', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'acc_food', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '餐饮' });
  return s;
}

/* ---------- 存盘 ---------- */

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

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(flushSave, 300);
}

/* ---------- 渲染 ---------- */

function render() {
  renderRows(document.getElementById('nt-flow-body'), buildFlowRows(state));
  renderFooterEl(buildFooterInfo(state));
  renderChecks();
}

function renderFooterEl(info) {
  const el = document.getElementById('nt-footer');
  if (el) el.textContent = `共 ${info.count} 笔 · 合计 ${info.totalText}`;
}

function renderChecks() {
  const rows = balancesOf(state.accounts, state.transactions);
  const sum = {};
  for (const r of rows) sum[r.acc.type] = (sum[r.acc.type] || 0) + r.balance;

  const diff = Math.round((
    (sum[ACCOUNT_TYPE.ASSET] || 0) + (sum[ACCOUNT_TYPE.EXPENSE] || 0)
    - (sum[ACCOUNT_TYPE.LIABILITY] || 0) - (sum[ACCOUNT_TYPE.EQUITY] || 0)
    - (sum[ACCOUNT_TYPE.INCOME] || 0)
  ) * 100) / 100;

  const brokenTx = (state.transactions || []).filter((t) => !t.from_id || !t.to_id).length;
  const codesOk = index.duplicateCodes.length === 0 && index.missingCode.length === 0;

  setText('nt-check-balanced', brokenTx === 0 ? '0 ✓' : `${brokenTx} 笔断链 ✗`);
  setText('nt-check-identity', Math.abs(diff) < 0.005 ? '0 ✓' : `${diff}  ✗`);
  setText('nt-check-detail',
    `${state.transactions.length} 笔 · ${rows.length} 账户`
    + (codesOk ? '' : ` · 简码有问题：重复 ${index.duplicateCodes.length} / 缺失 ${index.missingCode.length}`));
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showStatus(msg) {
  const el = document.getElementById('nt-status');
  if (el) el.textContent = msg;
}

/* ---------- 行内编辑 ---------- */

/**
 * 账户格的特殊处理：调用方给了 resolvedId 就直接用，
 * 否则按输入文本解析（简码 / 名字）。
 */
function onRowEdit(id, field, value, resolvedId) {
  const patch = {};

  if (field === 'date') patch.date = normalizeDateInput(value);
  else if (field === 'amount') patch.amount = normalizeAmountInput(value);
  else if (field === 'from' || field === 'to') {
    const accId = resolvedId || (parseAccountInput(index, value).acc || {}).id || null;
    patch[field === 'from' ? 'from_id' : 'to_id'] = accId;
  } else patch[field] = value;

  setState(updateTransaction(state, id, patch));

  if (field === 'from' || field === 'to') {
    const key = field === 'from' ? 'from_id' : 'to_id';
    if (!patch[key]) showStatus(`没找到「${String(value).trim()}」这个账户（可打简码）`);
    else showStatus('');
  }

  renderFooterEl(buildFooterInfo(state));
  renderChecks();
  scheduleSave();
}

function onRowCreate(fields) {
  const from = parseAccountInput(index, fields.from || '');
  const to = parseAccountInput(index, fields.to || '');

  if (!from.acc && !to.acc) {
    showStatus('转出 / 转入 至少要填一个已存在的账户（可打简码）');
    return;
  }

  setState(addTransaction(state, {
    date: normalizeDateInput(fields.date || todayIso()),
    from_id: from.acc ? from.acc.id : null,
    to_id: to.acc ? to.acc.id : null,
    amount: normalizeAmountInput(fields.amount || ''),
    note: fields.note || '',
    seq: nextSeq(state),
  }));
  render();
  scheduleSave();
}

function onRowDelete(id) {
  setState(removeTransaction(state, id));
  render();
  scheduleSave();
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

/* ---------- 启动 ---------- */

function enterApp() {
  hideGate();
  render();
  document.getElementById('nt-app').hidden = false;
}

function adoptState(raw) {
  if (!raw || !Array.isArray(raw.transactions)) return seedState();
  return migrate(raw).state;
}

async function boot() {
  await loadTemplates();

  bindRowEditing(document.getElementById('nt-flow-body'), {
    onEdit: onRowEdit,
    onCreate: onRowCreate,
    onDelete: onRowDelete,
    onCommit: () => { flushSave(); },
    parseAccount: (v) => parseAccountInput(index, v),
    suggestAccounts: (v) => suggestByIndex(index, v),
  });

  window.addEventListener('beforeunload', () => {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = 0; }
  });

  const exists = await hasVault();

  showGate(exists, {
    onUnlock: async (pw) => {
      const res = await unlockVault(pw);
      if (res.ok) {
        setState(adoptState(res.state));
        enterApp();
      }
      return res;
    },
    onSetup: async (pw) => {
      setState(seedState());
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

export { state, index, addAccount, updateAccountProxy, normalizeCode };

/** 账户改动入口（未来设置页用）：改完自动重建索引 */
function updateAccountProxy(patch) {
  setState(addAccount(state, patch));
  return state.accounts[state.accounts.length - 1];
}

boot();
