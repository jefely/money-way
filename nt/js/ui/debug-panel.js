/**
 * 界面参数调试面板（UI 层）
 *
 * 按 5 个区域（标签栏/按钮区/列标行/数据区/信息栏）分组，
 * 每项一个输入框，输入即写 CSS 变量、实时预览；可导出/恢复默认。
 *
 * 后期把入口从「?debug=1」换成「设置 → 布局」，本文件即产品配置模块。
 */

import { GROUPS, SCHEMA, DEFAULTS, normalize, toText } from '../core/settings.js';
import { applySettings } from './apply-settings.js';

/**
 * @param {{initial?:object}} [opts]
 * @returns {{el:HTMLElement, get:()=>object, close:()=>void}}
 */
export function mountDebugPanel(opts) {
  const o = opts || {};
  let current = normalize(o.initial);

  const host = document.createElement('aside');
  host.className = 'nt-debug';

  const head = document.createElement('div');
  head.className = 'nt-debug-head';
  const title = document.createElement('span');
  title.className = 'nt-debug-title';
  title.textContent = '界面参数 · 调试';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nt-debug-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', '关闭调试面板');
  head.appendChild(title);
  head.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'nt-debug-body';
  const inputs = {};

  for (const group of GROUPS) {
    const sec = document.createElement('section');
    sec.className = 'nt-debug-group';

    const h = document.createElement('h3');
    h.className = 'nt-debug-group-title';
    h.textContent = group;
    sec.appendChild(h);

    for (const item of SCHEMA) {
      if (item.group !== group) continue;
      const row = document.createElement('label');
      row.className = 'nt-debug-row';

      const key = document.createElement('span');
      key.className = 'nt-debug-key';
      key.textContent = item.key;

      const input = document.createElement('input');
      input.className = 'nt-debug-input';
      input.type = 'text';
      input.value = String(current[item.key]);
      input.addEventListener('input', () => {
        current[item.key] = input.value;
        applySettings(normalize(current));
      });

      inputs[item.key] = input;
      row.appendChild(key);
      row.appendChild(input);
      sec.appendChild(row);
    }
    body.appendChild(sec);
  }

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

  host.appendChild(head);
  host.appendChild(body);
  host.appendChild(foot);
  document.body.appendChild(host);

  applySettings(current);

  closeBtn.addEventListener('click', () => host.remove());

  exportBtn.addEventListener('click', () => showExport(toText(current)));

  resetBtn.addEventListener('click', () => {
    current = normalize(DEFAULTS);
    for (const k of Object.keys(inputs)) inputs[k].value = String(current[k]);
    applySettings(current);
  });

  return {
    el: host,
    get: () => normalize(current),
    close: () => host.remove(),
  };
}

/** 导出层：只读 textarea + 复制/关闭 */
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
