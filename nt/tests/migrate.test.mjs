import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../js/core/migrate.js';

test('旧结构迁移优先使用 type，不让旧 cat 分类覆盖成资产类', () => {
  const raw = {
    version: 1,
    accounts: [
      { id: 'a1', name: '信用卡', code: 'XY', type: '负债类', cat: '信用' },
      { id: 'a2', name: '工资', code: 'GZ', type: '收入类', cat: '职业收入' },
    ],
    transactions: [],
  };
  const out = migrate(raw).state;
  assert.equal(out.accounts.find((a) => a.name === '信用卡').type, '负债类');
  assert.equal(out.accounts.find((a) => a.name === '工资').type, '收入类');
});

test('没有 type 的旧账户才回退到 cat', () => {
  const raw = {
    version: 1,
    accounts: [{ id: 'a1', name: '信用卡', code: 'XY', cat: '负债类' }],
    transactions: [],
  };
  const out = migrate(raw).state;
  assert.equal(out.accounts.find((a) => a.name === '信用卡').type, '负债类');
});
