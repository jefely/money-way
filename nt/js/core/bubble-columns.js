// 核心：脉络四列各自守住自己的位置
/**
 * 相斥可以让泡左右让开，但不能让收入跑到费用那一列。
 * 每列有一条带宽。带宽里继续推开；带宽装不下时才退回轴线上。
 */

function laneBounds(b, axes, width) {
  const screenLo = b.r + 2;
  const screenHi = width - b.r - 2;
  if (b.axisX == null || axes.length !== 4) return [screenLo, screenHi];
  const [xL, xLi, xA, xR] = axes;
  const ax = b.axisX;
  const laneLo = ax <= xL ? 0 : ax <= xLi ? (xL + xLi) / 2 : ax <= xA ? (xLi + xA) / 2 : (xA + xR) / 2;
  const laneHi = ax <= xL ? (xL + xLi) / 2 : ax <= xLi ? (xLi + xA) / 2 : ax <= xA ? (xA + xR) / 2 : width;
  return [Math.max(screenLo, laneLo), Math.min(screenHi, laneHi)];
}

function place(b, axes, width) {
  const [lo, hi] = laneBounds(b, axes, width);
  if (b.r * 2 + 4 >= width) {
    b.x = b.axisX == null ? width / 2 : b.axisX;
    return;
  }
  if (hi > lo) b.x = Math.min(hi, Math.max(lo, b.x));
  else b.x = Math.min(width - b.r - 2, Math.max(b.r + 2, b.axisX == null ? b.x : b.axisX));
}

/** 静止泡收进各自的列，并在列内推开。飞泡只保证不要画出屏幕。 */
export function settleColumns(scene, width) {
  if (!(width > 0)) return;
  const axes = scene.axes || [];
  const rest = [...scene.liab, ...scene.asset, ...scene.left, ...scene.right];
  const edge = new Set([...(scene.left || []), ...(scene.right || [])]);
  const gap = Math.max(0, scene.gap == null ? 4 : scene.gap);
  for (let n = 0; n < 16; n += 1) {
    for (let i = 0; i < rest.length; i += 1) {
      for (let j = i + 1; j < rest.length; j += 1) {
        const A = rest[i];
        const B = rest[j];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const min = A.r + B.r + gap;
        if (dist >= min) continue;
        if (edge.has(A) && edge.has(B)) {
          const needX = Math.sqrt(Math.max(0, min * min - dy * dy));
          const lack = needX - Math.abs(dx);
          if (lack > 0) {
            const s = dx > 0.5 ? 1 : dx < -0.5 ? -1 : 1;
            A.x -= s * lack / 2;
            B.x += s * lack / 2;
          }
          continue;
        }
        const push = (min - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        if (edge.has(A)) A.x -= ux * push;
        else { A.x -= ux * push; A.y -= uy * push; }
        if (edge.has(B)) B.x += ux * push;
        else { B.x += ux * push; B.y += uy * push; }
      }
    }
    for (const b of rest) place(b, axes, width);
  }
  for (const b of scene.flies || []) place(b, axes, width);
}
