/**
 * QR 里用到的有限域与纠错（纯函数）
 * 层：第一层 · 数据基座
 *
 * 从单文件版 personal/index.html 抽出来的 QR 编码器，只保留「数学部分」：
 * GF(256) 乘法、Reed-Solomon 纠错、数据码字拼装、交织。
 * 画图不在这里（见 ui/qr-canvas.js），矩阵构造在 qr-matrix.js。
 */

/* GF(256)：本原多项式 0x11d */
const QR_GF_EXP = new Uint8Array(512);
const QR_GF_LOG = new Uint8Array(256);
(function initQRGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    QR_GF_EXP[i] = x;
    QR_GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) QR_GF_EXP[i] = QR_GF_EXP[i - 255];
})();

export function qrGmul(a, b) {
  if (!a || !b) return 0;
  return QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]];
}
// 纠错块表（L 级）：[每块纠错码字, 块数1, 数据码字1, 块数2, 数据码字2]
export const QR_RS_L = [
  [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0],
  [26, 1, 108, 0, 0], [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0],
  [30, 2, 116, 0, 0], [18, 2, 68, 2, 69], [20, 4, 81, 0, 0], [24, 2, 92, 2, 93],
  [26, 4, 107, 0, 0], [30, 3, 115, 1, 116], [22, 5, 87, 1, 88], [24, 5, 98, 1, 99],
  [28, 1, 107, 5, 108], [30, 5, 120, 1, 121], [28, 3, 113, 4, 114], [28, 3, 107, 5, 108],
  [28, 4, 116, 4, 117], [28, 2, 111, 7, 112], [30, 4, 121, 5, 122], [30, 6, 117, 4, 118],
  [26, 8, 106, 4, 107], [28, 10, 114, 2, 115], [30, 8, 122, 4, 123], [30, 3, 117, 10, 118],
  [30, 7, 116, 7, 117], [30, 5, 115, 10, 116], [30, 13, 115, 3, 116], [30, 17, 115, 0, 0],
  [30, 17, 115, 1, 116], [30, 13, 115, 6, 116], [30, 12, 121, 7, 122], [30, 6, 121, 14, 122],
  [30, 17, 122, 4, 123], [30, 4, 122, 18, 123], [30, 20, 117, 4, 118], [30, 19, 118, 6, 119]
];
export function qrDataCodewords(ver) {
  const r = QR_RS_L[ver - 1];
  return r[1] * r[2] + r[3] * r[4];
}
export function qrLengthBits(ver) { return ver < 10 ? 8 : 16; }
export function qrCapacityBytes(ver) {
  return Math.floor((qrDataCodewords(ver) * 8 - 4 - qrLengthBits(ver)) / 8);
}
export function qrPickVersion(nbytes) {
  for (let v = 1; v <= 40; v++) if (nbytes <= qrCapacityBytes(v)) return v;
  return -1;
}
export function qrGenPoly(deg) {
  let g = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= qrGmul(g[j], QR_GF_EXP[i]);
    }
    g = next;
  }
  return g;
}
function qrRsEncode(data, ecLen) {
  const gen = qrGenPoly(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift(); res.push(0);
    if (factor) for (let i = 0; i < ecLen; i++) res[i] ^= qrGmul(gen[i + 1], factor);
  }
  return res;
}
export function qrBuildData(bytes, ver) {
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(4, 4);                                   // 0100 = 字节模式
  push(bytes.length, qrLengthBits(ver));
  for (const b of bytes) push(b, 8);
  const total = qrDataCodewords(ver);
  for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] || 0);
    cw.push(v);
  }
  let pad = 0xEC;
  while (cw.length < total) { cw.push(pad); pad = pad === 0xEC ? 0x11 : 0xEC; }
  return cw;
}
export function qrInterleave(dataCw, ver) {
  const [ec, n1, d1, n2, d2] = QR_RS_L[ver - 1];
  const blocks = [];
  let idx = 0;
  for (let i = 0; i < n1; i++) { blocks.push({ d: dataCw.slice(idx, idx + d1) }); idx += d1; }
  for (let i = 0; i < n2; i++) { blocks.push({ d: dataCw.slice(idx, idx + d2) }); idx += d2; }
  for (const b of blocks) b.e = qrRsEncode(b.d, ec);
  const out = [];
  const maxD = Math.max(...blocks.map(b => b.d.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}
