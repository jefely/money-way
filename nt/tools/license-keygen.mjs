/**
 * 生成 Ed25519 密钥对。私钥写到仓库外面。
 *
 *   node nt/tools/license-keygen.mjs
 *   node nt/tools/license-keygen.mjs --out ~/.nt-keys/nt-ed25519.pem --write-public nt/js/core/license-pubkey.js
 *
 * 环境变量 NT_LICENSE_PRIV 可代替 --out。已存在的私钥不会覆盖，除非加 --force。
 */

import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  assertOutsideRepo, defaultPrivPath, die, parseArgs, rawToB64, replacePublicKeyConstant,
} from './license-node.mjs';

function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = resolve(args.out || process.env.NT_LICENSE_PRIV || defaultPrivPath());
  assertOutsideRepo(out);
  if (existsSync(out) && !args.force) {
    throw new Error('私钥已存在，拒绝覆盖：' + out + '（要换钥再加 --force）');
  }
  const pair = generateKeyPairSync('ed25519');
  const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  if (!String(pem).includes('PRIVATE KEY')) throw new Error('生成的私钥格式异常');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pem, { mode: 0o600 });
  const der = pair.publicKey.export({ type: 'spki', format: 'der' });
  const b64 = rawToB64(der.subarray(der.length - 32));
  if (args['write-public']) {
    const file = resolve(args['write-public']);
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, replacePublicKeyConstant(text, b64));
    console.error('已写入公钥：' + file);
  }
  console.log(b64);
  console.error('私钥在仓库外：' + out);
  console.error('不要把私钥提交进 git。');
}

try {
  main();
} catch (e) {
  die(e);
}
