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
 * 按主题保存。`slot` 决定写哪一层：
 *   'defaults' —— 默认设置（基准值，一般调好就不动了）
 *   'user'     —— 用户设置（拖动列宽之类的实际值）
 *
 * 两层分开存的意义：改了默认不会冲掉用户微调；重置用户设置又能回到默认。
 */
export function saveThemeSettings(opts, theme, settings, slot) {
  if (!opts || !opts.setState || !opts.getState) return;
  const st = opts.getState();
  const all = { ...(st.settings && typeof st.settings === 'object' ? st.settings : {}) };
  const cur = normalizeThemeSettings(all[theme]);
  all[theme] = { ...cur, [slot === 'user' ? 'user' : 'defaults']: settings };
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

/** defaults + user 合并后的最终参数（user 优先） */
export function loadMergedSettings(opts, theme) {
  return { ...loadThemeSettings(opts, theme), ...loadUserSettings(opts, theme) };
}
