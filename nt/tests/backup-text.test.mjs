/**
 * 加密备份：装甲文本、被打乱的空白，以及旧 JSON。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { packBackup, unpackBackup, isBackupText, backupFileName } from '../js/core/backup-file.js';
import { createState } from '../js/core/state-store.js';
import { createLedger, removeLedger, listLedgers } from '../js/core/ledgers.js';

const PARTS = {
  salt: 'c2FsdA==',
  iv: 'aXY=',
  ciphertext: 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=',
  updatedAt: '2026-11-04T08:00:00.000Z',
};

test('生成的密文是带抬头的纯文本，文件名是 YYMMDD.txt', () => {
  const text = packBackup(PARTS);
  assert.ok(text.startsWith('-----NT账本加密备份-----\n'));
  assert.ok(text.includes('密文:'));
  assert.equal(isBackupText(text), true);
  const env = unpackBackup(text);
  assert.equal(env.salt, PARTS.salt);
  assert.equal(env.iv, PARTS.iv);
  assert.equal(env.ciphertext, PARTS.ciphertext);
  assert.equal(env.updatedAt, PARTS.updatedAt);
  assert.equal(backupFileName(new Date(2026, 10, 4, 15, 30)), 'NT账本-加密备份-261104.txt');
});

test('BOM、全角冒号、微信式换行和空格仍能还原', () => {
  const mangled = [
    '\uFEFF-----NT账本',
    '加密备份-----',
    '',
    '版本： 1',
    '盐： c2Fs dA==',
    'IV： aXY=',
    '时间： 2026-11-04T08:00:00.000Z',
    '密文：',
    'QUJDRE VG',
    'R0hJSktMTU5PUFFSU1RVVldYWVo=',
    '-----结束-----',
  ].join('\r\n');
  assert.equal(isBackupText(mangled), true);
  const env = unpackBackup(mangled);
  assert.equal(env.salt, PARTS.salt);
  assert.equal(env.iv, PARTS.iv);
  assert.equal(env.ciphertext, PARTS.ciphertext);
  assert.equal(env.updatedAt, PARTS.updatedAt);
  assert.equal(isBackupText('今天记账 50'), false);
});

test('旧 JSON 备份仍能导入，普通 JSON 会被拒绝', () => {
  const legacy = JSON.stringify({
    kind: 'nt-backup',
    v: 1,
    salt: PARTS.salt,
    iv: PARTS.iv,
    ciphertext: PARTS.ciphertext,
    updatedAt: PARTS.updatedAt,
  }, null, 2);
  assert.equal(isBackupText('\n' + legacy + '\n'), true);
  const env = unpackBackup(legacy);
  assert.equal(env.salt, PARTS.salt);
  assert.equal(env.ciphertext, PARTS.ciphertext);
  assert.throws(() => unpackBackup('{"a":1}'));
  assert.equal(isBackupText('LZ1:abc'), false);
});

test('只剩一本时删不掉；有两本时可以删掉当前这本', () => {
  const one = createState();
  assert.equal(removeLedger(one, 'main'), one);
  const two = createLedger(one, '旅行');
  const active = two.activeLedger;
  assert.notEqual(active, 'main');
  const left = removeLedger(two, active);
  const names = listLedgers(left).map((l) => l.name);
  assert.deepEqual(names, ['主账本']);
  assert.equal(left.activeLedger, 'main');
  assert.equal(left.accounts.length, one.accounts.length);
});
