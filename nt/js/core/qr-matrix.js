/**
 * QR 矩阵构造（纯函数）
 * 层：第一层 · 数据基座
 *
 * 定位图形、对齐图形、时序线、格式信息、8 种掩码与惩罚评分。
 * 入口 qrBuildMatrix() 给出「未选掩码」的矩阵，掩码在 qr-encode.js 里择优。
 */

export function qrAlignPositions(ver) {
  if (ver === 1) return [];
  const size = ver * 4 + 17;
  const posCount = Math.floor(ver / 7) + 2;
  const intervals = posCount - 1;
  // 间距必须是偶数、从 size-7 往回排：v16 是 6/26/50/74，不是 6/30/52/74
  const intervalSize = Math.ceil((size - 13) / (intervals * 2)) * 2;
  const out = [6];
  for (let i = 1; i < posCount - 1; i++) out.push(size - 7 - intervalSize * (posCount - 1 - i));
  out.push(size - 7);
  return out;
}
export const QR_MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r * c) % 3 + (r + c) % 2) % 2 === 0
];
export function qrFormatBits(mask) {
  const d = (1 << 3) | mask;                    // L 级两位是 01
  let rem = d;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((d << 10) | rem) ^ 0x5412;
}
export function qrVersionBits(ver) {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
  return (ver << 12) | rem;
}
export function qrBuildMatrix(codewords, ver) {
  const size = ver * 4 + 17;
  const m = new Uint8Array(size * size);
  const fixed = new Uint8Array(size * size);
  const set = (r, c, dark) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    m[r * size + c] = dark ? 1 : 0;
    fixed[r * size + c] = 1;
  };
  const placeFinder = (row, col) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const on = (r >= 0 && r <= 6 && (c === 0 || c === 6))
          || (c >= 0 && c <= 6 && (r === 0 || r === 6))
          || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        set(rr, cc, on);
      }
    }
  };
  placeFinder(0, 0); placeFinder(size - 7, 0); placeFinder(0, size - 7);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const pos = qrAlignPositions(ver);
  for (const r of pos) {
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  // 格式信息 15 位 × 2 组（避开 timing 的 (8,6)/(6,8)）
  for (let i = 0; i < 9; i++) {
    if (i !== 6) set(8, i, false);
    if (i !== 6) set(i, 8, false);
  }
  for (let i = 0; i < 8; i++) set(8, size - 1 - i, false);
  for (let i = 0; i < 7; i++) set(size - 1 - i, 8, false);
  // dark module：固定在 (size-8, 8)，漏了它数据位会整体错一位
  set(size - 8, 8, true);
  if (ver >= 7) {
    for (let i = 0; i < 18; i++) {
      set(Math.floor(i / 3), size - 11 + (i % 3), false);
      set(size - 11 + (i % 3), Math.floor(i / 3), false);
    }
  }
  let bitIdx = 0, row = size - 1, inc = -1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        const at = row * size + cc;
        if (fixed[at]) continue;
        let dark = false;
        if (bitIdx < codewords.length * 8) dark = ((codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
        bitIdx++;
        m[at] = dark ? 1 : 0;
      }
      row += inc;
      if (row < 0 || row >= size) { row -= inc; inc = -inc; break; }
    }
  }
  return { m, fixed, size };
}
export function qrApplyMask(m, fixed, size, mask) {
  const fn = QR_MASKS[mask];
  const out = m.slice();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      if (!fixed[i] && fn(r, c)) out[i] ^= 1;
    }
  }
  return out;
}
export function qrWriteFormat(m, size, mask, ver) {
  const bits = qrFormatBits(mask);
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;
    const set = (r, c) => { m[r * size + c] = dark ? 1 : 0; };
    if (i < 6) set(i, 8);
    else if (i < 8) set(i + 1, 8);
    else set(size - 15 + i, 8);
    if (i < 8) set(8, size - 1 - i);
    else if (i < 9) set(8, 15 - i);
    else set(8, 15 - i - 1);
  }
  if (ver >= 7) {
    const vb = qrVersionBits(ver);
    for (let i = 0; i < 18; i++) {
      const v = ((vb >> i) & 1) === 1 ? 1 : 0;
      m[Math.floor(i / 3) * size + (size - 11 + (i % 3))] = v;
      m[(size - 11 + (i % 3)) * size + Math.floor(i / 3)] = v;
    }
  }
}
export function qrPenalty(m, size) {
  let score = 0;
  const lines = [];
  for (let r = 0; r < size; r++) lines.push(Array.from(m.subarray(r * size, (r + 1) * size)));
  for (let c = 0; c < size; c++) {
    const col = new Array(size);
    for (let r = 0; r < size; r++) col[r] = m[r * size + c];
    lines.push(col);
  }
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i < size; i++) {
      if (line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r * size + c];
      if (v === m[r * size + c + 1] && v === m[(r + 1) * size + c] && v === m[(r + 1) * size + c + 1]) score += 3;
    }
  }
  const pat = [1, 0, 1, 1, 1, 0, 1];
  for (const line of lines) {
    for (let i = 0; i <= size - 7; i++) {
      let ok = true;
      for (let k = 0; k < 7; k++) if (line[i + k] !== pat[k]) { ok = false; break; }
      if (!ok) continue;
      const before = line.slice(Math.max(0, i - 4), i);
      const after = line.slice(i + 7, Math.min(size, i + 11));
      if ((before.length === 4 && before.every(v => v === 0))
        || (after.length === 4 && after.every(v => v === 0))) score += 40;
    }
  }
  let dark = 0;
  for (let i = 0; i < m.length; i++) dark += m[i];
  score += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
  return score;
}
