/**
 * 给 nt/js 下的脚本算 SHA-256，并用仓库外的私钥签名完整性清单。
 *
 *   node nt/tools/license-integrity.mjs --priv ~/.nt-keys/nt-ed25519.pem
 *
 * 写出 nt/integrity.json。公钥必须已经写进 license-pubkey.js，而且和这把私钥成对。
 * 开发构建不要跑这个；仓库里那份 dev:true 的清单是留给本机的。
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToB64, canonicalManifest, verifyIntegrityManifest } from '../js/core/integrity-manifest.js';
import { decodePublicKey } from '../js/core/license-pubkey.js';
import {
  die, embeddedPublicB64, publicRawFromPem, rawToB64, readPrivPem, signRaw, parseArgs,
} from './license-node.mjs';

const NT = fileURLToPath(new URL('..', import.meta.url));

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { pem } = readPrivPem(args.priv);
  const raw = publicRawFromPem(pem);
  const b64 = rawToB64(raw);
  if (b64 !== embeddedPublicB64()) {
    throw new Error('私钥和 nt/js/core/license-pubkey.js 里的公钥不是一对。先 --write-public。');
  }
  const files = {};
  const bodies = {};
  for (const file of walk(join(NT, 'js'))) {
    const rel = relative(NT, file).split(sep).join('/');
    const body = readFileSync(file);
    files[rel] = createHash('sha256').update(body).digest('hex');
    bodies[rel] = new Uint8Array(body);
  }
  const sig = signRaw(pem, Buffer.from(canonicalManifest(files), 'utf8'));
  const manifest = {
    v: 1,
    algo: 'SHA-256',
    files,
    sig: bytesToB64(sig),
  };
  return verifyIntegrityManifest(manifest, bodies, decodePublicKey(b64)).then((verdict) => {
    if (!verdict.ok || verdict.tampered) throw new Error('签完自己验不过：' + verdict.reason);
    const out = resolve(args.out || join(NT, 'integrity.json'));
    writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
    console.error('已签名 ' + Object.keys(files).length + ' 个脚本 → ' + out);
  });
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

main().catch(die);
