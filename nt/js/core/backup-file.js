// 界面：（无界面）加密备份文件格式
/**
 * 加密备份信封
 * 层：第一层 · 数据基座
 *
 * 给人看的是纯文本，头一行是 -----NT账本加密备份-----。
 * 里面只有盐、IV、密文，没有密码。换行、空格、BOM 和全角冒号都不影响还原。
 * 旧的 JSON（kind: nt-backup）仍能导入。
 */

const HEAD = '-----NT账本加密备份-----';
const TAIL = '-----结束-----';

function wrap64(text) {
  const s = String(text || '');
  const out = [];
  for (let i = 0; i < s.length; i += 64) out.push(s.slice(i, i + 64));
  return out.join('\n');
}

/** 装甲文本。微信里换行被拆开也能再拼回来。 */
export function packBackup(parts) {
  const p = parts || {};
  const lines = [
    HEAD,
    '版本: 1',
    '盐: ' + String(p.salt || ''),
    'IV: ' + String(p.iv || ''),
  ];
  if (p.updatedAt) lines.push('时间: ' + String(p.updatedAt));
  lines.push('密文:');
  lines.push(wrap64(p.ciphertext));
  lines.push(TAIL);
  return lines.join('\n') + '\n';
}

/** 导出文件名：NT账本-加密备份-YYMMDD.txt */
export function backupFileName(now) {
  const d = now instanceof Date ? now : new Date();
  const p = (n) => String(n).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `NT账本-加密备份-${yy}${p(d.getMonth() + 1)}${p(d.getDate())}.txt`;
}

function normalized(text) {
  return String(text == null ? '' : text)
    .replace(/^\uFEFF/, '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\r\n|\r|\u2028|\u2029/g, '\n');
}

function flattened(text) {
  return normalized(text).replace(/\s+/g, '').replace(/：/g, ':');
}

export function isBackupText(text) {
  const flat = flattened(text);
  if (flat.includes(HEAD)) return true;
  const t = normalized(text).trim();
  return t.startsWith('{') && t.includes('"nt-backup"');
}

function between(flat, key, nextKeys) {
  const i = flat.indexOf(key);
  if (i < 0) return '';
  const from = i + key.length;
  let to = flat.length;
  for (const n of nextKeys) {
    const j = flat.indexOf(n, from);
    if (j >= 0 && j < to) to = j;
  }
  return flat.slice(from, to);
}

function unpackArmored(text) {
  const flat = flattened(text);
  const salt = between(flat, '盐:', ['IV:']);
  const iv = between(flat, 'IV:', ['时间:', '密文:']);
  const updatedAt = between(flat, '时间:', ['密文:']);
  const ciphertext = between(flat, '密文:', [TAIL]);
  if (!salt || !iv || !ciphertext) throw new Error('不是 NT 加密备份');
  return { salt, iv, ciphertext, updatedAt };
}

function unpackJson(text) {
  const s = normalized(text).trim();
  if (!s.startsWith('{')) return null;
  let o = null;
  try {
    o = JSON.parse(s);
  } catch (e) {
    return null;
  }
  if (!o || o.kind !== 'nt-backup') return null;
  if (!o.salt || !o.iv || !o.ciphertext) throw new Error('不是 NT 加密备份');
  return {
    salt: String(o.salt),
    iv: String(o.iv),
    ciphertext: String(o.ciphertext),
    updatedAt: String(o.updatedAt || ''),
  };
}

/** @returns {{salt:string, iv:string, ciphertext:string, updatedAt:string}} */
export function unpackBackup(text) {
  if (flattened(text).includes(HEAD)) return unpackArmored(text);
  const json = unpackJson(text);
  if (json) return json;
  throw new Error('不是 NT 加密备份');
}
