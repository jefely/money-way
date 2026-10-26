/**
 * 界面参数调试面板（UI 层）
 *
 * 第一行是界面标签栏（当前只有「主界面」，以后可加「设置界面」等），
 * 下面按区域分组：标签栏 / 按钮区 / 列标行 / 数据区 / 信息栏。
 * 改任意一项实时生效；可导出/恢复默认；面板可拖动。
 */

import { GROUPS, SCREENS, SCHEMA, DEFAULTS, normalize, toText } from '../core/settings.js';
import { applySettings } from './apply-settings.js';

const POS_KEY = 'nt_debug_pos';

export function mountDebugPanel(opts) {
  const o = opts || {};
  let current = normalize(o.initial);
  let screen = SCREENS[0].id;

  const host = document.createElement('aside');
  host.className = 'nt-debug';

  /* ---------- 第一行：拖动条（空行，只负责拖动） ---------- */

  const dragBar = document.createElement('div');
  dragBar.className = 'nt-debug-drag';

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

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nt-debug-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', '关闭调试面板');
  tabs.appendChild(closeBtn);

  /* ---------- 参数区 ---------- */

  const body = document.createElement('div');
  body.className = 'nt-debug-body';

  /* ---------- 底部操作 ---------- */

  const foot = document.createElement('div');
  foot.className = 'nt-debug-foot';
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'nt-debug-btn';
  exportBtn.textContent = '导出参数';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'nt-debug-btn';
  resetBtn.textContent = '恢复默认';
  foot.appendChild(exportBtn);
  foot.appendChild(resetBtn);

  host.appendChild(dragBar);
  host.appendChild(tabs);
  host.appendChild(body);
  host.appendChild(foot);
  document.body.appendChild(host);

  applySettings(current);
  restorePos(host);
  enableDrag(host, dragBar);

  closeBtn.addEventListener('click', () => host.remove());
  exportBtn.addEventListener('click', () => showExport(toText(current)));
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
    key.textContent = item.key;

    const input = document.createElement('input');
    input.className = 'nt-debug-input';
    input.type = 'text';
    input.setAttribute('aria-label', item.key);
    input.value = String(current[item.key]);
    input.addEventListener('input', () => {
      current[item.key] = input.value;
      applySettings(normalize(current));
    });

    row.appendChild(key);
    row.appendChild(input);

    return row;
  }

  renderBody();

  return {
    el: host,
    get: () => normalize(current),
    close: () => host.remove(),
  };
}

/* ---------- 位置记忆 + 拖动 ---------- */

function restorePos(host) {
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      host.style.left = saved.left + 'px';
      host.style.top = saved.top + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    }
  } catch (e) { /* ignore */ }
}

function enableDrag(host, handle) {
  let drag = null;

  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.nt-debug-close')) return;
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
