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

import { createState, addTransaction, removeTransaction } from './core/state.js';
import { buildFlowRows, buildFooterInfo, buildAccountOptions } from './ui/flow-model.js';
import { loadTemplates, renderRows } from './ui/render-transactions.js';
import { showGate, hideGate } from './ui/gate.js';
import { checkBalanced, checkAccountingIdentity } from './core/validate.js';
import { statsForAccounts } from './core/stats.js';
import { hasVault, createVault, unlockVault, saveState } from './browser/storage-adapter.js';

let state = createState();

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
  try {
    await saveState(state);
    showStatus('');
  } catch (e) {
    showStatus('保存失败：' + e.message);
  }
}

function render() {
  renderRows(document.getElementById('nt-flow-body'), buildFlowRows(state));
  renderFooterEl(buildFooterInfo(state));
  renderOptions();
  renderChecks();
}

function renderFooterEl(info) {
  const el = document.getElementById('nt-footer');
  if (el) el.textContent = `共 ${info.count} 笔 · 合计 ${info.totalText}`;
}

function renderOptions() {
  const opts = buildAccountOptions(state);
  for (const id of ['nt-from', 'nt-to']) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    const current = sel.value;
    sel.textContent = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '请选择';
    sel.appendChild(blank);
    for (const o of opts) {
      const el = document.createElement('option');
      el.value = o.value;
      el.textContent = o.label;
      sel.appendChild(el);
    }
    if (current) sel.value = current;
  }
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

function onSubmit(ev) {
  ev.preventDefault();
  const date = document.getElementById('nt-date').value;
  const from = document.getElementById('nt-from').value;
  const to = document.getElementById('nt-to').value;
  const amount = document.getElementById('nt-amount').value;
  const note = document.getElementById('nt-note').value;

  if (!date || !from || !to) { showStatus('日期 / 转出 / 转入 都要填'); return; }
  if (from === to) { showStatus('转出与转入不能是同一个账户'); return; }

  commit(addTransaction(state, { date, from, to, amount, note }));
  showStatus('');
  ev.target.reset();
}

/** 列表删除：事件委托（公约 1.1） */
function onListClick(ev) {
  const btn = ev.target.closest('.nt-cell-action button');
  if (!btn) return;
  const tr = btn.closest('tr');
  if (!tr || !tr.dataset.id) return;
  commit(removeTransaction(state, tr.dataset.id));
}

/** 解锁成功 → 显示主界面 */
function enterApp() {
  hideGate();
  render();
  document.getElementById('nt-app').hidden = false;
}

async function boot() {
  await loadTemplates();

  document.getElementById('nt-form').addEventListener('submit', onSubmit);
  document.getElementById('nt-flow-body').addEventListener('click', onListClick);

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
