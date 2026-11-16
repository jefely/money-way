import test from 'node:test';
import assert from 'node:assert/strict';

import { toTxtVein, fromTxtVein, packBundle, unpackBundle, packSecure, extractSecure } from '../js/core/txtvein-bridge.js';

const STATE = {
  accounts: [
    { id: 'a1', type: '资产类', category: '储蓄', code: 'ZHC', name: '招行储' },
    { id: 'a2', type: '费用类', category: '日常', code: 'CY', name: '餐饮' },
    { id: 'a3', type: '收入类', category: '工资', code: 'GZ', name: '工资' },
  ],
  transactions: [
    { date: '2026-08-01', from_id: 'a1', to_id: 'a2', amount: 35.5, note: '午饭' },
    { date: '2026-08-02', from_id: 'a3', to_id: 'a1', amount: 1000, note: '工资' },
  ],
};

test('TxtVein 明文：state → 单 TXT → state', () => {
  const built = toTxtVein(STATE);
  assert.ok(built.singleText.includes('## 字典'));
  assert.ok(built.singleText.includes('## 流水'));
  assert.ok(built.dictText.includes('node P 资产'));
  assert.ok(built.dictText.includes('node P 费用'));
  assert.ok(built.ledgerText.includes('260801'));
  assert.ok(built.ledgerText.includes('ZHC > CY 35.50'));

  const back = fromTxtVein(built.singleText);
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  assert.equal(back.stats.transactions, 2);
  assert.equal(back.state.accounts.filter((a) => a.id !== '__OPENING__').length, 3);
  const a = back.state.accounts.find((x) => x.code === 'ZHC');
  const b = back.state.accounts.find((x) => x.code === 'CY');
  const tx = back.state.transactions.find((x) => x.date === '2026-08-01');
  assert.ok(a && b && tx);
  assert.equal(tx.from_id, a.id);
  assert.equal(tx.to_id, b.id);
  assert.equal(tx.amount, 35.5);
});

test('TxtVein 明文：期初虚拟账户 → OPENING', () => {
  const s = {
    accounts: [
      { id: '__OPENING__', type: '权益类', code: '__OP__', name: '期初余额', isHidden: true },
      ...STATE.accounts,
      { id: 'a4', type: '负债类', category: '信用', code: 'ZHX', name: '招行信' },
    ],
    transactions: [
      { date: '2000-01-01', from_id: '__OPENING__', to_id: 'a1', amount: 3000, opening: true },
      { date: '2000-01-01', from_id: 'a4', to_id: '__OPENING__', amount: 500, opening: true },
      ...STATE.transactions,
    ],
  };
  const built = toTxtVein(s);
  assert.ok(built.dictText.includes('OPENING'));
  assert.ok(built.dictText.includes('node P 权益'));
  assert.ok(built.dictText.includes('node P 负债'));
  assert.ok(built.ledgerText.includes('OPENING > ZHC'));
  assert.ok(built.ledgerText.includes('ZHX > OPENING'));
  const back = fromTxtVein(built.singleText);
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  assert.equal(back.stats.transactions, 4);
  assert.ok(back.state.transactions.some((t) => t.opening));
});

test('TxtVein 明文：缺段拒绝', () => {
  const r = fromTxtVein('## 字典\n[会计]\n');
  assert.equal(r.ok, false);
});

test('TxtVein bundle：双文件打包/解包', () => {
  const text = packBundle([
    { name: 'ledger.enc', text: '# [SECURE_START: P, AES-GCM-256]\nABC\n# [SECURE_END]\n' },
    { name: 'dict.enc', text: '# [SECURE_START: P, AES-GCM-256]\nDEF\n# [SECURE_END]\n' },
  ], 'deep');
  const b = unpackBundle(text);
  assert.equal(b.mode, 'deep');
  assert.deepEqual(b.files.map((f) => f.name), ['ledger.enc', 'dict.enc']);
  assert.ok(b.files[1].text.includes('DEF'));
});

test('TxtVein 密文装甲：解出 salt / iv / 密文', () => {
  const env = packSecure('dict', {
    vaultId: 'v1', iterations: 150000, salt: 'SALT', iv: 'IV',
  }, 'QUJD');
  const p = extractSecure(env);
  assert.equal(p.kind, 'dict');
  assert.equal(p.salt, 'SALT');
  assert.equal(p.iv, 'IV');
  assert.equal(p.ciphertext, 'QUJD');
  assert.equal(p.iterations, 150000);
});
