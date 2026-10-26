/**
 * 入口：装配（门禁 → state → 视图 → 事件）。
 *
 * 数据流（ID 模型 + 零知识）：
 *   启动 → 有没有保险库？ → 没有：设置密码（派生密钥 + 加密初始数据）
 *                          → 有：输密码 → 解开 → 明文进内存
 *   行内编辑 → 改 state（存 ID） → 防抖 300ms → 加密写盘
 *
 * 本文件不持有密钥，也不做业务计算。
 */

import {
  createState, addAccount, addTransaction, updateTransaction,
  removeTransaction, nameOf, idOf, nextSeq,
} from './core/state-store.js';
import { ACCOUNT_TYPE } from './core/schema.js';
import { balancesOf, balanceOf } from './core/balance-calculator.js';
import { buildFlowRows, buildFooterInfo } from './ui/flow-model.js';
import { loadTemplates, renderRows } from './ui/render-transactions.js';
import { bindRowEditing } from './ui/row-editor.js';
import { showGate, hideGate } from './ui/gate.js';
import { hasVault, createVault, unlockVault, saveState } from './browser/db.js';
import { migrate } from './core/migrate.js';

let state = createState();
let _saveTimer = 0;

/** 首次使用时的默认账户（只是种子，不是业务规则） */
function seedState() {
  let s = createState();
  s = addAccount(s, { id: 'acc_cash', name: '现金', type: ACCOUNT_TYPE.ASSET, category: '现金' });
  s = addAccount(s, { id: 'acc_bank', name: '招行储', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'acc_food', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '餐饮' });
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

/** 防抖：加密 649KB 账本约 2ms，这里只为减少 IndexedDB 事务次数 */
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
  const sum = rows.reduce((map, r) => {
    map[r.acc.type] = (map[r.acc.type] || 0) + r.balance;
    return map;
  }, {});

  const asset = sum[ACCOUNT_TYPE.ASSET] || 0;
  const expense = sum[ACCOUNT_TYPE.EXPENSE] || 0;
  const liability = sum[ACCOUNT_TYPE.LIABILITY] || 0;
  const equity = sum[ACCOUNT_TYPE.EQUITY] || 0;
  const income = sum[ACCOUNT_TYPE.INCOME] || 0;

  // 资产 + 费用 − 负债 − 权益 − 收入
  const diff = Math.round((asset + expense - liability - equity - income) * 100) / 100;
  const broken = (state.transactions || []).filter((t) => !t.from_id || !t.to_id).length;

  setText('nt-check-balanced', broken === 0 ? '0 ✓' : `${broken} 笔断链 ✗`);
  setText('nt-check-identity', Math.abs(diff) < 0.005 ? '0 ✓' : `${diff}  ✗`);
  setText('nt-check-detail', `${state.transactions.length} 笔 · ${rows.length} 账户`);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showStatus(msg) {
  const el = document.getElementById('nt-status');
  if (el) el.textContent = msg;
}

/* ---------- 行内编辑（名字 → ID） ---------- */

/**
 * 输入的是「名字」，存的是「ID」。
 * 解析不到就存 null，由校验层报断链 —— 绝不把名字写进流水。
 */
function onRowEdit(id, field, value) {
  const patch = {};
  if (field === 'date') patch.date = normalizeDateInput(value);
  else if (field === 'amount') patch.amount = normalizeAmountInput(value);
  else if (field === 'from') patch.from_id = idOf(state, value);
  else if (field === 'to') patch.to_id = idOf(state, value);
  else patch[field] = value;

  state = updateTransaction(state, id, patch);

  // 只刷新页脚与校验，不重建行（否则光标会跳）
  renderFooterEl(buildFooterInfo(state));
  renderChecks();
  scheduleSave();
}

function onRowCreate(fields) {
  const fromId = idOf(state, fields.from || '');
  const toId = idOf(state, fields.to || '');
  if (!fromId && !toId) {
    showStatus('转出 / 转入 至少要填一个已有的账户');
    return;
  }
  state = addTransaction(state, {
    date: normalizeDateInput(fields.date || todayIso()),
    from_id: fromId,
    to_id: toId,
    amount: normalizeAmountInput(fields.amount || ''),
    note: fields.note || '',
    seq: nextSeq(state),
  });
  render();
  scheduleSave();
}

function onRowDelete(id) {
  state = removeTransaction(state, id);
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

/** "260830" / "26-08-30" / "2026-08-30" → ISO */
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

/** 剥掉 ¥ 与千分位 */
function normalizeAmountInput(v) {
  return String(v || '').replace(/[¥,\s]/g, '');
}

/* ---------- 启动 ---------- */

function enterApp() {
  hideGate();
  render();
  document.getElementById('nt-app').hidden = false;
}

/** 把盘上读出的数据过一遍迁移（老存档也能进） */
function adoptState(raw) {
  if (!raw || !Array.isArray(raw.transactions)) return seedState();
  const r = migrate(raw);
  return r.state;
}

async function boot() {
  await loadTemplates();

  bindRowEditing(document.getElementById('nt-flow-body'), {
    onEdit: onRowEdit,
    onCreate: onRowCreate,
    onDelete: onRowDelete,
    onCommit: () => { flushSave(); },
  });

  window.addEventListener('beforeunload', () => {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = 0; }
  });

  const exists = await hasVault();

  showGate(exists, {
    onUnlock: async (pw) => {
      const res = await unlockVault(pw);
      if (res.ok) {
        state = adoptState(res.state);
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

// 供调试/后续模块引用（不挂 window，走模块导出）
export { state, balanceOf, nameOf };

boot();
