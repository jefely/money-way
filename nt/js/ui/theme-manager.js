/**
 * 主题管理
 * 层：第五层 · UI（只碰 DOM 与本地存储）
 *
 * 唯一职责：把 data-theme 写到 <html> 上并记住选择。
 * 不定义任何颜色 —— 颜色全在 css/theme.css 的变量里。
 */

const KEY = 'nt_theme';

export const THEME = { LIGHT: 'light', DARK: 'dark', ALT1: 'alt1', ALT2: 'alt2' };
const VALID = [THEME.LIGHT, THEME.DARK, THEME.ALT1, THEME.ALT2];

/** 读已保存的选择；没有就跟随系统 */
export function readTheme() {
  try {
    const v = localStorage.getItem(KEY);
    if (VALID.includes(v)) return { theme: v, source: 'saved' };
  } catch (e) { /* 隐私模式读不到，继续走系统判断 */ }

  const prefersDark = typeof matchMedia === 'function'
    && matchMedia('(prefers-color-scheme: dark)').matches;
  return { theme: prefersDark ? THEME.DARK : THEME.LIGHT, source: 'system' };
}

/** 应用主题（只改一个属性） */
export function applyTheme(theme) {
  const t = VALID.includes(theme) ? theme : THEME.LIGHT;
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  // 页头两主题统一深色，状态栏跟着走
  if (meta) meta.setAttribute('content', '#14101f');
  return t;
}

/** 记住选择（用户显式切换时才调用） */
export function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, VALID.includes(theme) ? theme : THEME.LIGHT);
    return true;
  } catch (e) {
    return false;
  }
}

/** 当前生效的主题 */
export function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  return VALID.includes(t) ? t : THEME.LIGHT;
}

/** 切换（返回切换后的主题） */
export function toggleTheme() {
  const cur = currentTheme();
  const next = cur === THEME.LIGHT || cur === THEME.ALT1 ? THEME.DARK : THEME.LIGHT;
  applyTheme(next);
  saveTheme(next);
  return next;
}

/**
 * 启动时调用：先应用，再监听系统变化（仅当用户没手动选过时才跟随）。
 */
export function initTheme() {
  const { theme, source } = readTheme();
  applyTheme(theme);

  if (source === 'system' && typeof matchMedia === 'function') {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (ev) => {
      // 用户手动选过就不再跟随系统
      try {
        if (localStorage.getItem(KEY)) return;
      } catch (e) { /* ignore */ }
      applyTheme(ev.matches ? THEME.DARK : THEME.LIGHT);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  return theme;
}
