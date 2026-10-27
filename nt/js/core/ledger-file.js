/**
 * 账本文件（纯函数）
 * 层：第一层 · 数据基座
 *
 * 给「导出成文件 / 从文件导入」用的包装：
 *   · 加一段 `#` 开头的头部注释（解析器会忽略 `#` 行）
 *   · 文件名带日期
 *
 * 正文就是 core/flow-text.js 的两段式账本文本，不再另造格式 ——
 * 这样文件、同步码、文本编辑器三处永远是同一种东西。
 */

import { ledgerToText } from './flow-text.js';

/** 文件头部说明（`#` 开头，解析时会被忽略） */
const HEADER = [
  '# NT账本 · 多文件版',
  '# 格式：两段式，中文逗号分隔',
  '#   账户：类型，分类，简码，名称，期初，账单日，还款日',
  '#   流水：日期(YYMMDD)，转出，转入，金额，备注',
  '# 可以直接用文本编辑器改，再导回来。',
  '',
];

/**
 * 账本 → 文件内容。
 * @param {object} state
 * @param {{withHeader?:boolean}} [opts]
 */
export function ledgerToFile(state, opts) {
  const o = opts || {};
  const body = ledgerToText(state);
  if (o.withHeader === false) return body;
  return HEADER.join('\n') + body;
}

/**
 * 文件名：NT账本-20261027.txt
 * @param {string} [prefix]
 * @param {Date} [now]
 */
export function ledgerFileName(prefix, now) {
  const d = now || new Date();
  const ymd = d.getFullYear()
    + String(d.getMonth() + 1).padStart(2, '0')
    + String(d.getDate()).padStart(2, '0');
  return (prefix || 'NT账本') + '-' + ymd + '.txt';
}

/**
 * 从文件名猜这是什么（用于导入时给个提示）。
 * @param {string} name
 */
export function guessKind(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.txt')) return 'text';
  if (n.endsWith('.csv')) return 'text';
  if (n.endsWith('.json')) return 'json';
  return 'unknown';
}
