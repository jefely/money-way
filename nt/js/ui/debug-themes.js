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

/** 按主题保存：state.settings[theme] = settings */
export function saveThemeSettings(opts, theme, settings) {
  if (!opts || !opts.setState || !opts.getState) return;
  const st = opts.getState();
  const all = { ...(st.settings && typeof st.settings === 'object' ? st.settings : {}) };
  all[theme] = settings;
  opts.setState({ ...st, settings: all });
}

/** 按主题读取：state.settings[theme]（兼容旧的平铺结构） */
export function loadThemeSettings(opts, theme) {
  if (!opts || !opts.getState) return {};
  const st = opts.getState();
  const all = st.settings && typeof st.settings === 'object' ? st.settings : {};
  return all[theme] || {};
}
