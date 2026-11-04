/**
 * 可选的发行步骤：用仓库外的密封钥重封会员模块，并去掉注释。
 * 不改 nt/js 里的开发源码。输出在 nt/dist/，已在 .gitignore。
 *
 *   node nt/tools/license-obfuscate.mjs --seal-file ~/.nt-keys/nt-seal.key
 *
 * 发行激活码时用同一份 --seal-file，否则应用解不开模块。
 * 这只是提高改一处布尔值的成本，不是防破解。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskBytes } from '../js/core/premium-mask.js';
import { plainBytes, PREMIUM_PLAIN } from './license-premium-plain.mjs';
import { die, isInsideRepo, parseArgs } from './license-node.mjs';

const NT = fileURLToPath(new URL('..', import.meta.url));
const FEATURES = ['report.advanced', 'chart.ringExport'];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seal = readSeal(args['seal-file']);
  const outDir = resolve(args.out || join(NT, 'dist', 'js', 'core'));
  const sealed = {};
  for (let i = 0; i < FEATURES.length; i++) {
    const feature = FEATURES[i];
    sealed[feature] = await maskBytes(plainBytes(feature), seal, feature);
    const back = JSON.parse(new TextDecoder().decode(await maskBytes(sealed[feature], seal, feature)));
    if (back.title !== PREMIUM_PLAIN[feature].title) throw new Error('重封后解不开：' + feature);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'premium-sealed.js'), renderSealed(sealed));
  copyMin(join(NT, 'js', 'core', 'premium-mask.js'), join(outDir, 'premium-mask.js'));
  copyMin(join(NT, 'js', 'core', 'premium-open.js'), join(outDir, 'premium-open.js'));
  console.error('已写出 ' + outDir);
  console.error('开发目录 nt/js 没有改。发行码请带上同一把密封钥。');
}

function readSeal(file) {
  if (!file || file === true) throw new Error('请用 --seal-file 指向仓库外的 16 字节密封钥');
  const abs = resolve(String(file));
  if (isInsideRepo(abs)) throw new Error('密封钥不能放在仓库里：' + abs);
  const buf = readFileSync(abs);
  if (buf.length !== 16) throw new Error('密封钥文件要正好 16 字节');
  return new Uint8Array(buf);
}

function renderSealed(sealed) {
  return [
    '// 界面：（无界面）会员模块密文（发行密封钥；密钥本身不在这个文件里）',
    'export const REPORT_SEALED = new Uint8Array([',
    fmt(sealed['report.advanced']),
    ']);',
    'export const RING_SEALED = new Uint8Array([',
    fmt(sealed['chart.ringExport']),
    ']);',
    '',
  ].join('\n');
}

function fmt(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i++) parts.push(String(bytes[i]));
  const lines = [];
  for (let i = 0; i < parts.length; i += 16) {
    lines.push('  ' + parts.slice(i, i + 16).join(', ') + ',');
  }
  return lines.join('\n');
}

function copyMin(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, minify(readFileSync(from, 'utf8')));
}

function minify(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let block = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (block) {
      if (t.includes('*/')) block = false;
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) block = true;
      continue;
    }
    if (t.startsWith('//')) continue;
    if (!t) continue;
    out.push(lines[i].trimEnd());
  }
  return out.join('\n') + '\n';
}

main().catch(die);
