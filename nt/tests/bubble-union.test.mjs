import test from 'node:test';
import assert from 'node:assert/strict';
import { unionOutline } from '../js/core/bubble-union.js';

function sweepOf(seg) {
  const cw = ((seg.a1 - seg.a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return seg.ccw ? cw - Math.PI * 2 : cw;
}

function pointAt(seg, t) {
  const a = seg.a0 + sweepOf(seg) * t;
  return [seg.x + Math.cos(a) * seg.r, seg.y + Math.sin(a) * seg.r];
}

function axisDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return Math.abs((p[0] - a.x) * dy - (p[1] - a.y) * dx) / d;
}

function assertClosedArcs(a, b, parts) {
  assert.ok(parts && parts.length >= 1);
  for (let i = 0; i < parts.length; i += 1) {
    const seg = parts[i];
    assert.ok(seg.r > 0.5);
    assert.equal(typeof seg.ccw, 'boolean');
    assert.ok(Number.isFinite(seg.a0) && Number.isFinite(seg.a1));
    const p = pointAt(seg, 1);
    const q = pointAt(parts[(i + 1) % parts.length], 0);
    assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.8, '轮廓没有接上');
    for (const t of [0.25, 0.5, 0.75]) {
      const s = pointAt(seg, t);
      const ownA = Math.hypot(seg.x - a.x, seg.y - a.y) < 0.5;
      const ownB = Math.hypot(seg.x - b.x, seg.y - b.y) < 0.5;
      const inA = Math.hypot(s[0] - a.x, s[1] - a.y) < a.r - 0.6;
      const inB = Math.hypot(s[0] - b.x, s[1] - b.y) < b.r - 0.6;
      if (!ownA) assert.equal(inA, false);
      if (!ownB) assert.equal(inB, false);
    }
  }
}

test('离得远不生成桥，退化时也不生成直线', () => {
  assert.equal(unionOutline({ x: 0, y: 0, r: 30 }, { x: 400, y: 0, r: 30 }), null);
  assert.equal(unionOutline({ x: 0, y: 0, r: 40 }, { x: 70, y: 10, r: 18 }), null);
  assert.equal(unionOutline({ x: 0, y: 0, r: 0 }, { x: 10, y: 0, r: 10 }), null);
  assert.equal(unionOutline({ x: NaN, y: 0, r: 10 }, { x: 10, y: 0, r: 10 }), null);
});

test('靠近时是四段相接的圆弧，桥向内凹而不是切线', () => {
  const a = { x: 0, y: 0, r: 30 };
  const b = { x: 50, y: 0, r: 28 };
  const parts = unionOutline(a, b);
  assert.equal(parts.length, 4);
  assertClosedArcs(a, b, parts);
  assert.deepEqual(parts, unionOutline(a, b));
  const fillets = parts.filter((seg) => Math.hypot(seg.x - a.x, seg.y - a.y) > 0.5 && Math.hypot(seg.x - b.x, seg.y - b.y) > 0.5);
  assert.equal(fillets.length, 2);
  for (const seg of fillets) {
    assert.ok(Math.abs(sweepOf(seg)) < Math.PI);
    const mid = pointAt(seg, 0.5);
    const chord = [(pointAt(seg, 0)[0] + pointAt(seg, 1)[0]) / 2, (pointAt(seg, 0)[1] + pointAt(seg, 1)[1]) / 2];
    assert.ok(axisDist(mid, a, b) < axisDist(chord, a, b) - 1, '桥是内凹弧，不是直线');
    assert.ok(Math.hypot(mid[0] - chord[0], mid[1] - chord[1]) > 2);
  }
});

test('斜向和不等半径同样闭合', () => {
  const a = { x: 12, y: -8, r: 36 };
  const b = { x: 70, y: 24, r: 22 };
  const parts = unionOutline(a, b);
  assert.equal(parts.length, 4);
  assertClosedArcs(a, b, parts);
});

test('重叠时走外轮廓，一圆包住另一圆时只留大圆', () => {
  const overlap = unionOutline({ x: 0, y: 0, r: 40 }, { x: 20, y: 0, r: 30 });
  assert.ok(overlap.length === 2 || overlap.length === 4);
  assertClosedArcs({ x: 0, y: 0, r: 40 }, { x: 20, y: 0, r: 30 }, overlap);
  const contained = unionOutline({ x: 0, y: 0, r: 40 }, { x: 8, y: 0, r: 20 });
  assert.equal(contained.length, 1);
  assert.equal(contained[0].r, 40);
  assert.ok(Math.abs((contained[0].a1 - contained[0].a0) - Math.PI * 2) < 1e-9);
});
