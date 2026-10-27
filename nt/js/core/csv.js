// 数据：CSV 解析（纯函数，Node 可跑）
/**
 * CSV 解析
 * 层：第一层 · core
 *
 * 支持：
 *   · 双引号包裹
 *   · 引号内的逗号与换行
 *   · "" 转义成一个引号
 *   · 自动识别逗号 / 制表符分隔
 */

/** 猜分隔符：看第一行里哪个更多 */
export function guessDelimiter(text) {
  const first = String(text || '').split(/\r?\n/)[0] || '';
  const comma = (first.match(/,/g) || []).length;
  const tab = (first.match(/\t/g) || []).length;
  const semi = (first.match(/;/g) || []).length;
  if (tab > comma && tab >= semi) return '\t';
  if (semi > comma && semi > tab) return ';';
  return ',';
}

/**
 * CSV 文本 → 二维字符串数组。
 *
 * 逐字符扫而不是 split：引号里的逗号和换行不能当分隔符。
 *
 * @param {string} text
 * @param {string} [delim] 分隔符，不传就自动猜
 * @returns {string[][]}
 */
export function parseCsv(text, delim) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const d = delim || guessDelimiter(src);

  const rows = [];
  let row = [];
  let cell = '';
  let inQuote = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inQuote) {
      if (ch === '"') {
        if (src[i + 1] === '"') {      // "" → 一个字面引号
          cell += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuote = true;
    } else if (ch === d) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\r') {
      // 忽略，等 \n
    } else {
      cell += ch;
    }
  }

  // 收尾
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/** 去掉首尾空白与空行 */
export function tidyRows(rows) {
  return rows
    .map((r) => r.map((c) => String(c == null ? '' : c).trim()))
    .filter((r) => r.some((c) => c !== ''));
}
