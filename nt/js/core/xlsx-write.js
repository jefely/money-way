// 数据：xlsx 的 XML 生成（纯函数，Node 可跑）
/**
 * xlsx 的 XML 生成
 * 层：第一层 · core
 *
 * 只生成 XML 字符串，不打包 ZIP（打包在 ui/xlsx-write.js）。
 *
 * 结构取最小可用集：
 *   [Content_Types].xml
 *   _rels/.rels
 *   xl/workbook.xml
 *   xl/_rels/workbook.xml.rels
 *   xl/worksheets/sheet1.xml
 *
 * 字符串一律走 inlineStr，不建 sharedStrings —— 少一个文件、少一层索引。
 */

/** XML 转义 */
export function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA */
export function colName(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * 一个单元格。
 * 数字写成 <v>，其它写成 inlineStr（Excel 会当文本，避免 01 变成 1）。
 */
export function cellXml(ref, value) {
  if (value == null || value === '') return `<c r="${ref}"/>`;

  const s = String(value);
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(s);

  // 6 位纯数字是 YYMMDD 日期（261024），必须当文本。
  // 写成 <v> 的话 Excel 存成数值，再导入时 parseBillDate 认不出 —— 往返就断了。
  const looksLikeDate = /^\d{6}$/.test(s);

  if (isPlainNumber && !looksLikeDate) {
    return `<c r="${ref}"><v>${s}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(s)}</t></is></c>`;
}

/** 一行 */
export function rowXml(rowIndex, cells) {
  const parts = (cells || []).map((v, ci) => cellXml(colName(ci) + (rowIndex + 1), v));
  return `<row r="${rowIndex + 1}">${parts.join('')}</row>`;
}

/**
 * 一张 sheet 的 xml。
 * @param {Array<Array<any>>} rows
 */
export function sheetXml(rows) {
  const body = (rows || []).map((r, i) => rowXml(i, r)).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetData>${body}</sheetData>`
    + '</worksheet>';
}

/** workbook.xml（sheet 名列表） */
export function workbookXml(sheetNames) {
  const sheets = (sheetNames || []).map((n, i) =>
    `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheets>${sheets}</sheets>`
    + '</workbook>';
}

/** xl/_rels/workbook.xml.rels */
export function workbookRels(sheetNames) {
  const rels = (sheetNames || []).map((_, i) =>
    `<Relationship Id="rId${i + 1}"`
    + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"'
    + ` Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + `${rels}</Relationships>`;
}

/** _rels/.rels */
export function rootRels() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1"'
    + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
    + ' Target="xl/workbook.xml"/>'
    + '</Relationships>';
}

/** [Content_Types].xml */
export function contentTypes(sheetCount) {
  const overrides = [];
  for (let i = 1; i <= sheetCount; i += 1) {
    overrides.push(`<Override PartName="/xl/worksheets/sheet${i}.xml"`
      + ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml"'
    + ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + overrides.join('')
    + '</Types>';
}

/**
 * 把若干张表组装成 xlsx 需要的全部文件。
 *
 * @param {{name:string, rows:Array<Array<any>>}[]} sheets
 * @returns {{name:string, text:string}[]}
 */
export function buildXlsxFiles(sheets) {
  const names = sheets.map((s) => s.name);
  const out = [
    { name: '[Content_Types].xml', text: contentTypes(sheets.length) },
    { name: '_rels/.rels', text: rootRels() },
    { name: 'xl/workbook.xml', text: workbookXml(names) },
    { name: 'xl/_rels/workbook.xml.rels', text: workbookRels(names) },
  ];

  sheets.forEach((s, i) => {
    out.push({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s.rows) });
  });

  return out;
}
