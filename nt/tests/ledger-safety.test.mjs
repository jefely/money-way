// 导入判重、撤销、重置账户、备份提醒、加密备份信封、日期冒号、环图提示
import test from 'node:test';
import assert from 'node:assert/strict';

import { fingerprintBag, takeIfNew, keysForIncoming, importFingerprint } from '../js/core/import-dedupe.js';
import { createUndo } from '../js/core/undo-stack.js';
import { resetAccountsKeepData, SEED_ACCOUNTS } from '../js/core/reset-book.js';
import { packBackup, unpackBackup, isBackupText } from '../js/core/backup-file.js';
import { shouldRemindBackup, BACKUP_STALE_MS, BACKUP_SNOOZE_MS } from '../js/core/backup-reminder.js';
import { cipherMatches } from '../js/core/vault-cas.js';
import { normalizeTypedDate, todayIso } from '../js/core/format.js';
import { outgoingArcColor, nodeColor } from '../js/graph/mw-layers.js';
import { tipText } from '../js/ui/chart-tip.js';
import { legendRows } from '../js/ui/path-legend.js';
import { deriveKey, encryptData, decryptData, randomSalt, bytesToBase64, base64ToBytes } from '../js/core/crypto-engine.js';
import { createState, addAccount, addTransaction } from '../js/core/state-store.js';

test('导入判重：已有一笔时再导两笔，只跳过一笔', () => {
  const existing = [{ date: '2026-08-01', from_id: 'a', to_id: 'b', amount: 35, note: '午饭' }];
  const bag = fingerprintBag(existing);
  const row = { date: '2026-08-01', from_id: 'a', to_id: 'b', amount: 35, note: '午饭' };
  assert.equal(takeIfNew(bag, keysForIncoming(row)), false);
  assert.equal(takeIfNew(bag, keysForIncoming(row)), true);
});

test('导入判重：同一天同额的两笔新账都留下', () => {
  const bag = fingerprintBag([]);
  const row = { date: '2026-08-01', from_id: 'a', to_id: 'b', amount: 10, note: '地铁' };
  assert.equal(takeIfNew(bag, keysForIncoming(row)), true);
  assert.equal(takeIfNew(bag, keysForIncoming(row)), true);
});

test('导入判重：有单号时按单号抵消，不误伤同额的另一笔', () => {
  const existing = [{ date: '2026-08-01', from_id: 'a', to_id: 'b', amount: 10, note: '地铁', billId: 'T1' }];
  const bag = fingerprintBag(existing);
  assert.equal(importFingerprint(existing[0]).startsWith('no:'), true);
  assert.equal(takeIfNew(bag, keysForIncoming({ ...existing[0] })), false);
  const other = { date: '2026-08-01', from_id: 'a', to_id: 'b', amount: 10, note: '地铁', billId: 'T2' };
  assert.equal(takeIfNew(bag, keysForIncoming(other)), true);
});

test('撤销栈最多 20 步，撤销时不再把恢复的状态压回去', () => {
  const undo = createUndo(20);
  let cur = { n: 0 };
  for (let i = 1; i <= 25; i += 1) {
    const next = { n: i };
    undo.note(cur, next);
    cur = next;
  }
  assert.equal(undo.size, 20);
  const prev = undo.pop();
  assert.equal(prev.n, 24);
  undo.note(prev, { n: 99 });
  assert.equal(undo.size, 19);
  undo.unlock();
  undo.note(prev, { n: 99 });
  assert.equal(undo.size, 20);
});

test('撤销 checkpoint 清空栈', () => {
  const undo = createUndo(5);
  undo.note({ a: 1 }, { a: 2 });
  undo.checkpoint();
  assert.equal(undo.pop(), null);
});

test('只重置账户：同名流水改挂到内置 id，计划保留', () => {
  let s = createState();
  s = addAccount(s, { id: 'old_cash', code: 'X', name: '现金', type: '资产类', category: '现金' });
  s = addAccount(s, { id: 'shop', code: 'SP', name: '超市', type: '费用类', category: '日常' });
  s = addTransaction(s, { date: '2026-08-01', from_id: 'old_cash', to_id: 'shop', amount: 12, note: '菜' });
  s = { ...s, scheduled: [{ id: 'p1', from_id: 'old_cash', to_id: 'shop', amount: 1 }] };
  const next = resetAccountsKeepData(s);
  const names = next.accounts.filter((a) => !a.isHidden).map((a) => a.name);
  assert.deepEqual(names, SEED_ACCOUNTS.map((a) => a.name));
  const cash = next.accounts.find((a) => a.name === '现金');
  assert.ok(cash, '默认模板里必须有现金');
  assert.equal(next.transactions[0].from_id, cash.id);
  assert.equal(next.transactions[0].to_id, 'shop');
  assert.equal(next.scheduled[0].from_id, cash.id);
  assert.equal(next.transactions[0].note, '菜');
});

test('备份提醒：只有主屏幕、且超过七天或从未备份', () => {
  const now = 1_000_000_000_000;
  assert.equal(shouldRemindBackup({ standalone: false, lastAt: 0, now }), false);
  assert.equal(shouldRemindBackup({ standalone: true, lastAt: 0, now }), true);
  assert.equal(shouldRemindBackup({ standalone: true, lastAt: now - BACKUP_STALE_MS + 1000, now }), false);
  assert.equal(shouldRemindBackup({ standalone: true, lastAt: now - BACKUP_STALE_MS - 1, now }), true);
  assert.equal(shouldRemindBackup({
    standalone: true, lastAt: 0, dismissedAt: now - 1000, now,
  }), false);
  assert.equal(shouldRemindBackup({
    standalone: true, lastAt: 0, dismissedAt: now - BACKUP_SNOOZE_MS - 1, now,
  }), true);
});

test('写盘冲突：密文必须逐字相同', () => {
  assert.equal(cipherMatches('abc', 'abc'), true);
  assert.equal(cipherMatches('', ''), true);
  assert.equal(cipherMatches('abc', 'abd'), false);
  assert.equal(cipherMatches('abc', ''), false);
});

test('日期格冒号是今天', () => {
  const now = new Date(2026, 7, 3);
  assert.equal(normalizeTypedDate(':', now), '2026-08-03');
  assert.equal(normalizeTypedDate('：', now), todayIso(now));
  assert.equal(normalizeTypedDate('260801', now), '2026-08-01');
});

test('转出弧色就是弦色', () => {
  const colorOf = (id) => nodeColor(id === 'from' ? 0 : 3, 6, 10);
  assert.equal(outgoingArcColor(colorOf, 'from'), colorOf('from'));
  assert.notEqual(outgoingArcColor(colorOf, 'from'), colorOf('to'));
});

test('悬停文案：弧块给净额，弦给两端和取整金额（不要两位小数）', () => {
  const model = {
    blocks: [{ acc: 'a', label: '现金', type: '资产类', amountText: '¥0' }],
    txs: [{ date: '2026-08-01', from_id: 'a', to_id: 'b', amount: 12.5, note: '午饭' }],
  };
  const arc = { classList: { contains: (c) => c === 'mw-ring' }, getAttribute: (k) => (k === 'data-node' ? 'a' : '') };
  assert.match(tipText(model, arc), /现金/);
  assert.match(tipText(model, arc), /净额 ¥0/);
  const chord = {
    classList: { contains: (c) => c === 'mw-chord' },
    getAttribute: (k) => (k === 'data-tx' ? '0' : ''),
  };
  const text = tipText(model, chord);
  assert.match(text, /现金 → b/);
  assert.match(text, /13/);
  assert.doesNotMatch(text, /12\.50/);
  assert.match(text, /午饭/);
});

test('图例一行一个账户，带来颜色', () => {
  const rows = legendRows(
    [{ acc: 'a', label: '现金', type: '资产类', amountText: '1.20' }],
    () => 'red',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].color, 'red');
  assert.equal(rows[0].amount, '1.20');
});

test('加密备份信封能用密码往返，错密码解不开', async () => {
  const salt = randomSalt();
  const key = await deriveKey('secret-pw', salt, 1000);
  const { iv, ciphertext } = await encryptData(key, JSON.stringify({ hello: 1 }));
  const text = packBackup({
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  });
  assert.equal(isBackupText(text), true);
  const env = unpackBackup(text);
  const key2 = await deriveKey('secret-pw', base64ToBytes(env.salt), 1000);
  const plain = await decryptData(key2, base64ToBytes(env.iv), base64ToBytes(env.ciphertext));
  assert.equal(plain, JSON.stringify({ hello: 1 }));
  const bad = await deriveKey('nope', base64ToBytes(env.salt), 1000);
  await assert.rejects(() => decryptData(bad, base64ToBytes(env.iv), base64ToBytes(env.ciphertext)));
});

test('unpackBackup 拒绝普通 JSON', () => {
  assert.throws(() => unpackBackup('{"a":1}'));
  assert.equal(isBackupText('LZ1:abc'), false);
});
