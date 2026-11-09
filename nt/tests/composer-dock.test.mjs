// 记账浮窗：拖出屏幕后会被收回可视区域
import test from 'node:test';
import assert from 'node:assert/strict';

import { clampBox } from '../js/ui/composer.js';

const phone = { l: 0, t: 0, w: 360, h: 640 };

test('浮窗拖出视口会被收回，四边都留出空隙', () => {
  const pulled = clampBox(-80, -40, 320, 90, phone);
  assert.equal(pulled.x, 8);
  assert.equal(pulled.y, 8);

  const past = clampBox(400, 900, 320, 90, phone);
  assert.equal(past.x, 360 - 320 - 8);
  assert.equal(past.y, 640 - 90 - 8);
});

test('键盘把可视区域顶上去时，浮窗跟着那一块走', () => {
  const keyboard = { l: 0, t: 80, w: 393, h: 320 };
  const p = clampBox(40, 500, 300, 90, keyboard);
  assert.equal(p.x, 40);
  assert.equal(p.y, 80 + 320 - 90 - 8);
});
