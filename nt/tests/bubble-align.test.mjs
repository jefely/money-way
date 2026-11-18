import test from 'node:test';
import assert from 'node:assert/strict';
import { unionOutline } from '../js/core/bubble-union.js';
import { paintUnion } from '../js/ui/bubble-stage.js';
import { bodyDiscs } from '../js/ui/bubble-ink.js';

class Ctx {
  constructor() {
    this.strokes = [];
    this._path = [];
  }

  save() {}

  restore() {}

  beginPath() { this._path = []; }

  moveTo(x, y) { this._path.push(['m', x, y]); }

  arc(x, y, r, a0, a1, ccw) { this._path.push(['a', x, y, r, a0, a1, !!ccw]); }

  closePath() { this._path.push(['z']); }

  rect() {}

  clip() {}

  fill() {}

  stroke() { this.strokes.push(this._path.map((s) => s.slice())); }

  createRadialGradient() { return { addColorStop() {} }; }

  set fillStyle(v) {}

  set strokeStyle(v) {}

  set lineWidth(v) {}

  set globalAlpha(v) {}
}

function strokeRadii(g) {
  const last = g.strokes[g.strokes.length - 1] || [];
  return last.filter((s) => s[0] === 'a').map((s) => s[3]);
}

test('合并后的白线走轮廓本身，不走桥弧那颗偏出去的小圆', () => {
  const pairs = [
    [{ x: 0, y: 0, r: 70 }, { x: 100, y: 40, r: 46 }],
    [{ x: 40, y: 10, r: 36 }, { x: -20, y: 80, r: 80 }],
    [{ x: 0, y: 0, r: 50 }, { x: 0, y: 70, r: 44 }],
  ];
  for (const [a, b] of pairs) {
    const parts = unionOutline(a, b);
    assert.ok(parts && parts.length >= 2);
    const g = new Ctx();
    paintUnion(g, parts, '#e05070', {
      fillA: 0.5, inGlow: 1, inGlowExt: 30, outGlow: 0.4, outGlowExt: 50,
      strokeA: 1, strokeW: 3, strokeHex: '#fff',
    }, 1, Math.min(a.r, b.r), [a, b]);
    const radii = strokeRadii(g);
    assert.ok(radii.includes(a.r), '应描到 A ' + radii.join(','));
    assert.ok(radii.includes(b.r), '应描到 B ' + radii.join(','));
    const discs = bodyDiscs(parts, [a, b]);
    assert.equal(discs.length, 2);
    assert.ok(discs.every((d) => (d.x === a.x && d.r === a.r) || (d.x === b.x && d.r === b.r)));
  }
});
