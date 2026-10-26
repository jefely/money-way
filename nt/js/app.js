/**
 * 入口：装配（state → 视图 → 事件）。
 *
 * 这一层可以碰 DOM 与 store；业务计算一律调 core/，渲染一律调 ui/。
 */

import { createState, addTransaction, removeTransaction } from './core/state.js';
import { buildFlowRows, buildFooterInfo, buildAccountOptions } from './ui/flow-model.js';
import { renderFlowList, renderFooter, CLASS } from './ui/flow-view.js';
import { checkBalanced, checkAccountingIdentity } from './core/validate.js';
import { statsForAccounts } from './core/stats.js';
import { loadState, saveState } from './browser/store.js';

const state = loadState() || seedState();

function seedState() {
  let s = createState();
  s = {
    ...s,
    accounts: [
      { id: 'acc-cash', cat: '资产类', sub: '现金', code: 'XJ', name: '现金', opening: '0', billDay: '', repayDay: '' },
      { id: 'acc-bank', cat: '资产类', sub: '储蓄', code: 'HC', name: '招行储', opening: '0', billDay: '', repayDay: '' },
      { id: 'acc-food', cat: '费用类', sub: '餐饮', code: 'CY', name: '餐饮', opening: '0', billDay: '', repayDay: '' },
    ],
  };
  return s;
}

/** 持久化 + 重渲染（唯一写盘入口）。 */
function commit(nextState) {
  Object.assign(state, nextState);
  if (!saveState(state)) showStatus('保存失败：本地存储不可写');
  render();
}

function render() {
  renderFlowList(document.getElementById('nt-flow-body'), buildFlowRows(state));
  renderFooter(document.getElementById('nt-footer'), buildFooterInfo(state));
  renderOptions();
  renderChecks();
}

function renderOptions() {
  const opts = buildAccountOptions(state);
  for (const id of ['nt-from', 'nt-to']) {
    const sel = document.getElementById(id);
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

/** 两条校验 + 余额（全部来自 core） */
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

/** 表单提交：只做取值 → 调 core → commit，不做任何计算。 */
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

/** 列表删除：事件委托在 tbody 上（公约 1.1：不用内联 onclick）。 */
function onListClick(ev) {
  const btn = ev.target.closest('.' + CLASS.action);
  if (!btn) return;
  const tr = btn.closest('tr');
  if (!tr || !tr.dataset.id) return;
  commit(removeTransaction(state, tr.dataset.id));
}

function init() {
  document.getElementById('nt-form').addEventListener('submit', onSubmit);
  document.getElementById('nt-flow-body').addEventListener('click', onListClick);
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
