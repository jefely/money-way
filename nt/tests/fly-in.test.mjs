/**
 * 飞入：目标行没挂上就跳过，不抛。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flyInto, flyParts } from '../js/ui/fly-in.js';

test('没有目标元素就跳过', () => {
  assert.equal(flyInto('咖啡', null, null), false);
  assert.equal(flyInto('咖啡', { isConnected: true }, { isConnected: false }), false);
});

test('行不在容器里就一笔都不飞', () => {
  const container = {
    querySelector() { return null; },
  };
  assert.equal(flyParts(container, {}, 'tx_1', [{ field: 'note', text: '咖啡' }]), 0);
  assert.equal(flyParts(null, {}, 'tx_1', []), 0);
});

test('目标未挂载时 flyParts 返回 0', () => {
  const tr = { isConnected: false, querySelector() { return { isConnected: false }; } };
  const container = { querySelector() { return tr; } };
  assert.equal(flyParts(container, { isConnected: true }, 'tx_1', [{ field: 'amount', text: '50' }]), 0);
});
