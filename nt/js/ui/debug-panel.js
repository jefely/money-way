/**
 * 界面参数调试面板（UI 层）
 *
 * 第一行是界面标签栏（当前只有「主界面」，以后可加「设置界面」等），
 * 下面按区域分组：标签栏 / 按钮区 / 列标行 / 数据区 / 信息栏。
 * 改任意一项实时生效；可导出/恢复默认；面板可拖动。
 */

import { GROUPS, SCREENS, SCHEMA, DEFAULTS, normalize } from '../core/settings.js';
import { applySettings } from './apply-settings.js';
import { openColorPicker } from './color-picker.js';

const POS_KEY = 'nt_debug_pos';

export function mountDebugPanel(opts) {
  const o = opts || {};
  const initialState = o.initial || (o.getState ? o.getState().settings : {});
  let current = normalize(initialState);
  let screen = SCREENS[0].id;

  const host = document.createElement('aside');
  host.className = 'nt-debug';

  /* ---------- 第一行：拖动条（空行，只负责拖动） ---------- */

  const dragBar = document.createElement('div');
  dragBar.className = 'nt-debug-drag';
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
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'nt-debug-btn';
  saveBtn.textContent = '保存';
  foot.appendChild(resetBtn);
  foot.appendChild(saveBtn);

  host.appendChild(dragBar);
  host.appendChild(tabs);
  host.appendChild(body);
  host.appendChild(foot);
  document.body.appendChild(host);

  applySettings(current);
  enableDrag(host, dragBar);

  closeBtn.addEventListener('click', () => host.remove());
  saveBtn.addEventListener('click', () => {
    if (o.setState && o.getState) {
      o.setState({ ...o.getState(), settings: normalize(current) });
    }
    if (o.save) o.save();
    saveBtn.textContent = '已保存';
    setTimeout(() => { saveBtn.textContent = '保存'; }, 1200);
  });
  resetBtn.addEventListener('click', () => {
    current = normalize(DEFAULTS);
    renderBody();
    applySettings(current);
  });

  /* ---------- 渲染当前界面的参数 ---------- */

  function renderBody() {
    body.textContent = '';
    const items = SCHEMA.filter((s) => (s.screen || 'main') === screen);

    for (const group of GROUPS) {
      const groupItems = items.filter((s) => s.group === group);
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
        current[item.key] = sel.value;
        applySettings(normalize(current));
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
      current[item.key] = input.value;
      applySettings(normalize(current));
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
    get: () => normalize(current),
    close: () => host.remove(),
  };
}

/* ---------- 拖动 ---------- */

function enableDrag(host, handle) {
  let drag = null;

  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.nt-debug-close')) return;
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

/* ---------- 导出层 ---------- */

function showExport(text) {
  const mask = document.createElement('div');
  mask.className = 'nt-debug-mask';

  const box = document.createElement('div');
  box.className = 'nt-debug-export';

  const ta = document.createElement('textarea');
  ta.className = 'nt-debug-ta';
  ta.readOnly = true;
  ta.value = text;

  const bar = document.createElement('div');
  bar.className = 'nt-debug-foot';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'nt-debug-btn';
  copy.textContent = '复制';
  copy.addEventListener('click', () => {
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'nt-debug-btn';
  close.textContent = '关闭';
  close.addEventListener('click', () => mask.remove());

  bar.appendChild(copy);
  bar.appendChild(close);
  box.appendChild(ta);
  box.appendChild(bar);
  mask.appendChild(box);
  document.body.appendChild(mask);
}
