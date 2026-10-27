/**
 * 账本文件包装测试。
 *
 * 关键点：文件正文必须仍是「两段式账本文本」—— 文件、同步码、编辑器三处同源。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ledgerToFile, ledgerFileName, guessKind } from '../js/core/ledger-file.js';
import { ledgerToText } from '../js/core/flow-text.js';
import { parseLedgerText } from '../js/core/import-parser.js';
import { createState, addAccount, addTransaction } from '../js/core/state-store.js';
import { ACCOUNT_TYPE } from '../js/core/schema.js';

function seed() {
  let s = createState();
  s = addAccount(s, { id: 'a1', code: 'XJ', name: '现金', type: ACCOUNT_TYPE.ASSET, category: '现金' });
  s = addAccount(s, { id: 'a2', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '日常' });
  s = addTransaction(s, { date: '2026-08-20', from_id: 'a1', to_id: 'a2', amount: 3.5, note: '午饭', seq: 1 });
  return s;
}

test('★ 文件正文就是两段式账本文本', () => {
  const st = seed();
  const file = ledgerToFile(st);
  const body = ledgerToText(st);

  assert.ok(file.includes(body), '文件里应包含完整的两段式正文');
});

test('★ 头部注释行都以 # 开头（解析器会忽略）', () => {
  const file = ledgerToFile(seed());
  const head = file.split('\n').filter((l) => l.startsWith('#'));
  assert.ok(head.length >= 4, '应有若干行说明，实际 ' + head.length);

  // 头部之后才是正文
  const firstBody = file.split('\n').find((l) => l && !l.startsWith('#'));
  assert.equal(firstBody, '账户：');
});

test('★ 带头部的文件能被解析器原样吃下', () => {
  const st = seed();
  const file = ledgerToFile(st);
  const parsed = parseLedgerText(file);

  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  assert.equal(parsed.accounts.length, 2);
  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0].amount, 3.5);
  assert.equal(parsed.transactions[0].note, '午饭');
});

test('withHeader:false 时只剩正文', () => {
  const st = seed();
  assert.equal(ledgerToFile(st, { withHeader: false }), ledgerToText(st));
});

test('文件名带日期且以 .txt 结尾', () => {
  const d = new Date(2026, 9, 27);   // 2026-10-27
  assert.equal(ledgerFileName(undefined, d), 'NT账本-20261027.txt');
  assert.equal(ledgerFileName('备份', d), '备份-20261027.txt');
});

test('guessKind 认扩展名', () => {
  assert.equal(guessKind('a.txt'), 'text');
  assert.equal(guessKind('a.CSV'), 'text');
  assert.equal(guessKind('a.json'), 'json');
  assert.equal(guessKind('a.xlsx'), 'unknown');
});
