// 清空行：名称/简码/期初全空且没被引用 → 切出设置页时清掉
import test from 'node:test';
import assert from 'node:assert/strict';
import { pruneEmptyAccounts } from '../js/core/account-order.js';

test('没有有效内容且没被引用的账户被清掉', () => {
  const state = {
    accounts: [
      { id: 'a', name: '现金' },
      { id: 'b', name: '', code: '', opening: 0 },
      { id: 'c', name: ' ', code: 'X' },
      { id: 'd', name: '', opening: 5 },
      { id: 'e', name: '' },
    ],
    transactions: [{ from_id: 'e', to_id: 'a' }],
    scheduled: [],
  };
  const out = pruneEmptyAccounts(state);
  assert.deepEqual(out.accounts.map((x) => x.id), ['a', 'c', 'd', 'e']);
});

test('没有可清的行时返回原对象（不触发重绘）', () => {
  const state = { accounts: [{ id: 'a', name: '现金' }], transactions: [], scheduled: [] };
  assert.equal(pruneEmptyAccounts(state), state);
});
