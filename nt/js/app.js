// 界面：单页壳入口：门禁 → state → 7 视图装配 → tab 路由
/**
 * 入口：装配（门禁 → state → 索引 → 7 个视图 → 事件）。
 *
 * 数据流（ID 模型 + 简码 + 零知识）：
 *   启动 → 有没有保险库？ → 没有：设置密码 → 有：输密码 → 解开
 *   行内编辑 → 输入简码/名字 → 解析成 ID → 改 state → 防抖加密写盘
 *   7-tab 切换不刷新页面，一次解锁全站可用。
 */

import { initTheme } from './ui/theme-manager.js';
import { loadTemplates } from './ui/render-transactions.js';
import { bindTabs } from './ui/tabs.js';
import { showGate, hideGate } from './ui/gate.js';
import { openAccountsWith } from './ui/account-actions.js';
import { hasVault, createVault, unlockVault, saveState, destroyVault } from './browser/db.js';
import * as NtModal from './ui/modal.js';
import { migrate } from './core/migrate.js';
import { createState, addAccount } from './core/state-store.js';
import { buildAccountIndex } from './core/account-index.js';
import { ACCOUNT_TYPE } from './core/schema.js';
import { mountFlow } from './views/flow.js';
import { mountStats } from './views/stats.js';
import { mountQuery } from './views/query.js';
import { mountPlan } from './views/plan.js';
import { mountSettings } from './views/settings.js';
import { mountValidate } from './views/validate.js';
import { mountPath } from './views/path.js';
import { mountDebugPanel } from './ui/debug-panel.js';
import { applySettings } from './ui/apply-settings.js';
import { mountColResize } from './ui/col-resize.js';
import { COL_KEYS } from './core/settings.js';
import { mergeFlowText, mergeRows as mergeRowsPure } from './core/sync-merge.js';
import { unpackFromHash } from './core/sync-code.js';

let state = createState();
/** 扫二维码带进来的待合并数据（解锁或新建后消费掉） */
let pendingPayload = null;
let index = buildAccountIndex(state.accounts);
let views = {};
let active = 'flow';
let saveTimer = 0;

/* ---------- state 与索引 ---------- */

function setState(next) {
  state = next;
  index = buildAccountIndex(state.accounts);
  updateDocTitle();
}

/** 窗口/标签标题显示当前账本：NT 账本 - 主账本 */
function updateDocTitle() {
  const name = (state.ledgerNames || {})[state.activeLedger] || '';
  document.title = 'NT 账本' + (name ? ' - ' + name : '');
}

function getState() { return state; }
function getIndex() { return index; }

function setFooter(text) {
  const el = document.getElementById('nt-footer');
  if (el) el.textContent = text || '';
}

function renderActive() {
  const v = views[active];
  if (v && typeof v.render === 'function') v.render();
}

/* ---------- 存盘（防抖 + 立即两种） ---------- */

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    await saveState(state);
  } catch (e) {
    setFooter('保存失败：' + e.message);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = 0; flushSave(); }, 300);
}

/* ---------- 账户弹窗（流水页与设置页共用同一个） ---------- */

/**
 * 合并「账本文本」（同步码解出来的）。返回新增笔数。
 */
function mergeText(text) {
  const r = mergeFlowText(state, text);
  setState(r.state);
  return r.added;
}

/**
 * 合并「解包出来的流水行」（二维码 #m= 里的紧凑载荷）。返回新增笔数。
 */
function mergeRows(rows) {
  const r = mergeRowsPure(state, rows);
  setState(r.state);
  return r.added;
}

/**
 * 把扫二维码带进来的数据并进账本（解锁/新建都走这里）。
 * 只在启动时有一天用量：pendingPayload 消费掉就置空。
 */
async function applyPendingScan() {
  if (!pendingPayload) return;
  const r = mergeRowsPure(state, pendingPayload.rows);
  state = r.state;
  pendingPayload = null;
  try { await flushSave(); } catch (e) {}
  setFooter(r.added ? `扫码合并 ${r.added} 笔` : '扫码数据里没有新记录');
}

function openAccounts() {
  openAccountsWith({
    getState,
    setState,
    render: renderActive,
    save: flushSave,
    reopen: () => {
      const b = document.querySelector('.nt-view[data-view="flow"] [data-act="accounts"]');
      if (b) b.click();
    },
  });
}

/* ---------- 视图装配 ---------- */

function pick(name) {
  return document.querySelector('.nt-view[data-view="' + name + '"]');
}

function mountViews() {
  const ctx = {
    getState,
    getIndex,
    setState,
    save: scheduleSave,
    saveNow: flushSave,
    setFooter,
    rerender: renderActive,
    openAccounts,
    mergeText,
    mergeRows,
    resetAll: async () => {
      await destroyVault();
      NtModal.closeAll();
      location.reload();
    },
  };

  views = {
    flow: mountFlow(pick('flow'), ctx),
    stats: mountStats(pick('stats'), ctx),
    query: mountQuery(pick('query'), ctx),
    plan: mountPlan(pick('plan'), ctx),
    settings: mountSettings(pick('settings'), ctx),
    validate: mountValidate(pick('validate'), ctx),
    path: mountPath(pick('path'), ctx),
  };
}

/* ---------- 启动 ---------- */

function seedState() {
  let s = createState();
  s = addAccount(s, { id: 'acc_cash', code: 'XJ', name: '现金', type: ACCOUNT_TYPE.ASSET, category: '现金' });
  s = addAccount(s, { id: 'acc_bank', code: 'ZHC', name: '招行储', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'acc_food', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '日常' });
  return s;
}

function adoptState(raw) {
  if (!raw || !Array.isArray(raw.transactions)) return seedState();
  return migrate(raw).state;
}

/** 拖动手柄改列宽后，写入当前主题的「用户列宽」（不覆盖默认列宽） */
function onColResize(col, width) {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const st = getState();
  const all = { ...(st.settings && typeof st.settings === 'object' ? st.settings : {}) };
  const cur = all[theme] && typeof all[theme] === 'object' ? all[theme] : {};
  const widths = String(cur['用户列宽'] || cur['默认列宽'] || '').split(',').map((x) => Number(x.trim()));
  const idx = COL_KEYS.indexOf(col);
  if (idx < 0) return;
  while (widths.length < COL_KEYS.length) widths.push(64);
  widths[idx] = width;
  all[theme] = { ...cur, '用户列宽': widths.join(',') };
  setState({ ...st, settings: all });
  flushSave();
}

function enterApp() {
  hideGate();
  document.getElementById('nt-app').hidden = false;
  updateDocTitle();

  // 应用界面参数：即使 settings 为空也要跑一次，用 SCHEMA 默认值补齐
  // （否则新账本没有 --nt-col-*，列宽会被表格拉伸，拖动也看不出效果）
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const s = state.settings || {};
  const themeSettings = (s[theme] && typeof s[theme] === 'object') ? s[theme] : s;
  const merged = { ...themeSettings };
  if (themeSettings['用户列宽']) merged['默认列宽'] = themeSettings['用户列宽'];
  applySettings(merged, theme);

  // 列宽拖动手柄：拖动后同步到当前主题的「默认列宽」并保存
  const tableEl = document.querySelector('.nt-table');
  if (tableEl) mountColResize(tableEl, { onResize: onColResize });

  mountViews();
  bindTabs({
    defaultTab: 'flow',
    onShow: (name) => { active = name; renderActive(); },
  });

  // 界面参数调试面板：只在 ?debug=1 时出现，不影响正常用户
  if (new URLSearchParams(location.search).has('debug')) {
    mountDebugPanel({ getState, setState, save: flushSave });
  }
}

async function boot() {
  initTheme();
  await loadTemplates();

  window.addEventListener('beforeunload', () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
  });

  // 扫二维码打开时 URL 带 #m=…：先解出来，解锁后自动合并
  const hash = (typeof location !== 'undefined' ? location.hash : '');
  if (/[#&]m=/.test(hash)) {
    try {
      pendingPayload = await unpackFromHash(hash);
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    } catch (e) {
      setFooter('二维码数据解不开：' + e.message);
    }
  }

  const exists = await hasVault();
  showGate(exists, {
    onUnlock: async (pw) => {
      const res = await unlockVault(pw);
      if (res.ok) {
        setState(adoptState(res.state));
        await applyPendingScan();
        enterApp();
      }
      return res;
    },
    onSetup: async (pw) => {
      setState(seedState());
      await applyPendingScan();
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

/* PWA：注册 Service Worker（file:// 下会失败，静默忽略）
 * CACHE_NAME 与 sw.js 里的版本号一起改（公约 4.4）。
 * ?debug=1 时反而要清除旧 SW，避免本地调试被旧缓存挡住。 */
const isDebugMode = new URLSearchParams(location.search).has('debug');
if ('serviceWorker' in navigator) {
  if (isDebugMode) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => {
        if (!regs.length) return;
        regs.forEach((r) => r.unregister());
        // 只自动重载一次，避免循环
        if (navigator.serviceWorker.controller && !sessionStorage.getItem('nt_sw_cleared')) {
          sessionStorage.setItem('nt_sw_cleared', '1');
          location.reload();
        }
      })
      .catch(() => {});
  } else {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
