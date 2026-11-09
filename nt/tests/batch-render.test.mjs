// 批量重绘闸：批量中 render 只排队，结束时每个页面只画一次
import test from 'node:test';
import assert from 'node:assert/strict';
import { beginBatch, endBatch, deferRender } from '../js/ui/batch-render.js';

test('批量中排队、结束统一重绘一次', () => {
  let a = 0;
  let b = 0;
  const pageA = () => { a += 1; };
  const pageB = () => { b += 1; };

  beginBatch();
  assert.equal(deferRender(pageA), true);
  assert.equal(deferRender(pageA), true);   // 同一个 render 只排一次
  assert.equal(deferRender(pageB), true);
  assert.equal(a, 0, '批量中不能提前重绘');
  endBatch();
  assert.equal(a, 1);
  assert.equal(b, 1);

  // 批量外：直接画
  assert.equal(deferRender(pageA), false);
  assert.equal(a, 1);
});

test('嵌套批量只在最外层结束重绘', () => {
  let n = 0;
  const page = () => { n += 1; };
  beginBatch();
  beginBatch();
  deferRender(page);
  endBatch();
  assert.equal(n, 0, '内层结束不能画');
  endBatch();
  assert.equal(n, 1);
});
