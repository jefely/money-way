// 核心：脉络标注的引出线
/**
 * 右上 45° 引出线。靠右缘时翻到左上。线长用来躲开已经占住的字。
 * 纯函数，倒放同一帧还是同一组标注。
 */

const LEN = [28, 46, 66, 88];

function hit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function geom(orb, side, len, tw) {
  const ang = side > 0 ? -Math.PI / 4 : -Math.PI * 0.75;
  const x1 = orb.x + Math.cos(ang) * orb.r;
  const y1 = orb.y + Math.sin(ang) * orb.r;
  const x2 = x1 + Math.cos(ang) * len;
  const y2 = y1 + Math.sin(ang) * len;
  const box = side > 0
    ? { x: x2 + 3, y: y2 - 8, w: tw, h: 15 }
    : { x: x2 - tw - 3, y: y2 - 8, w: tw, h: 15 };
  return { x1, y1, x2, y2, box, side };
}

/**
 * @param {Array<{x,y,r,text,priority,tw}>} items
 * @param {number} width
 */
export function layoutCallouts(items, width, reserved) {
  const taken = (reserved || []).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  const out = [];
  const order = items.filter((it) => it && it.text).slice()
    .sort((a, b) => (b.priority - a.priority) || (b.r - a.r));
  for (const it of order) {
    const tw = Math.max(32, it.tw || it.text.length * 7);
    const preferLeft = it.x + it.r + tw + 24 > width - 4;
    const sides = preferLeft ? [-1, 1] : [1, -1];
    let chosen = null;
    for (const side of sides) {
      for (const len of LEN) {
        const slot = geom(it, side, len, tw);
        if (slot.box.x < 2 || slot.box.x + slot.box.w > width - 2) continue;
        if (slot.box.y < 2) continue;
        if (taken.some((b) => hit(slot.box, b))) continue;
        chosen = slot;
        break;
      }
      if (chosen) break;
    }
    if (!chosen) continue;
    chosen.alpha = 1;
    chosen.text = it.text;
    chosen.id = it.id;
    taken.push(chosen.box);
    out.push(chosen);
  }
  return out;
}
