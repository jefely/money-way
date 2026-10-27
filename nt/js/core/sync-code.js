/**
 * 跨设备同步码与二维码载荷（纯函数）
 * 层：第一层 · 数据基座
 *
 * 两条通道：
 *   ① 同步码（文本）：LZ1:base64url(gzip(账本文本)) —— 微信/邮件发过去，粘回来
 *   ② 二维码：把「最近的流水」压成紧凑 JSON → gzip → 放进 URL 的 #m=
 *      对方用系统相机扫 → 打开网页 → 自动合并
 *
 * 为什么二维码只装最近的流水：一张二维码上限约 2953 字节，
 * 全量账本动辄几十 KB，装不下。所以按「截止日 + 天数」切片。
 *
 * 零依赖：压缩用浏览器原生的 CompressionStream（Node 18+ 也有）。
 */

import { ledgerToText } from './flow-text.js';
import { shortDate } from './format.js';

/** 一张二维码里最多塞多少字节（留出 URL 前缀的余量） */
export const QR_MAX_URL = 2600;
/** 默认每张二维码装多少笔 */
export const QR_PER_PART = 15;
/** 压缩后超过这个长度就别做二维码了 */
export const SYNC_MAX_RAW = 300000;

/* ---------- base64url ---------- */

export function bytesToB64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64ToBytes(b64) {
  const norm = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const pad = norm.length % 4 ? '='.repeat(4 - norm.length % 4) : '';
  const bin = atob(norm + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ---------- 压缩 ---------- */

/**
 * 文本 → 'LZ1:...'（gzip）或 'LZ0:...'（无压缩，老浏览器退回）
 * @param {string} text
 * @param {(b:Uint8Array)=>Promise<Uint8Array>} [gzipImpl] 测试时可注入
 */
export async function encodeSyncCode(text, gzipImpl) {
  const raw = String(text || '');
  if (raw.length > SYNC_MAX_RAW) throw new Error('账本太大，改用文本编辑页整体导出');

  const bytes = new TextEncoder().encode(raw);
  const gz = gzipImpl ? await gzipImpl(bytes) : await gzipBytes(bytes);
  if (!gz) return 'LZ0:' + bytesToB64(bytes);
  return 'LZ1:' + bytesToB64(gz);
}

/**
 * 'LZ1:...' / 'LZ0:...' → 文本
 * @param {string} code
 */
export async function decodeSyncCode(code) {
  const s = String(code || '').trim();
  const m = s.match(/^(LZ[01])[:：]\s*([\s\S]+)$/i);
  if (!m) throw new Error('格式不对：同步码应以 LZ1: 或 LZ0: 开头');
  const kind = m[1].toUpperCase();
  const bytes = b64ToBytes(m[2]);

  if (kind === 'LZ0') return new TextDecoder().decode(bytes);
  const out = await gunzipBytes(bytes);
  if (!out) throw new Error('这个浏览器不支持解压，请用新版 Chrome / Edge / Safari');
  return new TextDecoder().decode(out);
}

async function gzipBytes(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const cs = new CompressionStream('gzip');
    const w = cs.writable.getWriter();
    w.write(bytes);
    w.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) {
    return null;
  }
}

async function gunzipBytes(bytes) {
  if (typeof DecompressionStream !== 'function') return null;
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

/* ---------- 紧凑载荷 ---------- */

/** 金额去掉无意义的尾零：3.00 → 3、3.50 → 3.5 */
function trimAmount(v) {
  const s = String(v == null ? '' : v);
  if (!/^\d+(\.\d+)?$/.test(s)) return s;
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** 日期 → YYMMDD */
function ymdShort(dateStr) {
  const t = shortDate(dateStr).replace(/-/g, '');
  return /^\d{6}$/.test(t) ? t : '';
}

/**
 * 把一批流水压成紧凑 JSON。
 * @param {{accounts:Array, transactions:Array}} state
 * @param {Array} txs 要打包的流水
 * @param {[number,number]|null} part 分片序号（第几片 / 共几片）
 */
export function packPayload(state, txs, part) {
  const byId = new Map();
  for (const a of state.accounts || []) byId.set(a.id, a);

  const codeMap = new Map();   // 简码 → 名字
  const nameOf = (id) => {
    const a = byId.get(id);
    return a ? a.name : '';
  };
  const codeOf = (id) => {
    const a = byId.get(id);
    return a ? (a.code || a.name) : '';
  };

  const lines = (txs || []).map((t) => {
    const from = codeOf(t.from_id);
    const to = codeOf(t.to_id);
    if (from && !codeMap.has(from)) codeMap.set(from, nameOf(t.from_id));
    if (to && !codeMap.has(to)) codeMap.set(to, nameOf(t.to_id));
    const note = String(t.note || '').replace(/[\r\n]+/g, ' ').slice(0, 16);
    return [ymdShort(t.date), from, to, trimAmount(t.amount), note].join(',');
  });

  const dates = (txs || []).map((t) => String(t.date || '')).filter(Boolean).sort();
  return {
    v: 3,
    u: dates.length ? dates[dates.length - 1] : '',
    p: part || null,
    a: [...codeMap.entries()],
    t: lines.join('\n'),
  };
}

/**
 * 解包：紧凑 JSON → 通用流水行（名字已在 a 表里换好）
 * @param {object} payload
 */
export function unpackPayload(payload) {
  const p = payload || {};
  const rows = String(p.t || '').split('\n').filter((l) => l.trim());
  const out = [];
  for (const line of rows) {
    const c = line.split(',');
    if (c.length < 4) continue;
    const d = c[0].trim();
    if (!/^\d{6}$/.test(d)) continue;
    const y = 2000 + Number(d.slice(0, 2));
    const m = Number(d.slice(2, 4));
    const day = Number(d.slice(4, 6));
    if (!(m >= 1 && m <= 12) || !(day >= 1 && day <= 31)) continue;
    out.push({
      date: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      from: c[1] || '',
      to: c[2] || '',
      amount: Number(c[3]) || 0,
      note: c.slice(4).join(' ') || '',
    });
  }
  return {
    until: p.u || '',
    part: p.p || null,
    accounts: Array.isArray(p.a) ? p.a : [],
    rows: out,
  };
}

/* ---------- 二维码 ---------- */

/**
 * 把最近的流水切成若干张二维码。
 *
 * @param {object} state
 * @param {{base?:string, until?:string, days?:number, per?:number}} opts
 * @returns {Promise<{parts:Array, total:number, tooDense?:boolean}>}
 */
export async function packForQr(state, opts) {
  const o = opts || {};
  const base = String(o.base || '');
  const until = String(o.until || '');
  const days = Number(o.days) || 0;
  const per = Math.max(3, Math.min(200, Number(o.per) || QR_PER_PART));

  // 时间窗
  let from = '';
  if (until && days > 0) {
    const d = new Date(until + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() - (days - 1));
      from = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
        + '-' + String(d.getDate()).padStart(2, '0');
    }
  }

  const picked = (state.transactions || [])
    .filter((t) => {
      const d = String(t.date || '');
      if (!d || t.opening) return false;
      if (until && d > until) return false;
      if (from && d < from) return false;
      return true;
    })
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  if (!picked.length) return { parts: [], total: 0 };

  const chunks = [];
  for (let i = 0; i < picked.length; i += per) chunks.push(picked.slice(i, i + per));

  const parts = [];
  for (let i = 0; i < chunks.length; i++) {
    const payload = packPayload(state, chunks[i], [i + 1, chunks.length]);
    const code = await encodeSyncCode(JSON.stringify(payload));
    const url = base + '#m=' + (code.slice(4));
    if (url.length > QR_MAX_URL) {
      return { parts: [], total: picked.length, tooDense: true, per, from };
    }
    parts.push({
      url,
      len: url.length,
      count: chunks[i].length,
      until: payload.u,
      part: [i + 1, chunks.length],
    });
  }
  return { parts, total: picked.length, from };
}

/**
 * 从 URL hash（#m=...）里取出合并载荷。
 * @param {string} hash 形如 '#m=LZ1xxxx' 或 'm=LZ1xxxx'
 */
export async function unpackFromHash(hash) {
  const h = String(hash || '');
  const m = h.match(/[#&]?m=([A-Za-z0-9_\-]+)/);
  if (!m) return null;
  const text = await decodeSyncCode('LZ1:' + m[1]);
  return unpackPayload(JSON.parse(text));
}

/** 同步码的「全量账本」版本（跟二维码无关，走文本通道） */
export function ledgerSyncText(state) {
  return ledgerToText(state);
}
