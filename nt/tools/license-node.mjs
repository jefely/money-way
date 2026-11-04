/**
 * 发行工具共用：参数、仓库边界、Ed25519 私钥读写。
 * 私钥只允许出现在仓库目录之外。
 */

import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export function repoRoot() {
  return resolve(fileURLToPath(new URL('../..', import.meta.url)));
}

export function isInsideRepo(target) {
  const abs = resolve(String(target || ''));
  const rel = relative(repoRoot(), abs);
  if (rel === '') return true;
  if (rel.startsWith('..') || rel.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(rel)) return false;
  return true;
}

export function assertOutsideRepo(target) {
  if (isInsideRepo(target)) {
    const err = new Error('拒绝把私钥写进仓库：' + resolve(target));
    err.code = 'INSIDE_REPO';
    throw err;
  }
}

export function defaultPrivPath() {
  return resolve(homedir(), '.nt-keys', 'nt-ed25519.pem');
}

export function parseArgs(argv) {
  const out = { _: [] };
  const list = argv || [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = list[i + 1];
    if (next == null || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

export function readPrivPem(fromCli) {
  const p = fromCli || process.env.NT_LICENSE_PRIV || '';
  if (!p) {
    throw new Error('请用 --priv 或环境变量 NT_LICENSE_PRIV 指向仓库外的私钥');
  }
  const abs = resolve(p);
  if (isInsideRepo(abs)) throw new Error('拒绝读取仓库内的私钥路径：' + abs);
  if (!existsSync(abs)) throw new Error('找不到私钥：' + abs);
  const pem = readFileSync(abs, 'utf8');
  if (!pem.includes('PRIVATE KEY')) throw new Error('这不是 PEM 私钥：' + abs);
  return { path: abs, pem };
}

export function publicRawFromPem(pem) {
  const pub = createPublicKey(createPrivateKey(pem));
  const der = pub.export({ type: 'spki', format: 'der' });
  return new Uint8Array(der.subarray(der.length - 32));
}

export function signRaw(pem, payload) {
  return new Uint8Array(sign(null, Buffer.from(payload), createPrivateKey(pem)));
}

export function rawToB64(raw) {
  return Buffer.from(raw).toString('base64');
}

export function replacePublicKeyConstant(text, b64) {
  if (String(b64).includes('PRIVATE')) throw new Error('拒绝把私钥写进公钥文件');
  const next = String(text).replace(
    /LICENSE_PUBLIC_KEY_B64 = '[^']*'/,
    "LICENSE_PUBLIC_KEY_B64 = '" + b64 + "'",
  );
  if (next === text) throw new Error('找不到 LICENSE_PUBLIC_KEY_B64');
  if (next.includes('PRIVATE KEY')) throw new Error('拒绝把私钥写进公钥文件');
  return next;
}

export function embeddedPublicB64() {
  const file = fileURLToPath(new URL('../js/core/license-pubkey.js', import.meta.url));
  const text = readFileSync(file, 'utf8');
  const m = text.match(/LICENSE_PUBLIC_KEY_B64 = '([^']*)'/);
  if (!m) throw new Error('读不到内嵌公钥');
  return m[1];
}

export function die(err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
