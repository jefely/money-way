// 界面：xlsx 读取（ZIP 展开）
/**
 * xlsx 读取
 * 层：第五层 · UI
 *
 * 这一层只负责「把 ZIP 拆开」，XML 解析在 core/xlsx-xml.js。
 * 分开的理由：解压要用浏览器原生的 DecompressionStream 和 TextDecoder，
 * core 层必须保持 Node 可跑的纯函数。
 *
 * ZIP 结构（只读中央目录，够用）：
 *   EOCD(0x06054b50) → 中央目录项(0x02014b50) → 本地文件头(0x04034b50) → 数据
 *   method 0 = store（直接复制），method 8 = deflate（浏览器解压）
 */

import {
  parseSharedStrings, parseSheetRows, listSheets,
} from '../core/xlsx-xml.js';
import { parseCsv, tidyRows } from '../core/csv.js';

/** 浏览器原生解压 deflate-raw */
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('这个浏览器不支持解压，请用新版 Chrome / Edge');
  }
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/**
 * 读 ZIP → Map<文件名, Uint8Array>
 * @param {ArrayBuffer|Uint8Array} buf
 */
export async function unzipArchive(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dec = new TextDecoder('utf-8');

  // 找中央目录结尾：从尾部往前扫（注释最长 65535）
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i -= 1) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 xlsx（找不到 ZIP 目录）');

  const count = u16(b, eocd + 10);
  let off = u32(b, eocd + 16);
  const files = new Map();

  for (let n = 0; n < count; n += 1) {
    if (b[off] !== 0x50 || b[off + 1] !== 0x4b || b[off + 2] !== 0x01 || b[off + 3] !== 0x02) break;

    const method = u16(b, off + 10);
    const compSize = u32(b, off + 20);
    const nameLen = u16(b, off + 28);
    const extraLen = u16(b, off + 30);
    const commentLen = u16(b, off + 32);
    const localOff = u32(b, off + 42);
    const name = dec.decode(b.subarray(off + 46, off + 46 + nameLen));

    // 本地文件头的「文件名/扩展长度」可能和中央目录不同，以本地为准
    const lNameLen = u16(b, localOff + 26);
    const lExtraLen = u16(b, localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;

    files.set(name, { method, raw: b.subarray(dataStart, dataStart + compSize) });
    off += 46 + nameLen + extraLen + commentLen;
  }

  const out = new Map();
  for (const [name, f] of files) {
    if (name.endsWith('/')) continue;
    if (f.method === 0) out.set(name, f.raw);
    else if (f.method === 8) out.set(name, await inflateRaw(f.raw));
    else throw new Error(`xlsx 里有不支持的压缩方式：${f.method}`);
  }
  return out;
}

/**
 * 读 xlsx → { sheets: [{ name, rows }] }
 * @param {ArrayBuffer|Uint8Array} buf
 */
export async function readXlsx(buf) {
  const files = await unzipArchive(buf);
  const dec = new TextDecoder('utf-8');
  const getXml = (n) => (files.has(n) ? dec.decode(files.get(n)) : '');

  const shared = parseSharedStrings(getXml('xl/sharedStrings.xml'));
  const list = listSheets(getXml('xl/workbook.xml'), getXml('xl/_rels/workbook.xml.rels'));

  const sheets = [];
  for (const s of list) {
    const path = files.has(`xl/${s.target}`) ? `xl/${s.target}`
      : (files.has(s.target) ? s.target : null);
    if (!path) continue;
    sheets.push({ name: s.name, rows: parseSheetRows(dec.decode(files.get(path)), shared) });
  }

  if (!sheets.length) throw new Error('这个 xlsx 里没有可读的工作表');
  return { sheets };
}

/**
 * 读用户选的文件：按扩展名分派。
 * @param {File} file
 * @returns {Promise<{sheets:{name:string,rows:string[][]}[]}>}
 */
export async function readAnyTable(file) {
  const name = String(file.name || '').toLowerCase();

  if (/\.xlsx?$/i.test(name)) {
    return readXlsx(await file.arrayBuffer());
  }

  const text = await file.text();
  // .csv / .txt / 无扩展名：按 CSV 解析成一张表
  return { sheets: [{ name: file.name || '导入', rows: tidyRows(parseCsv(text)) }] };
}
