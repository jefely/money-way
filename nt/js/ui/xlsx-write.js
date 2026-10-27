// 界面：xlsx 打包（ZIP 写入）
/**
 * xlsx 打包
 * 层：第五层 · UI
 *
 * core/xlsx-write.js 出 XML，这里把它们装进 ZIP。
 *
 * 用 store（不压缩）：
 *   · 不需要 deflate 编码器（浏览器只有解码，没有编码）
 *   · xlsx 里本来就是重复度很低的 XML，压缩收益有限
 *   · 少一大段字节操作，出错面小
 *
 * ZIP 结构：
 *   每个文件 → 本地头(0x04034b50) + 数据
 *   末尾     → 中央目录(0x02014b50) × N + EOCD(0x06054b50)
 */

import { buildXlsxFiles } from '../core/xlsx-write.js';

/** CRC32 表（首次用到时建） */
let CRC_TABLE = null;

function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    t[i] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

function crc32(bytes) {
  const t = crcTable();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ t[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 把 {name, text} 列表打成 zip 字节流。
 * @param {{name:string, text:string}[]} files
 * @returns {Uint8Array}
 */
export function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];      // 本地头 + 数据
  const central = [];     // 中央目录项
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);

    // 本地文件头
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);          // version needed
    lv.setUint16(6, 0x0800, true);      // UTF-8 文件名
    lv.setUint16(8, 0, true);           // method = store
    lv.setUint16(10, 0, true);          // time
    lv.setUint16(12, 0x21, true);       // date（1980-01-01）
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    chunks.push(lh, data);

    // 中央目录项
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);          // method = store
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    central.push(ch);

    offset += lh.length + data.length;
  }

  const cdSize = central.reduce((a, b) => a + b.length, 0);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...chunks, ...central, eocd];
  const total = all.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

/**
 * 生成 xlsx 字节流。
 * @param {{name:string, rows:Array<Array<any>>}[]} sheets
 * @returns {Uint8Array}
 */
export function buildXlsx(sheets) {
  return zipStore(buildXlsxFiles(sheets));
}
