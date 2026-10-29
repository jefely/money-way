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
import { hasVault, createVault, unlockVault, saveState, destroyVault, changeVaultPassword } from './browser/db.js';
import * as NtModal from './ui/modal.js';
import { migrate } from './core/migrate.js';
import { syncOpeningDates } from './core/ledger-stats.js';
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
import { bindAllTables, syncAllFrozen } from './ui/table-layout.js';
import { clearSelection } from './ui/cell-range.js';
import { loadMergedSettings, loadUserSettings, saveThemeSettings } from './ui/debug-themes.js';
import { TABLE_COLS } from './core/table-cols.js';
import { saveTableColWidth } from './ui/col-save.js';
import { saveColMirror } from './ui/table-layout.js';
import { APP_VER } from './core/version.js';
import { initVersion } from './ui/update-check.js';
import { registerServiceWorker } from './ui/pwa.js';
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
  // 版本号只在这里拼一次，避免被其它地方覆盖掉
  document.title = 'NT 账本' + (name ? ' - ' + name : '') + ' ' + APP_VER;
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
  syncAllFrozen();
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
    // 换主密码：逻辑在 browser/db.js → core/vault-rekey.js，
    // 这里只把「当前内存 state」递过去（换完密码不会丢掉未保存的编辑）。
    changePassword: (oldPw, newPw) => changeVaultPassword(oldPw, newPw, getState()),
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
  return syncOpeningDates(migrate(raw).state);
}

/** 表元素 → TABLE_COLS 的 key（统计表按当前视图判：分类 / 汇总各一套列宽） */
function tableKeyOf(tableEl) {
  const cls = tableEl.classList;
  if (cls.contains('nt-table-flow')) return 'flow';
  if (cls.contains('nt-table-stats')) return cls.contains('is-sum') ? 'sum' : 'cat';
  if (cls.contains('nt-table-query')) return 'query';
  if (cls.contains('nt-table-plan')) return 'plan';
  if (cls.contains('nt-table-accounts')) return 'accounts';
  return '';
}

/**
 * 拖动手柄改列宽后，写入当前主题的「用户列宽」（不覆盖默认列宽）。
 *
 * 每张表一份：在流水表把金额拖宽，不会连带改掉查询表 / 固定表的金额列。
 */
function onColResize(tableEl, col, width) {
  saveTableColWidth({ getState, setState, saveNow: flushSave }, tableKeyOf(tableEl), col, width);
  // 同时写一份 localStorage 镜像：列宽参数要解锁才拿得到，
  // 而表头重绘（切 tab / 折叠）发生在渲染期，先用镜像顶上。
  try {
    const ths = [...tableEl.querySelectorAll('thead .nt-th')];
    saveColMirror(tableEl, ths.map((th) => Math.round(th.getBoundingClientRect().width)));
  } catch (e) { /* 忽略 */ }
}

function enterApp() {
  hideGate();
  document.getElementById('nt-app').hidden = false;
  updateDocTitle();

  // 启动成功 → 把白屏兜底收起来。
  // index.html 的兜底是「3.5 秒没出锁屏/主界面就显示」，但首次加载 + SW 预缓存
  // 可能要超过 3.5 秒 —— 慢不是失败。之前没有任何代码调用 __ntBootOk，
  // 于是慢加载时兜底一旦显示就永远挂着，看起来像「页面没能启动」。
  try {
    if (typeof window !== 'undefined' && typeof window.__ntBootOk === 'function') {
      window.__ntBootOk();
    }
  } catch (e) { /* 忽略 */ }

  // 应用界面参数：即使 settings 为空也要跑一次，用 SCHEMA 默认值补齐
  // （否则新账本没有 --nt-col-*，列宽会被表格拉伸，拖动也看不出效果）
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  // 两层分开存：defaults 是基准，user 是实际值（user 覆盖 defaults）
  const merged = loadMergedSettings({ getState }, theme);
  applySettings(merged, theme);

  // 列宽拖动手柄：**所有**数据区都挂，拖动后同步到当前主题的「默认列宽」并保存
  bindAllTables({ onResize: onColResize });

  mountViews();
  bindTabs({
    defaultTab: 'flow',
    onShow: (name) => {
      // 切页时把框选状态收掉：body 上的 nt-range-mode 会让整页 touch-action:none，
      // 留在别的页就会出现「上下滑不动」而且没有任何报错。
      clearSelection();
      // 拖列宽被打断时同理（这个类会禁掉表格容器的横滑）
      document.body.classList.remove('nt-col-resizing');
      active = name;
      renderActive();
      // 切回流水页：最后一条有内容的行落在视口第 6 行（用户 2026-10-30）
      if (name === 'flow' && views.flow && views.flow.focusEnd) views.flow.focusEnd();
    },
  });

  // 从别的窗口 / 标签页切回来时，流水页也重新定位到最后 6 行（用户 2026-10-30）：
  // 移动端后台恢复会把页面重置，光靠 tab 切换的 onShow 不够。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (active !== 'flow') return;
    if (views.flow && views.flow.focusEnd) views.flow.focusEnd();
  });

  // 界面参数调试面板：只在 ?debug=1 时出现，不影响正常用户
  if (new URLSearchParams(location.search).has('debug')) {
    mountDebugPanel({ getState, setState, save: flushSave });
  }
}

async function boot() {
  initTheme();
  await loadTemplates();
  initVersion(setFooter);

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

registerServiceWorker();
