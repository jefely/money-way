// 界面：布局文本导出/导入
/**
 * 布局文本（UI 层）
 *
 * 一条工具行：把当前布局参数导出成一段文本，或把文本粘回来套用。
 * 序列化本身在 core/settings.js（toText / parseText），这里只做界面。
 *
 * 用途：换设备、改坏了想复原、把一套调好的参数发给别人。
 */

import * as NtModal from './modal.js';
import { toText, parseText, normalize } from '../core/settings.js';

/**
 * @param {{getCurrent:()=>object, getTheme:()=>string,
 *          apply:(patch:object)=>void}} h
 * @returns {HTMLElement}
 */
export function layoutTextBar(h) {
  const wrap = document.createElement('div');
  wrap.className = 'nt-debug-textbar';

  const outBtn = document.createElement('button');
  outBtn.type = 'button';
  outBtn.className = 'nt-debug-btn';
  outBtn.textContent = '导出文本';
  outBtn.addEventListener('click', () => showExport(h));

  const inBtn = document.createElement('button');
  inBtn.type = 'button';
  inBtn.className = 'nt-debug-btn';
  inBtn.textContent = '导入文本';
  inBtn.addEventListener('click', () => showImport(h));

  wrap.appendChild(outBtn);
  wrap.appendChild(inBtn);
  return wrap;
}

/** 导出：把当前参数摆成可复制的文本 */
function showExport(h) {
  const text = toText(h.getCurrent(), h.getTheme());

  NtModal.open({
    title: '导出布局文本',
    build: (body) => {
      const tip = document.createElement('p');
      tip.className = 'nt-sync-hint';
      tip.textContent = '复制这段文本保存起来。以后粘回「导入文本」就能恢复这套布局。';
      body.appendChild(tip);

      const ta = document.createElement('textarea');
      ta.className = 'nt-sync-code';
      ta.readOnly = true;
      ta.value = text;
      body.appendChild(ta);

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'nt-btn nt-btn-sm';
      copy.textContent = '复制';
      copy.addEventListener('click', async () => {
        const ok = await copyText(text);
        copy.textContent = ok ? '已复制' : '请手动选中复制';
        if (!ok) ta.select();
      });
      body.appendChild(copy);
    },
    actions: [{ label: '关闭', kind: 'ghost', close: true }],
  });
}

/** 导入：粘一段文本回来套用 */
function showImport(h) {
  let ta = null;
  let err = null;

  NtModal.open({
    title: '导入布局文本',
    build: (body) => {
      const tip = document.createElement('p');
      tip.className = 'nt-sync-hint';
      tip.textContent = '粘贴之前导出的文本。只认「键=值」形式的行，认不出的会被忽略。';
      body.appendChild(tip);

      ta = document.createElement('textarea');
      ta.className = 'nt-sync-code';
      ta.placeholder = '标签栏高=34，按钮区高=34\n表格字号=13';
      body.appendChild(ta);

      err = document.createElement('p');
      err.className = 'nt-import-err';
      body.appendChild(err);
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '套用',
        kind: 'primary',
        close: false,
        onClick: ({ close: c }) => {
          const raw = String(ta.value || '').trim();
          if (!raw) {
            err.textContent = '先粘一段文本';
            return;
          }
          const patch = parseText(raw);
          const keys = Object.keys(patch);
          if (!keys.length) {
            err.textContent = '没认出任何「键=值」，检查一下格式';
            return;
          }
          h.apply(patch);
          c();
        },
      },
    ],
  });
}

/** 把导入的补丁并进现有设置（认不出的键由 normalize 丢掉） */
export function mergePatch(current, patch, theme) {
  return normalize({ ...(current || {}), ...(patch || {}) }, theme);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* 掉到下面 */ }
  return false;
}
