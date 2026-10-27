/**
 * QR 编码器测试：不只看「跑通」，要检查矩阵结构真的符合规范。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { qrEncode, qrCapacity, qrVersionFor } from '../js/core/qr-encode.js';

test('★ 短文本 → 版本 1，21×21', () => {
  const qr = qrEncode('hello');
  assert.ok(!qr.error, JSON.stringify(qr));
  assert.equal(qr.version, 1);
  assert.equal(qr.size, 21);
  assert.equal(qr.rows.length, 21);
  assert.equal(qr.rows[0].length, 21);
});

test('★ 三个定位图形必须在（左上 / 右上 / 左下）', () => {
  const qr = qrEncode('hello');
  const { rows, size } = qr;

  // 定位图形：7×7，外圈黑、中间白圈、中心 3×3 黑
  const checkFinder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const onEdge = r === 0 || r === 6 || c === 0 || c === 6;
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const want = onEdge || inCore ? 1 : 0;
        assert.equal(rows[r0 + r][c0 + c], want,
          `定位图形 (${r0},${c0}) 的第 (${r},${c}) 格不对`);
      }
    }
  };
  checkFinder(0, 0);
  checkFinder(0, size - 7);
  checkFinder(size - 7, 0);
});

test('★ 时序线：第 6 行与第 6 列黑白交替', () => {
  const qr = qrEncode('hello');
  const { rows, size } = qr;
  for (let i = 8; i < size - 8; i++) {
    assert.equal(rows[6][i], i % 2 === 0 ? 1 : 0, `第 6 行第 ${i} 列`);
    assert.equal(rows[i][6], i % 2 === 0 ? 1 : 0, `第 6 列第 ${i} 行`);
  }
});

test('内容变长 → 版本递增，尺寸 = 版本×4+17', () => {
  for (const n of [10, 60, 200, 800]) {
    const qr = qrEncode('x'.repeat(n));
    assert.ok(!qr.error, `${n} 字节编码失败：${qr.error}`);
    assert.equal(qr.size, qr.version * 4 + 17);
    assert.ok(qr.version >= 1 && qr.version <= 40);
  }
});

test('容量表：版本 1 约 17 字节，版本 40 约 2953 字节', () => {
  const c1 = qrCapacity(1);
  const c40 = qrCapacity(40);
  assert.ok(c1 >= 15 && c1 <= 20, 'v1 容量 ' + c1);
  assert.ok(c40 >= 2900 && c40 <= 2960, 'v40 容量 ' + c40);
});

test('qrVersionFor 单调不减', () => {
  let prev = 0;
  for (let n = 1; n <= 2000; n += 97) {
    const v = qrVersionFor(n);
    assert.ok(v >= prev, `字节 ${n} 的版本 ${v} 比之前 ${prev} 小`);
    prev = v;
  }
});

test('超长内容 → 返回 error，而不是抛异常', () => {
  const qr = qrEncode('x'.repeat(4000));
  assert.ok(qr.error, '应该报错');
  assert.equal(qr.rows, undefined);
});

test('同一内容编码两次结果完全一致（确定性）', () => {
  const a = qrEncode('NT账本 2026');
  const b = qrEncode('NT账本 2026');
  assert.equal(a.version, b.version);
  assert.equal(a.mask, b.mask);
  assert.deepEqual(a.rows, b.rows);
});

test('中文按 UTF-8 计字节（3 字节/字）', () => {
  const cn = qrEncode('账'.repeat(20));   // 60 字节
  const en = qrEncode('x'.repeat(60));    // 60 字节
  assert.equal(cn.version, en.version, '同样字节数应选同一版本');
});

test('矩阵里只有 0 和 1', () => {
  const qr = qrEncode('check bits');
  const bad = new Set();
  for (const row of qr.rows) for (const v of row) if (v !== 0 && v !== 1) bad.add(v);
  assert.equal(bad.size, 0, '异常值: ' + [...bad]);
});
