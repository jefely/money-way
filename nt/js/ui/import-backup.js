// 界面：备份文件导入（.lz 快照 / 加密备份 / 整本 Excel 备份）
/**
 * 备份文件导入（UI 层）
 *
 * 和「账单导入」分开：账单是**追加**，备份是**覆盖**，语义差得远，
 * 混在一个按钮里用户很容易点错（用户 2026-11 要求拆开）。
 *
 * 这里只判断文件属于哪一类，然后把确认交给 import-dialog 的三个已有入口。
 */

import * as NtModal from './modal.js';
import { readAnyTable } from './xlsx-read.js';
import { pickTemplateSheets } from '../core/xlsx-template.js';
import { readLzText } from '../core/lz-file.js';
import { isBackupText } from '../core/backup-file.js';
import { showTemplateImport, showLzImport } from './import-dialog.js';

/**
 * @param {File} file
 * @param {object} o openImportHub 的 opts（onImportTemplate / restoreBackup / onRestore / setFooter）
 * @param {(msg:string)=>void} onError
 */
export async function loadBackupFile(file, o, onError) {
  const fail = (msg) => { if (typeof onError === 'function') onError(msg); };
  if (!file) return;
  const name = String(file.name || '');

  if (/\.lz$/i.test(name)) {
    try {
      showLzImport(await readLzText(await file.text()), name, o);
    } catch (e) {
      fail('读取失败：' + ((e && e.message) || e));
    }
    return;
  }

  if (!/\.xlsx?$/i.test(name)) {
    let text = '';
    try { text = await file.text(); } catch (e) { text = ''; }
    if (isBackupText(text)) {
      askPassword(text, o);
      return;
    }
    fail('这不是备份文件：需要 .lz 快照 / 加密备份文本 / 整本 Excel 备份');
    return;
  }

  try {
    const book = await readAnyTable(file);
    const picked = pickTemplateSheets(book.sheets);
    if (picked.isTemplate) {
      showTemplateImport(picked, name, o);
      return;
    }
    fail('这个 Excel 不是整本备份（要 4 张表：流水 / 设置 / 分期 / 固定）');
  } catch (e) {
    fail('读取失败：' + ((e && e.message) || e));
  }
}

/** 加密备份：问密码 → 解开 → 替换当前账本 */
export function askPassword(text, o) {
  if (typeof o.restoreBackup !== 'function') {
    if (typeof o.setFooter === 'function') o.setFooter('这是加密备份，当前不能恢复');
    return;
  }
  let pw = null;
  let err = null;
  NtModal.open({
    title: '恢复加密备份',
    build: (body) => {
      const tip = document.createElement('p');
      tip.className = 'nt-sync-hint';
      tip.textContent = '用导出时的账本密码解开。解开后会替换当前这笔账。';
      body.appendChild(tip);
      pw = document.createElement('input');
      pw.type = 'password';
      pw.className = 'nt-input';
      pw.setAttribute('aria-label', '账本密码');
      body.appendChild(pw);
      err = document.createElement('p');
      err.className = 'nt-sync-hint';
      body.appendChild(err);
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '恢复',
        kind: 'primary',
        close: false,
        onClick: async ({ close }) => {
          try {
            const state = await o.restoreBackup(text, pw ? pw.value : '');
            close();
            if (typeof o.onRestore === 'function') o.onRestore(state);
          } catch (e) {
            if (err) err.textContent = '解不开：密码不对，或文件已损坏';
          }
        },
      },
    ],
  });
}
