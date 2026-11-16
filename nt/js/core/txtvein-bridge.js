// TxtVein ↔ NT账本 文本桥
//
// NT 不再单独维护一套「账户 / 流水」明文格式；明文统一用 TxtVein 单 TXT：
//
//   ## 统计
//   ## 流水
//   260801 ZHC > CY 35.00
//   ## 行为
//   ## 备注
//   ## 字典
//   [会计]
//   node P 资产 fluid ZHC zhc 招行储 | 招行储 100
//
// 这一层只做纯文本 ↔ state，不碰 DOM/存储。
// 密文由 TxtVein 的信封负责（见 ui/export-dialog.js）。

import {
  ACCOUNT_TYPE, ALL_ACCOUNT_TYPES, isPosted,
} from './schema.js';
import {
  createState, addAccount, addTransaction,
} from './state-store.js';

const TYPE_TO_TV = {
  [ACCOUNT_TYPE.ASSET]: '资产',
  [ACCOUNT_TYPE.LIABILITY]: '负债',
  [ACCOUNT_TYPE.EQUITY]: '权益',
  [ACCOUNT_TYPE.INCOME]: '收入',
  [ACCOUNT_TYPE.EXPENSE]: '费用',
  [ACCOUNT_TYPE.COST]: '成本',
};
const TV_TO_TYPE = {
  资产: ACCOUNT_TYPE.ASSET,
  负债: ACCOUNT_TYPE.LIABILITY,
  权益: ACCOUNT_TYPE.EQUITY,
  收入: ACCOUNT_TYPE.INCOME,
  费用: ACCOUNT_TYPE.EXPENSE,
  成本: ACCOUNT_TYPE.COST,
};

function S(v) { return String(v == null ? '' : v); }
function norm(s) { return S(s).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); }
function amount2(v) { const n = Number(v); return (Number.isFinite(n) ? n : 0).toFixed(2); }
function ymd(iso) {
  const d = S(iso).replace(/[^0-9]/g, '');
  if (d.length >= 8) return d.slice(-6);
  if (d.length === 6) return d;
  return '';
}
function isoDate(short) {
  const d = S(short).replace(/[^0-9]/g, '');
  if (d.length !== 6) return '';
  return '20' + d.slice(0, 2) + '-' + d.slice(2, 4) + '-' + d.slice(4, 6);
}

/**
 * state → TxtVein 单 TXT（明文）
 * @returns {{singleText:string, dictText:string, ledgerText:string,
 *            stats:{accounts:number,transactions:number,groups:number}}}
 */
export function toTxtVein(state) {
  const src = state || {};
  const accounts = (src.accounts || []).filter((a) => a && a.id);
  const codeMap = new Map();
  const used = new Set();
  const groups = new Map();

  function codeOf(a) {
    if (codeMap.has(a.id)) return codeMap.get(a.id);
    let c = S(a.code || a.name || 'A').replace(/\s+/g, '').toUpperCase() || 'A';
    if (used.has(c)) {
      let i = 2;
      while (used.has(c + i)) i += 1;
      c += i;
    }
    used.add(c);
    codeMap.set(a.id, c);
    return c;
  }

  const dict = ['[会计]'];
  const groupRows = [];
  accounts.forEach((a) => {
    if (a.id === '__OPENING__') return;
    const type = TYPE_TO_TV[a.type] || a.type || '资产';
    const cat = S(a.category || a.type || '未分类') || '未分类';
    const gkey = type + '\u0000' + cat;
    if (!groups.has(gkey)) {
      const gcode = 'g' + (groups.size + 1);
      groups.set(gkey, { code: gcode, name: cat, type });
      const gform = type === '费用' ? 'steam' : (type === '资产' || type === '成本' ? 'fluid' : 'outside');
      groupRows.push('node P ' + type + ' ' + gform + ' ' + gcode + ' ' + gcode
        + ' ' + cat + ' | ' + cat + ' 100');
    }
    const g = groups.get(gkey);
    const c = codeOf(a);
    const form = (type === '资产' || type === '成本') ? 'fluid' : (type === '费用' ? 'steam' : 'outside');
    dict.push('node P ' + type + ' ' + form + ' ' + c + ' ' + c.toLowerCase()
      + ' ' + (a.name || c) + ' | ' + (a.name || c) + ' 100 @' + g.code);
  });

  // 期初虚拟账户：只有存在期初流水时才建
  const hasOpening = (src.transactions || []).some((t) => t && t.opening);
  if (hasOpening) {
    dict.push('node P 权益 outside OPENING opening 期初权益 | Opening Equity 100');
    codeMap.set('__OPENING__', 'OPENING');
  }

  const ledger = [];
  (src.transactions || []).forEach((t) => {
    if (!t || !isPosted(t)) return;
    const from = codeMap.get(t.from_id) || (t.from_id === '__OPENING__' ? 'OPENING' : '');
    const to = codeMap.get(t.to_id) || (t.to_id === '__OPENING__' ? 'OPENING' : '');
    if (!from || !to) return;
    ledger.push(ymd(t.date) + ' ' + from + ' > ' + to + ' ' + amount2(t.amount));
  });

  const dictText = groupRows.concat(dict.slice(1)).join('\n') + '\n';
  const ledgerText = ledger.join('\n') + (ledger.length ? '\n' : '');
  const singleText = ['## 统计', '## 流水', ledgerText,
    '## 行为', '## 备注', '## 字典', dictText].join('\n');
  return {
    singleText,
    dictText: '[会计]\n' + dictText,
    ledgerText,
    stats: {
      accounts: accounts.filter((a) => a.id !== '__OPENING__').length,
      transactions: ledger.length,
      groups: groups.size,
    },
  };
}

/**
 * TxtVein 单 TXT（明文字典/流水）→ NT state。
 * @returns {{ok:boolean,state:object,stats:object,errors:Array}}
 */
export function fromTxtVein(text) {  const raw = norm(text);
  const lines = raw.split('\n');
  const dict = [];
  const ledger = [];
  let sec = '';
  lines.forEach((line) => {
    const m = line.match(/^##\s*(统计|流水|行为|备注|字典)\s*$/);
    if (m) { sec = m[1]; return; }
    if (sec === '字典') dict.push(line);
    else if (sec === '流水') ledger.push(line);
  });
  if (!dict.length || !ledger.length) {
    return { ok: false, state: null, stats: {}, errors: [{ message: '缺 ## 字典 或 ## 流水 段' }] };
  }

  const nodes = new Map();
  const errors = [];
  dict.forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('[')) return;
    if (!/^node\b/i.test(t)) return;
    const body = t.replace(/^node\s+/i, '');
    const pipe = body.indexOf('|');
    const left = (pipe >= 0 ? body.slice(0, pipe) : body).trim().split(/\s+/);
    if (left.length < 6) return;
    const domain = left[0];
    const type = left[1];
    const zhCode = left[3];
    const enCode = left[4];
    const name = left.slice(5).join(' ');
    const parent = (body.match(/(?:^|\s)@([^\s]+)/) || [])[1] || '';
    if (!zhCode) return;
    if (!nodes.has(zhCode)) {
      nodes.set(zhCode, { code: zhCode, enCode, type, name, parent, children: 0 });
    }
  });
  nodes.forEach((n) => {
    if (n.parent && nodes.has(n.parent)) nodes.get(n.parent).children += 1;
  });

  let s = createState();
  const idByCode = new Map();
  nodes.forEach((n) => {
    if (n.children > 0) return; // 组节点不是 NT 账户
    const type = TV_TO_TYPE[n.type] || ACCOUNT_TYPE.ASSET;
    if (n.name.indexOf('期初权益') >= 0 || n.code === 'OPENING') {
      idByCode.set(n.code, '__OPENING__');
      return;
    }
    const category = n.parent && nodes.has(n.parent) ? nodes.get(n.parent).name : '';
    const before = s.accounts.length;
    s = addAccount(s, {
      code: n.code, name: n.name, type, category,
    });
    const acc = s.accounts[s.accounts.length - 1];
    if (s.accounts.length > before && acc) idByCode.set(n.code, acc.id);
  });

  let txCount = 0;
  ledger.forEach((line, idx) => {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('#')) return;
    const m = t.match(/^([A-Za-z]?)(\d{6})\s+(\S+)\s*>\s*(\S+)\s+([0-9]+(?:\.[0-9]+)?)/);
    if (!m) {
      if (t) errors.push({ line: idx + 1, message: '认不出流水行：' + t });
      return;
    }
    const date = isoDate(m[2]);
    const from = idByCode.get(m[3].replace(/:.*$/, '')) || m[3];
    const to = idByCode.get(m[4].replace(/:.*$/, '')) || m[4];
    if (!from || !to || from === to) {
      errors.push({ line: idx + 1, message: '流水账户认不出：' + m[3] + ' / ' + m[4] });
      return;
    }
    s = addTransaction(s, {
      date, from_id: from, to_id: to, amount: Number(m[5]),
      note: '', opening: from === '__OPENING__' || to === '__OPENING__',
    });
    txCount += 1;
  });

  return {
    ok: errors.length === 0,
    state: s,
    stats: { accounts: s.accounts.filter((a) => a.id !== '__OPENING__').length, transactions: txCount, errors: errors.length },
    errors,
  };
}

/* ---------- 可粘贴 bundle / TxtVein 密文装甲 ---------- */

const BUNDLE_HEAD = '# [TXTVEIN_BUNDLE: 1]';
const BUNDLE_END = '# [/BUNDLE]';
const FILE_END = '# [/FILE]';
const FILE_RE = /^#\s*\[FILE:\s*(.+?)\]\s*$/;
const BEGIN_RE = /^#\s*\[SECURE_START:\s*([A-Za-z0-9_-]+)\s*,\s*([A-Za-z0-9-]+)\s*\]\s*$/i;
const END_RE = /^#\s*\[SECURE_END\]\s*$/i;

export function packBundle(files, mode) {
  const lines = [BUNDLE_HEAD, '# MODE: ' + String(mode || 'deep')];
  (files || []).forEach((f) => {
    lines.push('# [FILE: ' + (f.name || 'file') + ']');
    lines.push(String(f.text || '').replace(/\s+$/, ''));
    lines.push(FILE_END);
  });
  lines.push(BUNDLE_END);
  return lines.join('\n') + '\n';
}

export function unpackBundle(text) {
  const lines = norm(text).split('\n');
  const hi = lines.findIndex((l) => l.trim() === BUNDLE_HEAD);
  if (hi < 0) return null;
  let mode = '';
  const files = [];
  let cur = null;
  for (let i = hi + 1; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (t === BUNDLE_END) break;
    const mm = t.match(/^#\s*MODE:\s*(.+)$/i);
    if (mm) { mode = mm[1].trim(); continue; }
    const fm = t.match(FILE_RE);
    if (fm) { cur = { name: fm[1].trim(), lines: [] }; continue; }
    if (t === FILE_END) {
      if (cur) { files.push({ name: cur.name, text: cur.lines.join('\n') + '\n' }); cur = null; }
      continue;
    }
    if (cur) cur.lines.push(lines[i]);
  }
  return { mode, files };
}

function wrap64(b64) {
  const s = String(b64 || '');
  const out = [];
  for (let i = 0; i < s.length; i += 64) out.push(s.slice(i, i + 64));
  return out.join('\n');
}

export function packSecure(kind, parts, cipherB64) {
  const p = parts || {};
  return [
    '# TxtVein ' + kind + ' (encrypted)',
    '# FORMAT: 1',
    '# VAULT_ID: ' + String(p.vaultId || ''),
    '# KIND: ' + kind,
    '# CIPHER: AES-GCM-256',
    '# ITER: ' + (Number(p.iterations) || 150000),
    '# SALT: ' + String(p.salt || ''),
    '# IV: ' + String(p.iv || ''),
    '# [SECURE_START: P, AES-GCM-256]',
    wrap64(cipherB64),
    '# [SECURE_END]',
  ].join('\n') + '\n';
}

export function extractSecure(src) {
  const lines = norm(src).split('\n');
  let begin = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (BEGIN_RE.test(lines[i].trim())) begin = i;
    if (END_RE.test(lines[i].trim()) && begin >= 0) { end = i; break; }
  }
  if (begin < 0 || end < 0) throw new Error('不是完整的 TxtVein 密文');
  const header = {};
  lines.slice(0, begin).forEach((line) => {
    const m = line.match(/^#\s*([A-Za-z_]+)\s*:\s*(.*)$/);
    if (m) header[m[1].toUpperCase()] = m[2].trim();
  });
  const body = lines.slice(begin + 1, end).join('').replace(/\s+/g, '');
  return {
    kind: String(header.KIND || '').toLowerCase(),
    salt: String(header.SALT || ''),
    iv: String(header.IV || ''),
    iterations: Number(header.ITER) || 150000,
    ciphertext: body,
  };
}

