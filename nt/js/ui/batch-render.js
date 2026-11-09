// 界面：批量粘贴期间挂起重绘
/**
 * 批量重绘闸
 * 层：第五层 · UI
 *
 * 设置页 / 固定页 / 分期页每落一格都会 render()。整片粘贴时如果不挂起，
 * 第一格的重绘会把后面的目标格从 DOM 上摘掉，只有第一格生效。
 * cell-select 在 cut/clear/paste 外面 beginBatch()/endBatch()；
 * 各页 render() 开头 deferRender(render)，批量中只排队，粘完统一画一次。
 */

let depth = 0;
const queue = new Set();

export function beginBatch() {
  depth += 1;
}

export function endBatch() {
  depth = Math.max(0, depth - 1);
  if (depth) return;
  const list = [...queue];
  queue.clear();
  for (const fn of list) fn();
}

/** @returns {boolean} true = 这次先不画（已在批量中排队） */
export function deferRender(fn) {
  if (!depth) return false;
  queue.add(fn);
  return true;
}
