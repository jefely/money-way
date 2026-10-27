// 数据：导出为纯文本（.txt 模板 / .csv）
/**
 * 文本导出
 * 层：第一层 · core
 *
 * 两种格式，都是「导出后能原样导回」的：
 *
 *   .txt  中文逗号分隔，账户段 + 流水段。与 text.html 的导入格式一致。
 *   .csv  制表符分隔、带 BOM、CRLF。Excel 和第三方工具都认。
 *
 * 账户用**简码**（不是 id）：导入时简码和名字都能解析，简码更稳。
 */

/** ISO 日期 → YYMMDD（260801） */
export function toYmdShort(iso) {
  const s = String(iso || '').replace(/[^0-9]/g, '');
  if (s.length >= 8) return s.slice(2, 8);
  if (s.length >= 6) return s.slice(-6);
  return '';
}

/** 金额 → 两位小数文本（不用千分位，导入要能读回去） */
function amt(v) {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/** 去掉会破坏单行格式的字符 */
function clean(v) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim();
}

/**
 * .txt 模板：账户段 + 空行 + 流水段。
 *
 * @param {object} state
 * @param {{codeOf:(id:string)=>string}} h
 */
export function toTxtText(state, h) {
  const codeOf = (h && h.codeOf) || (() => '');
  const lines = ['账户'];

  for (const a of state.accounts || []) {
    lines.push([
      a.type || '资产类',
      a.category || '',
      a.code || '',
      a.name || '',
      a.opening == null || a.opening === '' ? '0.00' : amt(a.opening),
      '',
    ].join('，'));
  }

  lines.push('', '流水');

  for (const t of state.transactions || []) {
    lines.push([
      toYmdShort(t.date),
      codeOf(t.from_id),
      codeOf(t.to_id),
      amt(t.amount),
      clean(t.note),
      '',
    ].join('，'));
  }

  return lines.join('\n');
}

/**
 * .csv：制表符分隔，带 BOM，CRLF 换行。
 *
 * 制表符而不是逗号 —— 账户名里可能有逗号（比如「招行储, 7912」），
 * 制表符基本不会出现在名字里，省去转义的麻烦。
 */
export function toCsvText(state, h) {
  const codeOf = (h && h.codeOf) || (() => '');
  const rows = [['日期', '转出', '转入', '金额', '备注'].join('\t')];

  for (const t of state.transactions || []) {
    rows.push([
      toYmdShort(t.date),
      codeOf(t.from_id),
      codeOf(t.to_id),
      amt(t.amount),
      clean(t.note),
    ].join('\t'));
  }

  return '\ufeff' + rows.join('\r\n');
}

/**
 * 导出用的文件名前缀：NT账本_20261027_2130
 */
export function exportBaseName(now) {
  const d = now || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `NT账本_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
    + `_${p(d.getHours())}${p(d.getMinutes())}`;
}
