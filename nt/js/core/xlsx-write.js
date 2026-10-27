// 数据：xlsx 的 XML 生成（纯函数，Node 可跑）
/**
 * xlsx 的 XML 生成
 * 层：第一层 · core
 *
 * 只生成 XML 字符串，不打包 ZIP（打包在 ui/xlsx-write.js）。
 *
 * **带样式**：照单文件版（personal/index.html 的 _xlsxStyles / _xlsxSheetXml）搬过来。
 * 之前这里只写 inlineStr、没有 styles.xml，导出的表在 Excel 里是白板 ——
 * 表头没有底色、金额没有千分位、日期是文本、列宽全一样。
 *
 * 样式索引（= 单文件版的 XS 表）：
 *   0 默认  1 标题  2 表头  3 表头右  4 表头日期
 *   10 左  11 中  12 金额  13 日期  14 分组  15 分组金额  16 合计  17 序号
 *   20-24 是 10-13/17 的斑马纹版本   25 说明行
 *   26/27/30 分期本金行（账户名/其它/金额）  28/29/31 利息行
 *   32/33 标题行里的日期 / 「至」
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

/** ISO 日期 → Excel 序列号（1900 基准；1900-03-01 之后都准） */
export function isoToSerial(iso) {
  const s = String(iso || '').replace(/[^0-9]/g, '');
  if (s.length < 8) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569;
}

/* ============================================================
   一、样式
   ============================================================ */

const XC = {
  dark: 'FF2A2140', gray: 'FFF8FAFC', white: 'FFFFFFFF',
  border: 'FFCBD5E1', text: 'FF0F172A', muted: 'FF64748B',
};

function numFmts() {
  return '<numFmts count="2">'
    + '<numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>'
    + '<numFmt numFmtId="165" formatCode="#,##0.00;-#,##0.00;&quot;&quot;"/>'
    + '</numFmts>';
}

function fonts() {
  const F = (b, sz, color) => `<font>${b ? '<b/>' : ''}<sz val="${sz}"/><color rgb="${color}"/>`
    + '<name val="微软雅黑"/><charset val="134"/></font>';
  return '<fonts count="6">'
    + F(false, 11, XC.text)        // 0 普通
    + F(true, 11, XC.text)         // 1 加粗
    + F(true, 14, XC.text)         // 2 大标题
    + F(true, 11, XC.white)        // 3 深底白字
    + F(false, 9, XC.muted)        // 4 说明小字
    + F(true, 14, XC.text)         // 5 大标题（标题行用）
    + '</fonts>';
}

function fills() {
  return '<fills count="4">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + `<fill><patternFill patternType="solid"><fgColor rgb="${XC.dark}"/><bgColor indexed="64"/></patternFill></fill>`
    + `<fill><patternFill patternType="solid"><fgColor rgb="${XC.gray}"/><bgColor indexed="64"/></patternFill></fill>`
    + '</fills>';
}

function borders() {
  const T = (s) => `style="${s}"><color rgb="${XC.border}"/>`;
  return '<borders count="4">'
    + '<border><left/><right/><top/><bottom/><diagonal/></border>'
    + `<border><left ${T('thin')}</left><right ${T('thin')}</right><top ${T('thin')}</top><bottom ${T('thin')}</bottom><diagonal/></border>`
    + `<border><left ${T('medium')}</left><right ${T('medium')}</right><top ${T('medium')}</top><bottom ${T('thin')}</bottom><diagonal/></border>`
    + `<border><left ${T('medium')}</left><right ${T('medium')}</right><top ${T('thin')}</top><bottom ${T('medium')}</bottom><diagonal/></border>`
    + '</borders>';
}

function xf(fontId, fillId, borderId, numFmtId, opts) {
  const o = opts || {};
  const al = o.align
    ? `<alignment horizontal="${o.align}" vertical="${o.valign || 'center'}"`
      + `${o.wrap ? ' wrapText="1"' : ''}${o.indent ? ` indent="${o.indent}"` : ''}/>`
    : '';
  return `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"`
    + (numFmtId ? ' applyNumberFormat="1"' : '')
    + (fontId ? ' applyFont="1"' : '')
    + (fillId > 1 ? ' applyFill="1"' : '')
    + (borderId ? ' applyBorder="1"' : '')
    + (al ? ' applyAlignment="1"' : '') + '>'
    + al + '</xf>';
}

function cellXfs() {
  const P = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
  const list = [];
  const put = (idx, xml) => { while (list.length < idx) list.push(P); list[idx] = xml; };

  put(0, P);
  put(1, xf(5, 0, 0, 0, { align: 'left', indent: 4 }));            // 标题
  put(2, xf(3, 2, 1, 0, { align: 'center', wrap: true }));          // 表头
  put(3, xf(3, 2, 1, 0, { align: 'right' }));                       // 表头右
  put(4, xf(3, 2, 1, 164, { align: 'center' }));                    // 表头日期
  put(10, xf(0, 0, 1, 0, { align: 'left' }));
  put(11, xf(0, 0, 1, 0, { align: 'center' }));
  put(12, xf(0, 0, 1, 165, { align: 'right' }));
  put(13, xf(0, 0, 1, 164, { align: 'center' }));
  put(14, xf(3, 2, 1, 0, { align: 'left' }));                       // 分组行
  put(15, xf(3, 2, 1, 165, { align: 'right' }));
  put(16, xf(1, 3, 1, 165, { align: 'right' }));                    // 合计
  put(17, xf(0, 0, 1, 1, { align: 'center' }));                     // 序号
  put(20, xf(0, 3, 1, 0, { align: 'left' }));
  put(21, xf(0, 3, 1, 0, { align: 'center' }));
  put(22, xf(0, 3, 1, 165, { align: 'right' }));
  put(23, xf(0, 3, 1, 164, { align: 'center' }));
  put(24, xf(0, 3, 1, 1, { align: 'center' }));
  put(25, xf(4, 0, 0, 0, { align: 'left' }));                       // 说明行
  put(26, xf(3, 2, 2, 0, { align: 'left', indent: 1 }));            // 分期本金行-账户名
  put(27, xf(0, 0, 2, 0, { align: 'center' }));
  put(28, xf(0, 0, 3, 0, { align: 'left' }));                       // 分期利息行-账户名
  put(29, xf(0, 0, 3, 0, { align: 'center' }));
  put(30, xf(0, 0, 2, 165, { align: 'right' }));
  put(31, xf(0, 0, 3, 165, { align: 'right' }));
  put(32, xf(5, 0, 0, 164, { align: 'center' }));
  put(33, xf(5, 0, 0, 0, { align: 'center' }));

  for (let k = 0; k < list.length; k += 1) if (!list[k]) list[k] = P;
  return `<cellXfs count="${list.length}">${list.join('')}</cellXfs>`;
}

/** 样式表（xl/styles.xml） */
export function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + numFmts() + fonts() + fills() + borders()
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + cellXfs()
    + '<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
}

/* ============================================================
   二、单元格 / 行 / sheet
   ============================================================ */

/** 一个单元格（k = 类型，s = 样式索引） */
export function cellXml(ref, value, k, s) {
  const style = (s == null) ? '' : ` s="${s}"`;
  if (value === '' || value == null) {
    // 空值也写一格：带样式时空格要画出边框，否则表格会缺一块
    return `<c r="${ref}"${style}/>`;
  }

  // 没给类型（老的调用点）：数字写 <v>，但 6 位纯数字是 YYMMDD，必须当文本，
  // 否则 Excel 存成数值、再导入时 parseBillDate 认不出，往返就断了。
  if (k == null) {
    const text = String(value);
    const plain = /^-?\d+(\.\d+)?$/.test(text) && !/^\d{6}$/.test(text);
    if (plain) return `<c r="${ref}"${style}><v>${text}</v></c>`;
    return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">`
      + `${xmlEscape(text)}</t></is></c>`;
  }

  if (k === 'num' || k === 'int') {
    const n = Number(value);
    if (Number.isFinite(n)) return `<c r="${ref}"${style}><v>${n}</v></c>`;
  }

  if (k === 'date') {
    const ser = isoToSerial(value);
    if (ser != null) return `<c r="${ref}"${style}><v>${ser}</v></c>`;
  }

  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">`
    + `${xmlEscape(String(value))}</t></is></c>`;
}

/** 行/格缺省值补全：二维数组也当「一串文本格」的简写 */
function normRow(r) {
  if (Array.isArray(r)) return { cells: r.map((v) => ({ v })) };
  return r || { cells: [] };
}

/** 行种类 + 列类型 → 样式索引（与单文件版的 XS 表一致） */
function styleOf(row, cell) {
  if (cell.s != null) return cell.s;

  const kind = row.kind || 'data';
  const zebra = !!row.zebra && kind === 'data';
  const k = cell.k || 'str';

  if (kind === 'title') return k === 'date' ? 32 : 1;
  if (kind === 'note') return 25;
  if (kind === 'head') return k === 'num' ? 3 : (k === 'date' ? 4 : 2);
  if (kind === 'group') return k === 'num' ? 15 : 14;
  if (kind === 'total') return 16;

  if (k === 'int') return zebra ? 24 : 17;
  if (k === 'num') return zebra ? 22 : 12;
  if (k === 'date') return zebra ? 23 : 13;
  if (k === 'center') return zebra ? 21 : 11;
  return zebra ? 20 : 10;
}

/** 一行 */
export function rowXml(rowIndex, cells) {
  const parts = (cells || []).map((v, ci) => cellXml(colName(ci) + (rowIndex + 1), v, null, null));
  return `<row r="${rowIndex + 1}">${parts.join('')}</row>`;
}

/**
 * 一张 sheet 的 xml。
 * @param {Array|{rows:Array, widths?:number[], freeze?:number}} sheet
 */
export function sheetXml(sheet) {
  const spec = Array.isArray(sheet) ? { rows: sheet } : (sheet || {});
  const rows = spec.rows || [];
  const widths = spec.widths || [];
  const freeze = spec.freeze == null ? 0 : spec.freeze;

  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';

  let views = '<sheetViews><sheetView workbookViewId="0"'
    + (freeze > 0 ? ' tabSelected="1"' : '') + '>';
  if (freeze > 0) {
    views += `<pane ySplit="${freeze}" topLeftCell="A${freeze + 1}"`
      + ' activePane="bottomLeft" state="frozen"/>';
  }
  views += '</sheetView></sheetViews>';

  const cols = widths.length
    ? '<cols>' + widths.map((w, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>'
    : '';

  const body = rows.map((raw, ri) => {
    const row = normRow(raw);
    const r = ri + 1;
    const parts = (row.cells || []).map((cell, ci) => {
      const c = cell || {};
      return cellXml(colName(ci) + r, c.v, c.k, styleOf(row, c));
    }).join('');
    const h = row.h ? ` ht="${row.h}" customHeight="1"` : '';
    return `<row r="${r}"${h}>${parts}</row>`;
  }).join('');

  return head + views + cols + `<sheetData>${body}</sheetData></worksheet>`;
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

/** xl/_rels/workbook.xml.rels（sheet + styles） */
export function workbookRels(sheetNames) {
  const rels = (sheetNames || []).map((_, i) =>
    `<Relationship Id="rId${i + 1}"`
    + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"'
    + ` Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  const stylesId = (sheetNames || []).length + 1;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + rels
    + `<Relationship Id="rId${stylesId}"`
    + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"'
    + ' Target="styles.xml"/>'
    + '</Relationships>';
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

/** [Content_Types].xml（含 styles） */
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
    + '<Override PartName="/xl/styles.xml"'
    + ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + overrides.join('')
    + '</Types>';
}

/**
 * 把若干张表组装成 xlsx 需要的全部文件。
 *
 * @param {{name:string, rows:Array, widths?:number[], freeze?:number}[]} sheets
 * @returns {{name:string, text:string}[]}
 */
export function buildXlsxFiles(sheets) {
  const list = sheets || [];
  const names = list.map((s) => s.name);
  const out = [
    { name: '[Content_Types].xml', text: contentTypes(list.length) },
    { name: '_rels/.rels', text: rootRels() },
    { name: 'xl/workbook.xml', text: workbookXml(names) },
    { name: 'xl/_rels/workbook.xml.rels', text: workbookRels(names) },
    { name: 'xl/styles.xml', text: stylesXml() },
  ];

  list.forEach((s, i) => {
    out.push({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) });
  });

  return out;
}
