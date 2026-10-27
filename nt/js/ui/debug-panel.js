// 界面：?debug=1 → 界面参数浮层
/** 界面参数调试面板（UI 层）：按标签页分组，改值实时生效，可保存/撤销/恢复默认。 */
import { GROUPS, SCREENS, GROUP_SCREEN, SCHEMA, DEFAULTS, normalize } from '../core/settings.js';
import { applySettings } from './apply-settings.js';
import { openColorPicker } from './color-picker.js';
import { createThemeButtons, currentTheme, applyTheme, saveThemeSettings, loadThemeSettings } from './debug-themes.js';
import { createPiPButton } from './debug-pip.js';
import { layoutTextBar, mergePatch } from './layout-text.js';

const POS_KEY = 'nt_debug_pos';

export function mountDebugPanel(opts) {
  const o = opts || {};
  let theme = currentTheme();
  const initialState = o.initial || (o.getState ? loadThemeSettings(o, theme) : {});
  let current = normalize(initialState, theme);
  let screen = SCREENS[0].id;
  let history = [];

  /** 记录改动前的状态（撤销用，最多 50 步） */
  function pushHistory() {
    const last = history[history.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(current)) return;
    history.push({ ...current });
    if (history.length > 50) history.shift();
  }

  const host = document.createElement('aside');
  host.className = 'nt-debug';

  /* ---------- 第一行：拖动条（空行，只负责拖动） ---------- */

  const dragBar = document.createElement('div');
  dragBar.className = 'nt-debug-drag';

  // 左：主题切换 1=浅色 2=深色 3=备选1 4=备选2
  dragBar.appendChild(createThemeButtons(theme, (id, btn, wrap) => {
    if (id === theme) return;
    saveThemeSettings(o, theme, normalize(current, theme));
    theme = id;
    applyTheme(theme);
    for (const el of wrap.children) {
      el.setAttribute('aria-pressed', el === btn ? 'true' : 'false');
    }
    current = normalize(loadThemeSettings(o, theme), theme);
    renderBody();
    applySettings(current, theme);
  }));

  dragBar.appendChild(createPiPButton(host));

  const dragTitle = document.createElement('span');
  dragTitle.className = 'nt-debug-drag-title';
  dragTitle.textContent = '界面参数';
  dragBar.appendChild(dragTitle);

  // 关闭按钮：放拖动条右侧（与「调试面板」同一行）
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nt-debug-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', '关闭调试面板');
  dragBar.appendChild(closeBtn);

  /* ---------- 第二行：界面标签栏 ---------- */

  const tabs = document.createElement('div');
  tabs.className = 'nt-debug-tabs';

  const tabBtns = {};
  for (const s of SCREENS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-debug-tab';
    b.textContent = s.label;
    b.setAttribute('aria-selected', s.id === screen ? 'true' : 'false');
    b.addEventListener('click', () => {
      screen = s.id;
      for (const k of Object.keys(tabBtns)) {
        tabBtns[k].setAttribute('aria-selected', k === screen ? 'true' : 'false');
      }
      renderBody();
    });
    tabBtns[s.id] = b;
    tabs.appendChild(b);
  }

  // 取色按钮：和「主界面」标签并列
  const colorBtn = document.createElement('button');
  colorBtn.type = 'button';
  colorBtn.className = 'nt-debug-color';
  colorBtn.textContent = '取色';
  colorBtn.addEventListener('click', () => openColorPicker({ initial: '#ffffff', library: currentColors() }));
  tabs.appendChild(colorBtn);

  /* ---------- 参数区 ---------- */

  const body = document.createElement('div');
  body.className = 'nt-debug-body';

  /* ---------- 底部操作 ---------- */

  const foot = document.createElement('div');
  foot.className = 'nt-debug-foot';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'nt-debug-btn';
  resetBtn.textContent = '恢复默认';
  const readColBtn = document.createElement('button');
  readColBtn.type = 'button';
  readColBtn.className = 'nt-debug-btn';
  readColBtn.textContent = '读取列宽';
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'nt-debug-btn';
  undoBtn.textContent = '撤销';
  // 两套保存：默认设置是基准值，用户设置是拖动/微调出来的实际值
  const saveDefBtn = document.createElement('button');
  saveDefBtn.type = 'button';
  saveDefBtn.className = 'nt-debug-btn';
  saveDefBtn.textContent = '存默认';
  saveDefBtn.title = '存为默认设置（基准值）';

  const saveUsrBtn = document.createElement('button');
  saveUsrBtn.type = 'button';
  saveUsrBtn.className = 'nt-debug-btn';
  saveUsrBtn.textContent = '存用户';
  saveUsrBtn.title = '存为用户设置（覆盖默认，优先级更高）';

  foot.appendChild(resetBtn);
  foot.appendChild(readColBtn);
  foot.appendChild(undoBtn);
  foot.appendChild(saveDefBtn);
  foot.appendChild(saveUsrBtn);

  // 布局文本导出/导入（单独一行，避免把底部按钮挤成一坨）
  const textBar = layoutTextBar({
    ctx: o,
    getCurrent: () => current,
    getTheme: () => theme,
    apply: (patch) => {
      pushHistory();
      current = mergePatch(current, patch, theme);
      renderBody();
      applySettings(current, theme);
      if (o.save) o.save();
    },
  });

  host.appendChild(dragBar);
  host.appendChild(tabs);
  host.appendChild(body);
  host.appendChild(textBar);
  host.appendChild(foot);
  document.body.appendChild(host);

  applySettings(current, theme);
  enableDrag(host, dragBar);

  closeBtn.addEventListener('click', () => host.remove());
  function persist(btn, slot, label) {
    saveThemeSettings(o, theme, normalize(current, theme), slot);
    if (o.save) o.save();
    btn.textContent = '已保存';
    setTimeout(() => { btn.textContent = label; }, 1200);
  }

  saveDefBtn.addEventListener('click', () => persist(saveDefBtn, 'defaults', '存默认'));
  saveUsrBtn.addEventListener('click', () => persist(saveUsrBtn, 'user', '存用户'));
  resetBtn.addEventListener('click', () => {
    pushHistory();
    current = normalize(o.getState ? loadThemeSettings(o, theme) : {}, theme);
    renderBody();
    applySettings(current, theme);
  });
  readColBtn.addEventListener('click', () => {
    if (!o.getState) return;
    const st = o.getState();
    const settings = st.settings && typeof st.settings === 'object' ? st.settings : {};
    const cur = settings[theme] && typeof settings[theme] === 'object' ? settings[theme] : {};
    const userW = cur['用户列宽'];
    if (!userW) return;
    pushHistory();
    current['默认列宽'] = userW;
    renderBody();
    applySettings(normalize(current, theme), theme);
  });
  undoBtn.addEventListener('click', () => {
    if (!history.length) return;
    current = history.pop();
    renderBody();
    applySettings(normalize(current, theme), theme);
  });

  /* ---------- 渲染当前界面的参数 ---------- */

  function renderBody() {
    body.textContent = '';
    const groups = GROUPS.filter((g) => (GROUP_SCREEN[g] || 'main') === screen);

    for (const group of groups) {
      const groupItems = SCHEMA.filter((s) => s.group === group);
      if (!groupItems.length) continue;

      const sec = document.createElement('section');
      sec.className = 'nt-debug-group';

      const h = document.createElement('h3');
      h.className = 'nt-debug-group-title';
      h.textContent = group;
      sec.appendChild(h);

      for (const item of groupItems) {
        sec.appendChild(buildRow(item));
      }
      body.appendChild(sec);
    }
  }

  function buildRow(item) {
    const row = document.createElement('div');
    row.className = 'nt-debug-row';

    const key = document.createElement('span');
    key.className = 'nt-debug-key';
    // 分组标题已经写了「标签栏」「按钮区」，键名不再重复前缀
    key.textContent = item.key.startsWith(item.group) ? item.key.slice(item.group.length) : item.key;
    key.title = item.key;

    row.appendChild(key);

    if (item.type === 'enum') {
      const sel = document.createElement('select');
      sel.className = 'nt-debug-input';
      sel.setAttribute('aria-label', item.key);
      for (const opt of item.options) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      }
      sel.value = String(current[item.key]);
      sel.addEventListener('change', () => {
        pushHistory();
        current[item.key] = sel.value;
        applySettings(normalize(current, theme), theme);
      });
      row.appendChild(sel);
      return row;
    }

    const input = document.createElement('input');
    input.className = 'nt-debug-input';
    input.type = 'text';
    input.setAttribute('aria-label', item.key);
    input.value = String(current[item.key]);
    input.addEventListener('input', () => {
      pushHistory();
      current[item.key] = input.value;
      applySettings(normalize(current, theme), theme);
    });

    row.appendChild(input);
    return row;
  }

  /** 软件界面在用的颜色（当前所有颜色项的值，去重） */
  function currentColors() {
    const set = new Set();
    for (const s of SCHEMA) {
      if (s.unit === 'px') continue;
      const v = current[s.key];
      if (v) set.add(v);
    }
    return Array.from(set);
  }

  renderBody();

  return {
    el: host,
    get: () => normalize(current, theme),
    close: () => host.remove(),
  };
}

/* ---------- 拖动 ---------- */

function enableDrag(host, handle) {
  let drag = null;

  handle.addEventListener('pointerdown', (e) => {
    // 关闭 / 主题 / 独立窗口 按钮都不是拖动把手，否则真实点击会被拖拽吞掉
    if (e.target.closest('.nt-debug-close') || e.target.closest('.nt-debug-theme') || e.target.closest('.nt-debug-pop')) return;
    // 如果还有生效的 transform（居中），先转成绝对 left/top，避免拖动时叠加偏移
    const cs = getComputedStyle(host);
    if (cs.transform && cs.transform !== 'none') {
      const r0 = host.getBoundingClientRect();
      host.style.left = r0.left + 'px';
      host.style.top = r0.top + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      host.style.transform = 'none';
    }
    const r = host.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件可能无 pointerId */ }
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    host.style.left = (e.clientX - drag.dx) + 'px';
    host.style.top = (e.clientY - drag.dy) + 'px';
    host.style.right = 'auto';
    host.style.bottom = 'auto';
  });

  handle.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({
        left: parseInt(host.style.left, 10) || 0,
        top: parseInt(host.style.top, 10) || 0,
      }));
    } catch (e) { /* ignore */ }
  });
}
