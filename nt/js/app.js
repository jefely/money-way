/**
 * 入口：装配（门禁 → state → 索引 → 7 个视图 → 事件）。
 *
 * 数据流（ID 模型 + 简码 + 零知识）：
 *   启动 → 有没有保险库？ → 没有：设置密码 → 有：输密码 → 解开
 *   行内编辑 → 输入简码/名字 → 解析成 ID → 改 state → 防抖加密写盘
 *   7-tab 切换不刷新页面，一次解锁全站可用。
 */

import { initTheme } from './ui/theme-manager.js';
import { bindHeaderTools } from './ui/header-tools.js';
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

let state = createState();
let index = buildAccountIndex(state.accounts);
let views = {};
let active = 'flow';
let saveTimer = 0;

/* ---------- state 与索引 ---------- */

function setState(next) {
  state = next;
  index = buildAccountIndex(state.accounts);
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

function enterApp() {
  hideGate();
  document.getElementById('nt-app').hidden = false;
  mountViews();
  bindTabs({
    defaultTab: 'flow',
    onShow: (name) => { active = name; renderActive(); },
  });
}

async function boot() {
  initTheme();
  await loadTemplates();

  bindHeaderTools({
    getSummary: () => [
      ['版本', 'nt-v0.03'],
      ['账户', String(index.size)],
      ['流水', String(state.transactions.length) + ' 笔'],
      ['加密', 'PBKDF2 150k → AES-GCM 256'],
      ['存储', 'IndexedDB（仅密文）'],
    ],
  });

  window.addEventListener('beforeunload', () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
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

boot();

/* PWA：注册 Service Worker（file:// 下会失败，静默忽略）
 * CACHE_NAME 与 sw.js 里的版本号一起改（公约 4.4）。 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
