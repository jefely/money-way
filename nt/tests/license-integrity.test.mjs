/**
 * 完整性清单：签名有效、文件被改、签名被改。
 * 另测官方域名判断，以及发行工具不会把私钥写进仓库。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, unlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sign } from 'node:crypto';

import { sha256, hex, utf8 } from '../js/core/sha256.js';
import {
  bytesToB64, canonicalManifest, verifyIntegrityManifest,
} from '../js/core/integrity-manifest.js';
import { devManifestOnOfficial, originWarning } from '../js/core/official-origin.js';
import { isInsideRepo } from '../tools/license-node.mjs';
import { verifyLicenseCode } from '../js/core/license-verify.js';
import { makeKey } from './license-fixtures.mjs';

test('清单签名有效；改文件或改签名都判为被篡改', async () => {
  const key = makeKey();
  const body = utf8('export const n = 1;\n');
  const files = { 'js/demo.js': hex(await sha256(body)) };
  const sig = new Uint8Array(sign(null, Buffer.from(canonicalManifest(files)), key.privateKey));
  const manifest = { v: 1, algo: 'SHA-256', files, sig: bytesToB64(sig) };
  const ok = await verifyIntegrityManifest(manifest, { 'js/demo.js': body }, key.raw, { impl: 'pure' });
  assert.equal(ok.reason, 'match');
  assert.equal(ok.tampered, false);

  const mismatch = await verifyIntegrityManifest(
    manifest,
    { 'js/demo.js': utf8('export const n = 2;\n') },
    key.raw,
    { impl: 'pure' },
  );
  assert.equal(mismatch.tampered, true);
  assert.equal(mismatch.reason, 'mismatch');

  const forged = { ...manifest, sig: bytesToB64(new Uint8Array(64)) };
  const bad = await verifyIntegrityManifest(manifest && forged, { 'js/demo.js': body }, key.raw, { impl: 'pure' });
  assert.equal(bad.reason, 'bad-signature');
  assert.equal(bad.tampered, true);
});

test('未签名清单在本机放行，在官方域名上视为被篡改', () => {
  const dev = { dev: true, tampered: false };
  assert.equal(originWarning('https://jefely.github.io').ok, true);
  assert.equal(originWarning('http://127.0.0.1:8080').local, true);
  assert.equal(originWarning('http://localhost:3000').local, true);
  assert.match(originWarning('https://evil.example').text, /非官方或被篡改的版本/);
  assert.match(originWarning('https://evil.example').text, /https:\/\/jefely\.github\.io\/money-way\/nt\//);
  assert.equal(devManifestOnOfficial('https://jefely.github.io', dev), true);
  assert.equal(devManifestOnOfficial('http://localhost:8080', dev), false);
});

test('keygen 拒绝把私钥写进仓库', () => {
  const target = join('nt', 'nt-ed25519.pem');
  const r = spawnSync(process.execPath, ['nt/tools/license-keygen.mjs', '--out', target], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /拒绝/);
  assert.equal(existsSync(target), false);
  assert.equal(isInsideRepo(target), true);
  assert.equal(isInsideRepo(join(tmpdir(), 'nt-ed25519.pem')), false);
});

test('仓库外生成的密钥能签发，公钥文件里没有私钥', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nt-lic-'));
  const pem = join(dir, 'nt-ed25519.pem');
  const pub = join(dir, 'license-pubkey.js');
  copyFileSync('nt/js/core/license-pubkey.js', pub);
  const gen = spawnSync(process.execPath, [
    'nt/tools/license-keygen.mjs', '--out', pem, '--write-public', pub,
  ], { encoding: 'utf8' });
  assert.equal(gen.status, 0, gen.stderr);
  const pemText = readFileSync(pem, 'utf8');
  const pubText = readFileSync(pub, 'utf8');
  assert.match(pemText, /PRIVATE KEY/);
  assert.equal(pubText.includes('PRIVATE KEY'), false);
  assert.equal(pubText.includes('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='), false);

  const issued = spawnSync(process.execPath, [
    'nt/tools/license-issue.mjs',
    '--priv', pem,
    '--user', '测试用户',
    '--tier', 'pro',
    '--days', '30',
    '--seats', '2',
  ], { encoding: 'utf8' });
  assert.equal(issued.status, 0, issued.stderr);
  const code = issued.stdout.trim();
  assert.match(code, /^NT1-/);
  const b64 = pubText.match(/LICENSE_PUBLIC_KEY_B64 = '([^']+)'/)[1];
  const raw = Uint8Array.from(Buffer.from(b64, 'base64'));
  const verdict = await verifyLicenseCode(code, raw, { impl: 'pure' });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.proof.payload.user, '测试用户');
  assert.equal(verdict.proof.payload.tier, 2);
  assert.equal(verdict.proof.payload.seats, 2);
  assert.ok(verdict.proof.payload.expiry > verdict.proof.payload.issued);
});

test('混淆脚本不改开发源码，也拒绝仓库里的密封钥', () => {
  const inside = join('nt', 'nt-seal.key');
  writeFileSync(inside, Buffer.alloc(16, 3));
  const before = readFileSync('nt/js/core/premium-sealed.js', 'utf8');
  try {
    const denied = spawnSync(process.execPath, [
      'nt/tools/license-obfuscate.mjs', '--seal-file', inside, '--out', join(tmpdir(), 'nt-obf-denied'),
    ], { encoding: 'utf8' });
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /仓库/);
    assert.equal(readFileSync('nt/js/core/premium-sealed.js', 'utf8'), before);
  } finally {
    if (existsSync(inside)) unlinkSync(inside);
  }

  const dir = mkdtempSync(join(tmpdir(), 'nt-obf-'));
  const seal = join(dir, 'nt-seal.key');
  writeFileSync(seal, Buffer.alloc(16, 9));
  const out = join(dir, 'dist');
  const ok = spawnSync(process.execPath, [
    'nt/tools/license-obfuscate.mjs', '--seal-file', seal, '--out', out,
  ], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(existsSync(join(out, 'premium-sealed.js')), true);
  assert.equal(readFileSync('nt/js/core/premium-sealed.js', 'utf8'), before);
  const min = readFileSync(join(out, 'premium-open.js'), 'utf8');
  assert.equal(min.includes('核心记账不引用'), false);
});

test('.gitignore 挡住默认私钥文件名', () => {
  const text = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  for (const name of ['nt-ed25519.pem', 'nt-license-private.pem', 'nt-seal.key', 'nt/dist/']) {
    assert.ok(text.includes(name), name);
  }
});
