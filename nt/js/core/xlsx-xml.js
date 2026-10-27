// 数据：xlsx 的 XML 解析（纯函数，Node 可跑）
/**
 * xlsx 的 XML 解析
 * 层：第一层 · core
 *
 * 只做「字符串 → 数据结构」，不碰 ZIP、不碰浏览器解压 API。
 * 压缩包展开在 ui/xlsx-read.js。
 *
 * 手写正则而不是 DOMParser：
 *   · 纯函数，Node 里能直接单测
 *   · xlsx 的结构很固定，DOMParser 的命名空间反而更麻烦
 */

/** XML 实体解码 */
export function xmlDecode(t) {
  return String(t)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** 列名（A, B, ..., AA）→ 0 基索引 */
export function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(String(ref || '').toUpperCase());
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** sharedStrings.xml → 字符串数组 */
export function parseSharedStrings(xml) {
  const out = [];
  if (!xml) return out;

  const items = xml.match(/<si[\s>][\s\S]*?<\/si>|<si\/>/g) || [];
  for (const si of items) {
    // 一个 si 里可能有多个 <t>（富文本分段），拼起来
    const ts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
    out.push(ts.map((t) => xmlDecode(t.replace(/<[^>]+>/g, ''))).join(''));
  }
  return out;
}

/**
 * 解析一张 sheet → 二维数组（字符串 / 数字）。
 *
 * 注意 cellRe 里的 `[^>]*?` 必须非贪婪：
 * 贪婪会把自闭合 `<c ... />` 的斜杠也吃掉，
 * 导致空单元格后面那个有值的单元格被整段吞掉。
 */
export function parseSheetRows(xml, shared) {
  const rows = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let m;

  while ((m = rowRe.exec(xml))) {
    const rIdx = parseInt(m[1], 10) - 1;
    const cells = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;

    while ((c = cellRe.exec(m[2]))) {
      const attrs = c[1] || '';
      const inner = c[2] || '';
      const refM = /r="([A-Z]+\d+)"/.exec(attrs);
      const ci = refM ? colIndex(refM[1]) : cells.length;
      const tM = /t="([^"]+)"/.exec(attrs);
      const type = tM ? tM[1] : 'n';
      let val = '';
      const vM = /<v>([\s\S]*?)<\/v>/.exec(inner);

      if (type === 's') {
        if (vM) val = shared[parseInt(vM[1], 10)] ?? '';
      } else if (type === 'inlineStr') {
        const isM = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        val = isM ? xmlDecode(isM[1].replace(/<[^>]+>/g, '')) : '';
      } else if (vM) {
        val = xmlDecode(vM[1]);
      }

      while (cells.length < ci) cells.push('');
      cells[ci] = val;
    }

    while (rows.length < rIdx) rows.push([]);
    rows[rIdx] = cells;
  }

  return rows;
}

/** Excel 日期序列号 → YYYY-MM-DD */
export function excelSerialToISO(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1 || v > 80000) return '';
  const ms = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const p2 = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/**
 * 从 workbook.xml + rels 里取出工作表清单（名称 + 对应的 xml 路径）。
 *
 * @param {string} wbXml     xl/workbook.xml
 * @param {string} relsXml   xl/_rels/workbook.xml.rels
 * @returns {{name:string, target:string}[]}  target 是相对 xl/ 的路径
 */
export function listSheets(wbXml, relsXml) {
  const relMap = new Map();

  for (const tag of (relsXml.match(/<Relationship\b[^>]*>/g) || [])) {
    const id = /Id="([^"]+)"/.exec(tag);
    const tgt = /Target="([^"]+)"/.exec(tag);
    if (id && tgt) relMap.set(id[1], tgt[1].replace(/^\/?(xl\/)?/, ''));
  }

  const out = [];
  for (const tag of (wbXml.match(/<sheet\b[^>]*>/g) || [])) {
    const nm = /name="([^"]*)"/.exec(tag);
    const rid = /r:id="([^"]+)"/.exec(tag);
    if (!nm || !rid) continue;
    const target = relMap.get(rid[1]);
    if (!target) continue;
    out.push({ name: xmlDecode(nm[1]), target });
  }
  return out;
}
