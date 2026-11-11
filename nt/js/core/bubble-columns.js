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

function clampBand(b, y) {
  const band = b.band > 0 ? b.band : 28;
  const home = b.dateY == null ? b.y : b.dateY;
  return Math.min(home + band, Math.max(home - band, y));
}

/** 同一日期线上的两颗先往屏内错开；带宽不够再在日期带里上下让。 */
function separatePair(A, B, min) {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const dist = Math.hypot(dx, dy) || 0.01;
  if (dist >= min) return;
  const needX = Math.sqrt(Math.max(0, min * min - dy * dy));
  const lackX = needX - Math.abs(dx);
  if (lackX > 0.4) {
    const s = Math.abs(dx) > 0.4 ? Math.sign(dx) : 1;
    A.x -= s * lackX / 2;
    B.x += s * lackX / 2;
    return;
  }
  const needY = Math.sqrt(Math.max(0, min * min - dx * dx));
  const lackY = Math.max(0.8, needY - Math.abs(dy));
  const s = Math.abs(dy) > 0.4 ? Math.sign(dy) : 1;
  A.y = clampBand(A, A.y - s * lackY / 2);
  B.y = clampBand(B, B.y + s * lackY / 2);
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
          separatePair(A, B, min);
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
  for (let n = 0; n < 18; n += 1) {
    let moved = false;
    for (let i = 0; i < rest.length; i += 1) {
      for (let j = i + 1; j < rest.length; j += 1) {
        const A = rest[i];
        const B = rest[j];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const min = A.r + B.r + gap;
        if (dist >= min) continue;
        moved = true;
        const push = (min - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        A.x -= ux * push;
        A.y -= uy * push;
        B.x += ux * push;
        B.y += uy * push;
      }
    }
    if (!moved) break;
  }
  for (const b of rest) {
    if (b.dateY == null) continue;
    const y = clampBand(b, b.y);
    const blocked = rest.some((o) => o !== b && Math.hypot(o.x - b.x, o.y - y) < o.r + b.r + gap - 0.4);
    if (!blocked) b.y = y;
  }
  for (const b of scene.flies || []) place(b, axes, width);
}
