/**
 * 同步码与二维码载荷测试。
 *
 * 重点不是「能压缩」，而是：**往返不丢记录、金额不串、日期不偏**。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeSyncCode, decodeSyncCode, bytesToB64, b64ToBytes,
  packPayload, unpackPayload, packForQr, unpackFromHash, QR_MAX_URL,
} from '../js/core/sync-code.js';
import { createState, addAccount, addTransaction } from '../js/core/state-store.js';
import { ACCOUNT_TYPE } from '../js/core/schema.js';

function seed(n) {
  let s = createState();
  s = addAccount(s, { id: 'a1', code: 'ZHC', name: '招行储', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'a2', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '日常' });
  s = addAccount(s, { id: 'a3', code: 'XJ', name: '现金', type: ACCOUNT_TYPE.ASSET, category: '现金' });
  for (let i = 0; i < n; i++) {
    s = addTransaction(s, {
      date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
      from_id: i % 2 ? 'a1' : 'a3',
      to_id: 'a2',
      amount: 3.5 + i,
      note: 'n' + i,
      seq: i + 1,
    });
  }
  return s;
}

/* ---------- base64url ---------- */

test('base64url 往返（不含 + / =）', () => {
  const bytes = new Uint8Array([0, 1, 250, 255, 128, 63]);
  const b = bytesToB64(bytes);
  assert.ok(!/[+/=]/.test(b), '不该出现 + / =：' + b);
  assert.deepEqual(Array.from(b64ToBytes(b)), Array.from(bytes));
});

/* ---------- 同步码 ---------- */

test('★ 同步码往返：文本一字不差', async () => {
  const text = '账户：\n流水：\n260801，现金，餐饮，3.5，午饭';
  const code = await encodeSyncCode(text);
  assert.match(code, /^LZ[01]:/);
  assert.equal(await decodeSyncCode(code), text);
});

test('★ 大文本压缩后明显变短', async () => {
  const st = seed(200);
  const { ledgerToText } = await import('../js/core/flow-text.js');
  const text = ledgerToText(st);
  const code = await encodeSyncCode(text);
  assert.match(code, /^LZ1:/, '应该走 gzip 分支');
  assert.ok(code.length < text.length * 0.6,
    `压缩率不够：原文 ${text.length} → ${code.length}`);
});

test('同步码：格式不对要报错，不能静默返回空', async () => {
  await assert.rejects(() => decodeSyncCode('随便一段文字'), /格式不对/);
});

test('同步码：LZ0（无压缩）也能解', async () => {
  const raw = 'LZ0:' + bytesToB64(new TextEncoder().encode('abc'));
  assert.equal(await decodeSyncCode(raw), 'abc');
});

test('同步码：全角冒号也认', async () => {
  const text = 'x';
  const code = await encodeSyncCode(text);
  const full = code.replace(':', '：');
  assert.equal(await decodeSyncCode(full), text);
});

/* ---------- 紧凑载荷 ---------- */

test('★ 紧凑载荷往返：笔数与金额都对', () => {
  const st = seed(3);
  const txs = st.transactions;
  const payload = packPayload(st, txs, [1, 1]);
  const back = unpackPayload(payload);

  assert.equal(back.rows.length, 3);
  assert.equal(back.part[0], 1);
  for (let i = 0; i < 3; i++) {
    assert.equal(back.rows[i].amount, txs[i].amount, `第 ${i} 笔金额`);
    assert.equal(back.rows[i].date, txs[i].date, `第 ${i} 笔日期`);
    assert.equal(back.rows[i].note, txs[i].note, `第 ${i} 笔备注`);
  }
});

test('★ 紧凑载荷用简码而不是全名（省容量）', () => {
  const st = seed(1);
  const payload = packPayload(st, st.transactions, null);
  assert.ok(payload.a.length >= 2, '要带简码→名字对照表');

  const map = Object.fromEntries(payload.a);
  // seed(1) 的那一笔是 现金(XJ) → 餐饮(CY)
  assert.equal(map.XJ, '现金');
  assert.equal(map.CY, '餐饮');
  assert.ok(payload.t.includes('XJ'), '流水行里应该是简码：' + payload.t);
  assert.ok(!payload.t.includes('现金'), '不该出现全名：' + payload.t);
});

test('金额尾零被吃掉：3.00 → 3、3.50 → 3.5', () => {
  let s = createState();
  s = addAccount(s, { id: 'x', code: 'AA', name: 'A', type: ACCOUNT_TYPE.ASSET, category: '' });
  s = addAccount(s, { id: 'y', code: 'BB', name: 'B', type: ACCOUNT_TYPE.EXPENSE, category: '' });
  s = addTransaction(s, { date: '2026-08-01', from_id: 'x', to_id: 'y', amount: 3, note: '', seq: 1 });
  s = addTransaction(s, { date: '2026-08-01', from_id: 'x', to_id: 'y', amount: 3.5, note: '', seq: 2 });
  const p = packPayload(s, s.transactions, null);
  const lines = p.t.split('\n');
  assert.ok(lines[0].includes(',3,'), '3 不带小数点：' + lines[0]);
  assert.ok(lines[1].includes(',3.5,'), '3.5 不能变成 3.50：' + lines[1]);
});

test('备注里的换行被压成空格（否则会撑破行结构）', () => {
  let s = createState();
  s = addAccount(s, { id: 'x', code: 'AA', name: 'A', type: ACCOUNT_TYPE.ASSET, category: '' });
  s = addAccount(s, { id: 'y', code: 'BB', name: 'B', type: ACCOUNT_TYPE.EXPENSE, category: '' });
  s = addTransaction(s, { date: '2026-08-01', from_id: 'x', to_id: 'y', amount: 1, note: 'a\nb', seq: 1 });
  const p = packPayload(s, s.transactions, null);
  assert.equal(p.t.split('\n').length, 1, '不该因为备注里的换行多出一行');
  assert.ok(p.t.includes('a b'));
});

/* ---------- 二维码分片 ---------- */

test('★ 分片：每片笔数正确、片数正确', async () => {
  const st = seed(40);
  const r = await packForQr(st, { base: 'https://x/y/', per: 10 });
  assert.equal(r.parts.length, 4, '40 笔 / 每片 10 = 4 片');
  for (const p of r.parts) {
    assert.equal(p.count, 10);
    assert.ok(p.url.startsWith('https://x/y/#m='), p.url.slice(0, 40));
    assert.ok(p.url.length <= QR_MAX_URL, '超过二维码容量：' + p.url.length);
  }
  assert.equal(r.parts[0].part[0], 1);
  assert.equal(r.parts[3].part[1], 4);
});

test('★ 分片太多就明确报 tooDense，而不是塞一个扫不出来的码', async () => {
  const st = seed(300);
  const r = await packForQr(st, { base: 'https://example.com/', per: 300 });
  // 300 笔塞一张必然超容量
  assert.ok(r.tooDense || r.parts.length > 1, '应该要么分片要么报 tooDense');
});

test('没有流水时不产生二维码（不是空码）', async () => {
  const r = await packForQr(createState(), { base: 'x' });
  assert.equal(r.parts.length, 0);
  assert.equal(r.total, 0);
});

test('期初流水不进二维码（它是背景板）', async () => {
  let s = seed(2);
  s = addTransaction(s, {
    date: '2000-01-01', from_id: '__OPENING__', to_id: 'a1',
    amount: 1000, note: '期初', opening: true, seq: 0,
  });
  const r = await packForQr(s, { base: 'x', per: 50 });
  const payload = await unpackFromHash(r.parts[0].url.split('#')[1]);
  assert.ok(!payload.rows.some((x) => x.note === '期初'), '期初不该出现');
});

/* ---------- 从 hash 还原 ---------- */

test('★ URL hash → 载荷：日期与金额都还原', async () => {
  const st = seed(5);
  const r = await packForQr(st, { base: 'https://x/', per: 5 });
  const hash = r.parts[0].url.slice(r.parts[0].url.indexOf('#'));
  const payload = await unpackFromHash(hash);

  assert.equal(payload.rows.length, 5);
  const src = st.transactions;
  for (let i = 0; i < 5; i++) {
    assert.equal(payload.rows[i].date, src[i].date);
    assert.equal(payload.rows[i].amount, src[i].amount);
  }
});

test('hash 里没有 m= 时返回 null（不是抛错）', async () => {
  assert.equal(await unpackFromHash('#other=1'), null);
  assert.equal(await unpackFromHash(''), null);
});
