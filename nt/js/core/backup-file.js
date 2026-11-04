// 界面：（无界面）加密备份文件格式
/**
 * 加密备份信封
 * 层：第一层 · 数据基座
 *
 * 文件是 JSON，里面只有盐、IV、密文。没有密码。
 * 换手机时用账本密码派生同一把钥匙解开。
 * .lz 快照是压缩明文，不适合丢进网盘；这个格式才是备份。
 */

export function packBackup(parts) {
  const p = parts || {};
  return JSON.stringify({
    kind: 'nt-backup',
    v: 1,
    salt: String(p.salt || ''),
    iv: String(p.iv || ''),
    ciphertext: String(p.ciphertext || ''),
    updatedAt: String(p.updatedAt || ''),
  });
}

/** @returns {{salt:string, iv:string, ciphertext:string, updatedAt:string}} */
export function unpackBackup(text) {
  let o = null;
  try {
    o = JSON.parse(String(text || ''));
  } catch (e) {
    throw new Error('备份文件不是 JSON');
  }
  if (!o || o.kind !== 'nt-backup' || !o.salt || !o.iv || !o.ciphertext) {
    throw new Error('不是 NT 加密备份');
  }
  return {
    salt: String(o.salt),
    iv: String(o.iv),
    ciphertext: String(o.ciphertext),
    updatedAt: String(o.updatedAt || ''),
  };
}

export function isBackupText(text) {
  const s = String(text || '').trim();
  if (!s.startsWith('{')) return false;
  return s.includes('"nt-backup"');
}
