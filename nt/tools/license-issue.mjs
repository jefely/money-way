/**
 * 用仓库外的私钥签发一枚激活码，打印到标准输出。
 *
 *   node nt/tools/license-issue.mjs --priv ~/.nt-keys/nt-ed25519.pem \
 *     --user alice@example.com --tier pro --days 365 --seats 3
 *
 * --user 会原样写进激活码（能被解开看到）。不想暴露邮箱就自己先做哈希再传入。
 * --tier  free | plus | pro
 * --features  report.advanced,chart.ringExport   不写则按档位给
 * --days N   或 --expiry 2027-01-01；都不写表示长期
 * --seats N  默认 3，0 表示不限制设备
 * --seal-file  16 字节密封钥。不写就用开发密封钥（源码里是公开的）。
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodePayload, finishCode } from '../js/core/license-codec.js';
import { DEV_SEAL } from '../js/core/license-seal.js';
import { FEATURES } from '../js/core/license-policy.js';
import { die, isInsideRepo, parseArgs, readPrivPem, signRaw } from './license-node.mjs';

const TIER = { free: 0, plus: 1, pro: 2 };

function main() {
  const args = parseArgs(process.argv.slice(2));
  const user = String(args.user || '').trim();
  if (!user) throw new Error('请用 --user 写持有人标识（邮箱、手机号哈希或名字）');
  const tier = tierOf(args.tier);
  const features = featuresOf(args.features, tier);
  const issued = unix(args.issued, Math.floor(Date.now() / 1000));
  const expiry = expiryOf(args, issued);
  const seats = args.seats == null ? 3 : Number(args.seats);
  if (!Number.isInteger(seats) || seats < 0 || seats > 255) throw new Error('--seats 要在 0 到 255');
  const { pem } = readPrivPem(args.priv);
  const payload = encodePayload({
    tier,
    features,
    seats,
    issued,
    expiry,
    licenseId: licenseIdOf(args.id),
    seal: sealOf(args['seal-file']),
    user,
  });
  const code = finishCode(payload, signRaw(pem, payload));
  console.log(code);
}

function tierOf(raw) {
  if (raw == null || raw === true) return 2;
  const key = String(raw).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TIER, key)) return TIER[key];
  const n = Number(key);
  if (n === 0 || n === 1 || n === 2) return n;
  throw new Error('--tier 用 free、plus 或 pro');
}

function featuresOf(raw, tier) {
  if (raw == null || raw === true) {
    if (tier >= 2) return FEATURES['report.advanced'] | FEATURES['chart.ringExport'];
    if (tier >= 1) return FEATURES['report.advanced'];
    return 0;
  }
  let mask = 0;
  const parts = String(raw).split(',');
  for (let i = 0; i < parts.length; i++) {
    const name = parts[i].trim();
    if (!name) continue;
    if (!FEATURES[name]) throw new Error('未知功能：' + name);
    mask |= FEATURES[name];
  }
  return mask;
}

function unix(raw, fallback) {
  if (raw == null || raw === true) return fallback;
  const ms = Date.parse(String(raw));
  if (!Number.isFinite(ms)) throw new Error('日期无法识别：' + raw);
  return Math.floor(ms / 1000);
}

function expiryOf(args, issued) {
  if (args.expiry) return unix(args.expiry, 0);
  if (args.days != null && args.days !== true) {
    const days = Number(args.days);
    if (!Number.isFinite(days) || days < 0) throw new Error('--days 要是非负数字');
    return issued + Math.floor(days) * 86400;
  }
  return 0;
}

function licenseIdOf(raw) {
  if (raw == null || raw === true) return new Uint8Array(randomBytes(8));
  const hex = String(raw).trim().toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(hex)) throw new Error('--id 要是 16 位十六进制');
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function sealOf(file) {
  if (file == null || file === true) return DEV_SEAL;
  const abs = resolve(String(file));
  if (isInsideRepo(abs)) throw new Error('密封钥不能放在仓库里：' + abs);
  const buf = readFileSync(abs);
  if (buf.length === 16) return new Uint8Array(buf);
  const text = buf.toString('utf8').trim();
  if (/^[0-9a-fA-F]{32}$/.test(text)) {
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  throw new Error('密封钥文件要是 16 字节，或 32 位十六进制');
}

try {
  main();
} catch (e) {
  die(e);
}
