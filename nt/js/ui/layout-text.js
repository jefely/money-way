// 界面：布局文本导出/导入
/**
 * 布局文本（UI 层）
 *
 * 两条通道，对应两层存储：
 *   · **默认设置**（defaults）—— 基准值，可导出成文本、存成文件、上传到远端
 *   · **用户设置**（user）    —— 拖动列宽这类操作产生的，只留本地，不导出
 *
 * 序列化在 core/settings.js（toText / parseText），这里只做界面。
 */

import * as NtModal from './modal.js';
import { toText, parseText, normalize } from '../core/settings.js';
import { downloadText } from './file-io.js';
import { loadThemeSettings, loadUserSettings, saveThemeSettings } from './debug-themes.js';

/**
 * @param {{getCurrent:()=>object, getTheme:()=>string,
 *          apply:(patch:object)=>void, ctx?:object}} h
 * @returns {HTMLElement}
 */
export function layoutTextBar(h) {
  const wrap = document.createElement('div');
  wrap.className = 'nt-debug-textbar';

  wrap.appendChild(smallBtn('导出默认', () => showExportDefaults(h)));
  wrap.appendChild(smallBtn('导入默认', () => showImportDefaults(h)));
  wrap.appendChild(smallBtn('导出当前', () => showExportCurrent(h)));
  return wrap;
}

/** 导出「默认设置」：这一层是基准值，可以上传到远端 */
function showExportDefaults(h) {
  const text = toText(loadThemeSettings(pickCtx(h), h.getTheme()), h.getTheme());
  openTextModal('导出默认设置', '这是「默认设置」（基准值），可以存文件或发到远端。', text, 'NT默认设置.txt');
}

/** 导出「当前实际值」：defaults + user 合并后的样子，只读参考 */
function showExportCurrent(h) {
  const text = toText(h.getCurrent(), h.getTheme());
  openTextModal('导出当前参数', '这是 defaults + user 合并后的实际值，仅供查看。', text, 'NT当前参数.txt');
}

/** 导入「默认设置」 */
function showImportDefaults(h) {
  let ta = null;
  let err = null;

  NtModal.open({
    title: '导入默认设置',
    build: (body) => {
      const tip = document.createElement('p');
      tip.className = 'nt-sync-hint';
      tip.textContent = '粘贴默认设置文本。只认「键=值」形式的行，认不出的会被忽略；不会覆盖「用户设置」。';
      body.appendChild(tip);

      ta = document.createElement('textarea');
      ta.className = 'nt-sync-code';
      ta.placeholder = '标签栏行高=40，标签栏字号=13\n…';
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
          if (!raw) { err.textContent = '先粘一段设置文本'; return; }
          const patch = parseText(raw);
          if (!Object.keys(patch).length) {
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

function openTextModal(title, tip, text, filename) {
  NtModal.open({
    title,
    build: (body) => {
      const p = document.createElement('p');
      p.className = 'nt-sync-hint';
      p.textContent = tip;
      body.appendChild(p);

      const ta = document.createElement('textarea');
      ta.className = 'nt-sync-code';
      ta.readOnly = true;
      ta.value = text;
      body.appendChild(ta);

      const bar = document.createElement('div');
      bar.className = 'nt-sync-bar';

      const copy = smallBtn('复制', async () => {
        const ok = await copyText(ta.value);
        copy.textContent = ok ? '已复制' : '请手动复制';
        if (!ok) ta.select();
      });
      bar.appendChild(copy);
      bar.appendChild(smallBtn('存文件', () => downloadText(filename, ta.value)));
      body.appendChild(bar);
    },
    actions: [{ label: '关闭', kind: 'ghost', close: true }],
  });
}

function smallBtn(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nt-btn nt-btn-sm';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

/** 面板传入的 ctx（含 getState/setState），用于读写两层存储 */
function pickCtx(h) {
  return h.ctx || { getState: () => ({}) };
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

/** 把导入的补丁并进现有设置（认不出的键由 normalize 丢掉） */
export function mergePatch(current, patch, theme) {
  return normalize({ ...(current || {}), ...(patch || {}) }, theme);
}
