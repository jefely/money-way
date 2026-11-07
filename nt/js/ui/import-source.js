// 界面：导入源识别（文件 / 粘贴文本 → 账单 / 通用表 / 备份 / 流水文本）
/**
 * 导入源识别（UI 层）
 *
 * 用户在导入窗口只有两个动作：打开一个文件、粘贴一段文本。
 * 这里把两者归成同一种「源」，窗口只按 kind 决定下面要补什么：
 *
 *   bill   → 起始日期 + 我的账户（支付宝 / 微信 / 招行预设账单）
 *   table  → 通用表（日期 + 金额），不用补东西
 *   backup → 密文要密码；.lz / 整本 Excel 要输入「覆盖」两个字
 *   text   → 账本流水文本，直接合并进当前账本
 *
 * 为什么文本也要过一遍 analyzeTable：手机上没有文件可存时，
 * 用户会把账单 CSV 的内容直接粘进来 —— 那份内容和一个 .csv 文件是同一件事。
 */

import { readAnyTable, decodeBytes } from './xlsx-read.js';
import { analyzeTable } from '../core/import-table.js';
import { pickTemplateSheets } from '../core/xlsx-template.js';
import { isBackupText } from '../core/backup-file.js';
import { readBackupFile } from './import-backup.js';
import { parseCsv, tidyRows } from '../core/csv.js';

/** 账本流水文本：有一行以「账户：」或「流水：」开头就按文本走，别再猜表头 */
const LEDGER_RE = /(^|\n)[ \t]*(账户|流水)[ \t]*[:：]/;

/** 行数组 → bill / table（认不出返回 null） */
function fromRows(rows) {
  const r = analyzeTable(rows);
  if (r.kind === 'bill') return { kind: 'bill', result: r };
  if (r.kind === 'generic') return { kind: 'table', result: r };
  return null;
}

/**
 * 一段文本 → 源。
 * @param {string} text
 * @returns {{kind:'bill'|'table'|'backup'|'text', result?:object, backup?:object, text?:string}|null}
 */
export function sourceFromText(text) {
  const t = String(text == null ? '' : text);
  if (!t.trim()) return null;
  if (isBackupText(t)) return { kind: 'backup', backup: { kind: 'backup', text: t } };
  if (!LEDGER_RE.test(t)) {
    const table = fromRows(tidyRows(parseCsv(t)));
    if (table) return table;
  }
  return { kind: 'text', text: t };
}

/**
 * 一个文件 → 源（.lz / 整本 Excel / 密文 / 账单表格 / 流水文本）。
 * @param {File} file
 */
export async function sourceFromFile(file) {
  const name = String((file && file.name) || '');

  if (/\.lz$/i.test(name)) return { kind: 'backup', backup: await readBackupFile(file) };

  if (/\.xlsx?$/i.test(name)) {
    const book = await readAnyTable(file);
    if (pickTemplateSheets(book.sheets).isTemplate) {
      return { kind: 'backup', backup: await readBackupFile(file) };
    }
    const sheet = book.sheets[0];
    if (!sheet) throw new Error('这个文件里没有可读的表');
    const table = fromRows(sheet.rows);
    if (!table) throw new Error('没认出表头：需要一列日期 + 一列金额');
    table.result.fileName = name;
    table.result.sheetName = sheet.name;
    return table;
  }

  const s = sourceFromText(decodeBytes(await file.arrayBuffer()));
  if (!s) throw new Error('这个文件是空的');
  // .txt 里的密文：摘要要显示文件名，不然用户不知道刚打开的是哪一份
  if (s.kind === 'backup' && s.backup) s.backup.fileName = name;
  return s;
}
