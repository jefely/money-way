// 界面：?debug=1 → 界面参数 1/2/3/4 主题按钮
/**
 * 调试面板的主题切换（1=浅色 2=深色 3=备选1 4=备选2）
 * 层：第五层 · UI
 *
 * 与软件主题切换共用 theme-manager：同一份 data-theme / nt_theme，天然联动。
 */

import { applyTheme as applyThemeManager, saveTheme, currentTheme as currentThemeManager } from './theme-manager.js';

export const THEMES = [
  { id: 'light', label: '1' },
  { id: 'dark', label: '2' },
  { id: 'alt1', label: '3' },
  { id: 'alt2', label: '4' },
];

export function currentTheme() {
  return currentThemeManager();
}

export function applyTheme(id) {
  applyThemeManager(id);
  saveTheme(id);
}

/** 创建 1/2/3/4 主题按钮；onPick(id, button, wrapper) */
export function createThemeButtons(active, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'nt-debug-themes';
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-debug-theme';
    b.textContent = t.label;
    b.setAttribute('aria-pressed', t.id === active ? 'true' : 'false');
    b.addEventListener('click', () => onPick(t.id, b, wrap));
    wrap.appendChild(b);
  }
  return wrap;
}

/**
 * 跨主题统一的参数（2026-11 用户要求）：
 * 环图外圈的两条比例在 4 个主题下必须同一个值，不能各主题各存一份。
 * 它们不读主题自己的 defaults/user，而是读 `settings._global`（整份设置的最后一个值），
 * 没有就落回默认 0.1 / 0.05。
 */
const GLOBAL_KEYS = ['外圈线厚比例', '外圈线间距比例'];

function globalLayer(opts) {
  if (!opts || !opts.getState) return {};
  const st = opts.getState();
  const all = st.settings && typeof st.settings === 'object' ? st.settings : {};
  const g = all._global;
  return g && typeof g === 'object' ? g : {};
}

/**
 * 按主题保存。`slot` 决定写哪一层：
 *   'defaults' —— 默认设置（基准值，一般调好就不动了）
 *   'user'     —— 用户设置（拖动列宽之类的实际值）
 *
 * 两层分开存的意义：改了默认不会冲掉用户微调；重置用户设置又能回到默认。
 *
 * 同时把 GLOBAL_KEYS 里的参数写进 `_global`（不分主题，见上面的说明）。
 */
export function saveThemeSettings(opts, theme, settings, slot) {
  if (!opts || !opts.setState || !opts.getState) return;
  const st = opts.getState();
  const all = { ...(st.settings && typeof st.settings === 'object' ? st.settings : {}) };
  const cur = normalizeThemeSettings(all[theme]);
  all[theme] = { ...cur, [slot === 'user' ? 'user' : 'defaults']: settings };

  const g = { ...(all._global && typeof all._global === 'object' ? all._global : {}) };
  let changed = false;
  for (const k of GLOBAL_KEYS) {
    if (settings && Object.prototype.hasOwnProperty.call(settings, k)) {
      g[k] = settings[k];
      changed = true;
    }
  }
  if (changed) all._global = g;

  opts.setState({ ...st, settings: all });
}

/** 清掉跨主题统一的那几个键（「恢复默认」用：否则下次加载又被旧全局值盖回来） */
export function clearGlobalKeys(opts) {
  if (!opts || !opts.setState || !opts.getState) return;
  const st = opts.getState();
  const all = { ...(st.settings && typeof st.settings === 'object' ? st.settings : {}) };
  if (!all._global || typeof all._global !== 'object') return;
  const g = { ...all._global };
  for (const k of GLOBAL_KEYS) delete g[k];
  all._global = g;
  opts.setState({ ...st, settings: all });
}

/** 把旧版平铺结构迁成 { defaults, user } */
function normalizeThemeSettings(t) {
  const src = t && typeof t === 'object' ? t : {};
  if (src.defaults || src.user) {
    return { defaults: src.defaults || {}, user: src.user || {} };
  }
  // 旧结构：所有键平铺，还混着「用户列宽」
  const defaults = { ...src };
  const user = {};
  if (defaults['用户列宽']) {
    user['默认列宽'] = defaults['用户列宽'];
    delete defaults['用户列宽'];
  }
  if (defaults['用户列宽']) delete defaults['用户列宽'];
  return { defaults, user };
}

/** 读「默认设置」（面板编辑的就是这一层） */
export function loadThemeSettings(opts, theme) {
  if (!opts || !opts.getState) return {};
  const st = opts.getState();
  const all = st.settings && typeof st.settings === 'object' ? st.settings : {};
  return normalizeThemeSettings(all[theme]).defaults;
}

/** 读「用户设置」 */
export function loadUserSettings(opts, theme) {
  if (!opts || !opts.getState) return {};
  const st = opts.getState();
  const all = st.settings && typeof st.settings === 'object' ? st.settings : {};
  return normalizeThemeSettings(all[theme]).user;
}

/** defaults + user 合并后的最终参数（user 优先）；GLOBAL_KEYS 用 `_global` 覆盖 */
export function loadMergedSettings(opts, theme) {
  const merged = { ...loadThemeSettings(opts, theme), ...loadUserSettings(opts, theme) };
  const g = globalLayer(opts);
  for (const k of GLOBAL_KEYS) {
    if (g[k] !== undefined) merged[k] = g[k];
    // 主题里存的旧值不生效：删掉后 normalize 会落回默认值（0.1 / 0.05）
    else delete merged[k];
  }
  return merged;
}
