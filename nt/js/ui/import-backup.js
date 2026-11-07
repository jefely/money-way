// 界面：备份文件读取（.lz 快照 / 加密备份 / 整本 Excel 备份）
/**
 * 备份文件读取（UI 层）
 *
 * 只读文件、不弹窗：确认与覆盖都放在导入窗口里（用户 2026-11：
 * 「不能一堆弹窗，要整合」）。这里返回一份「读懂了什么」，
 * 由调用方在同一个窗口里显示警告并执行。
 */

import { readAnyTable } from './xlsx-read.js';
import { pickTemplateSheets } from '../core/xlsx-template.js';
import {
  parseSettingsRows, parseFlowRows, parseFixedRows, parseInstRows, stateFromTemplate,
} from '../core/xlsx-template-read.js';
import { readLzText, stateFromLzPayload } from '../core/lz-file.js';
import { isBackupText } from '../core/backup-file.js';

/**
 * @param {File} file
 * @returns {Promise<{kind:'lz'|'xlsx'|'backup', fileName:string, state?:object, stats?:object, text?:string}>}
 */
export async function readBackupFile(file) {
  const name = String((file && file.name) || '');

  if (/\.lz$/i.test(name)) {
    const built = stateFromLzPayload(await readLzText(await file.text()));
    return { kind: 'lz', fileName: name, state: built.state, stats: built.stats };
  }

  if (!/\.xlsx?$/i.test(name)) {
    let text = '';
    try { text = await file.text(); } catch (e) { text = ''; }
    if (isBackupText(text)) return { kind: 'backup', fileName: name, text };
    throw new Error('这不是备份文件：需要 .lz 快照 / 加密备份文本 / 整本 Excel 备份');
  }

  const book = await readAnyTable(file);
  const picked = pickTemplateSheets(book.sheets);
  if (!picked.isTemplate) {
    throw new Error('这个 Excel 不是整本备份（要 4 张表：流水 / 设置 / 分期 / 固定）');
  }
  const built = stateFromTemplate({
    accounts: parseSettingsRows(picked.settings),
    flow: parseFlowRows(picked.flow),
    fixed: parseFixedRows(picked.fixed),
    inst: parseInstRows(picked.inst),
  });
  return { kind: 'xlsx', fileName: name, state: built.state, stats: built.stats };
}

/** 备份预览文字（同一段文字也当警告用） */
export function backupSummary(backup) {
  if (!backup) return '';
  const s = backup.stats || {};
  const head = backup.kind === 'lz'
    ? '这是一份 .lz 账本快照（LZ1/LZ0 + gzip JSON）。'
    : backup.kind === 'backup'
      ? '这是一份加密备份文本。'
      : '这是一个整本备份（4 张表：流水 / 设置 / 分期 / 固定）。';
  const info = backup.kind === 'backup'
    ? '需要账本密码才能解开。'
    : `账户 ${s.accounts || 0} 个 · 流水 ${s.transactions || 0} 笔`
      + `　固定 ${s.fixed || 0} 条 · 分期 ${s.inst || 0} 条`;

  if (backup.kind === 'backup') return `${head}\n文件：${backup.fileName || '（来自剪贴板）'}\n${info}\n\n解开后会替换当前账本。`;
  return `${head}\n文件：${backup.fileName}\n${info}\n\n导入会覆盖当前账本：现在的账户、流水、计划都会被替换。`;
}
