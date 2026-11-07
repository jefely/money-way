#!/usr/bin/env node
// 工具：发布感谢墙（验签 → 升版本 → 公约 → 可选提交）
/**
 * 层：工具（不进 core/ui）
 *
 * 用法（在仓库根目录 D:\myproject\money-way 下）：
 *
 *   node nt/tools/publish-thanks.mjs            # 只检查：验签 + 升版本 + 公约
 *   node nt/tools/publish-thanks.mjs --commit   # 检查通过后提交并 push
 *
 * 为什么要有它：改完名单之后要做的三件事（验签、升版本、提交）顺序固定，
 * 漏掉任何一步都会出问题 —— 版本不升，手机上的 Service Worker 还用旧 JS；
 * 不验签，签错的文件推上去会让感谢墙直接消失。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

import { verifyPayload } from '../js/browser/thanks-sign.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NT = path.resolve(HERE, '..');
const ROOT = path.resolve(NT, '..');

const ENC = path.join(NT, 'thanks.enc.json');
const WALL = path.join(NT, 'js/ui/thanks-wall.js');

function die(msg) {
  console.error('\n✗ ' + msg);
  process.exit(1);
}

function readPubKey() {
  const src = fs.readFileSync(WALL, 'utf8');
  const m = src.match(/const PUB_KEY = (\{[\s\S]*?\n\});/);
  if (!m) die('在 thanks-wall.js 里找不到 PUB_KEY');
  return JSON.parse(m[1]);
}

async function checkSig() {
  if (!fs.existsSync(ENC)) die('没有 nt/thanks.enc.json');
  const box = JSON.parse(fs.readFileSync(ENC, 'utf8'));
  if (!box.sig) die('thanks.enc.json 没有 sig —— 客户端会拒绝显示，先在管理页重新生成');
  const pub = readPubKey();
  const signed = { v: box.v, salt: box.salt, iv: box.iv, ct: box.ct };
  const ok = await verifyPayload(pub, signed, box.sig);
  console.log(`  公钥     ${pub.kty}/${pub.crv}`);
  console.log(`  载荷     ${String(box.ct || '').length} 字符`);
  console.log(`  签名     ${ok ? '✓ 通过' : '✗ 不匹配'}`);
  if (!ok) die('签名校验失败 —— 文件被改过，或公钥与私钥不是一对');
}

function bumpVersion() {
  const verFile = path.join(NT, 'js/core/version.js');
  const swFile = path.join(NT, 'sw.js');
  const cur = fs.readFileSync(verFile, 'utf8').match(/APP_VER\s*=\s*'([^']+)'/);
  if (!cur) die('读不到 APP_VER');
  const oldVer = cur[1];
  const m = oldVer.match(/^(.*v)(\d+)\.(\d+)$/);
  if (!m) die('版本号格式不认识：' + oldVer);
  const newVer = `${m[1]}${m[2]}.${Number(m[3]) + 1}`;

  // 按字节替换：这两个文件里有损坏的 UTF-8 注释，整文件重写会把它们弄坏
  for (const f of [verFile, swFile]) {
    const buf = fs.readFileSync(f);
    const a = Buffer.from(oldVer);
    const i = buf.indexOf(a);
    if (i < 0) die(`在 ${path.basename(f)} 里找不到 ${oldVer}`);
    fs.writeFileSync(f, Buffer.concat([
      buf.subarray(0, i), Buffer.from(newVer), buf.subarray(i + a.length)]));
  }
  console.log(`  版本     ${oldVer} → ${newVer}`);
  return newVer;
}

function run(cmd, args, label) {
  try {
    const out = execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    console.log(`  ${label}   ✓`);
    return out;
  } catch (e) {
    console.error(`  ${label}   ✗`);
    console.error((e.stdout || '') + (e.stderr || ''));
    process.exit(1);
  }
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('1. 校验签名');
  await checkSig();

  if (commit) {
    // 只有版本号会变的话，发出去等于空跑一版
    const st = execFileSync('git', ['status', '--porcelain', 'nt/'],
      { cwd: ROOT, encoding: 'utf8' });
    const real = st.split('\n').filter((l) => l.trim()
      && !/js\/core\/version\.js|nt\/sw\.js/.test(l));
    if (!real.length) {
      console.log('\n⚠ nt/ 下没有实际改动（只会改 version.js / sw.js）。');
      console.log('  如果确实只想升版本，用 bump 命令；否则先改内容再来。');
      return;
    }
    console.log('  待提交：');
    real.slice(0, 8).forEach((l) => console.log('    ' + l.trim()));
  }

  let ver = null;
  if (commit) {
    console.log('\n2. 升版本');
    ver = bumpVersion();
  } else {
    console.log('\n2. 升版本   （试跑不动版本号；加 --commit 时才升）');
  }

  console.log('\n3. 公约检查');
  run(process.execPath, ['nt/tools/check-rules.mjs'], 'check-rules');

  if (!commit) {
    console.log('\n✓ 检查通过（未提交）。确认无误后加 --commit 再跑一次，'
      + '它会再验一遍、升版本、提交并推送。');
    return;
  }

  console.log('\n4. 提交并推送');
  run('git', ['add', 'nt'], 'git add');
  run('git', ['commit', '-m', `feat(nt): ${ver} —— 更新感谢墙名单`], 'git commit');
  run('git', ['push', 'origin', 'main'], 'git push');

  console.log('\n✓ 已推送。等 60–90 秒后确认线上版本：');
  console.log(`  https://jefely.github.io/money-way/nt/js/core/version.js → 应为 ${ver}`);
  console.log('  手机上要「划掉后台重开」才会换掉 Service Worker 缓存。');
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
