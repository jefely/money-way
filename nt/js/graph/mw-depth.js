// 界面：（无界面）环图的链路层级
/**
 * 链路层级（线宽的基准之一）
 * 层：第三层 · Money Way 数学引擎（纯计算）
 *
 * 费用类账户 = 0 级，反向沿「谁给它转过钱」逐级上溯：
 * 越靠近「钱真正花掉的地方」层级越小，第 4 模式与点弧块模式的线宽
 * 就按这个层级取档（见 ui/path-view.js 的 DEPTH_WIDTHS）。
 *
 * 之前这段在 views/path.js 里 —— 那是 UI 装配层，不该压着 30 行图算法，
 * 而且它是「与笔数无关的纯函数」，放在 graph/ 才能在 Node 里直接测。
 */

import { ACCOUNT_TYPE } from '../core/schema.js';

/**
 * @param {Array<{from_id:string,to_id:string}>} txs 单笔流水
 * @param {(id:string)=>{type:string}|null} accOf 账户查询
 * @returns {Map<string, number>} 账户 id → 层级（0 = 费用类）
 */
export function computeDepths(txs, accOf) {
  const list = txs || [];
  const get = typeof accOf === 'function' ? accOf : () => null;

  // 反向索引：to_id → [from_id]（谁把钱付给了它）
  const byTo = new Map();
  for (const x of list) {
    if (!x.from_id || !x.to_id) continue;
    if (!byTo.has(x.to_id)) byTo.set(x.to_id, []);
    byTo.get(x.to_id).push(x.from_id);
  }

  const depth = new Map();
  const queue = [];

  for (const x of list) {
    for (const id of [x.from_id, x.to_id]) {
      if (!id || depth.has(id)) continue;
      const a = get(id);
      if (a && a.type === ACCOUNT_TYPE.EXPENSE) {
        depth.set(id, 0);
        queue.push(id);
      }
    }
  }

  // BFS：账户只入队一次，环路（倒卡）不会死循环；guard 是最后一道保险
  let guard = 0;
  while (queue.length && guard < 5000) {
    guard += 1;
    const cur = queue.shift();
    for (const up of byTo.get(cur) || []) {
      if (up && !depth.has(up)) {
        depth.set(up, depth.get(cur) + 1);
        queue.push(up);
      }
    }
  }

  // 一条路都通不到费用端的（孤立账户 / 纯收入）给最深层级 + 1
  let maxD = 0;
  for (const v of depth.values()) if (v > maxD) maxD = v;
  for (const x of list) {
    for (const id of [x.from_id, x.to_id]) {
      if (id && !depth.has(id)) depth.set(id, maxD + 1);
    }
  }
  return depth;
}
