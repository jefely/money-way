/**
 * ☐9 路径追溯器
 * 层：第三层 · Money Way 数学引擎（交互用）
 *
 * 点某个账户 / 某笔流水时，向上游追溯「这笔钱是从哪来的」，输出要高亮的 id 集合。
 *
 * 验收：输入起点，输出高亮链路的 id 集合；环状转账不会死循环。
 */

/**
 * 从一笔流水向上游 DFS（沿「转出方」方向倒推）。
 * @param {Array} txs 单笔流水列表（与图一致的那批）
 * @param {number} startIdx 起始下标
 * @returns {{ids:Set<number>, root:number, size:number}}
 */
export function traceUpstream(txs, startIdx) {
  const ids = new Set();
  if (!Array.isArray(txs) || startIdx == null || !txs[startIdx]) {
    return { ids, root: startIdx, size: 0 };
  }
  ids.add(startIdx);

  const seenAcc = new Set();   // 防止环状转账死循环
  const stack = [startIdx];

  while (stack.length) {
    const idx = stack.pop();
    const cur = txs[idx];
    if (!cur) continue;
    const from = String(cur.from || '');
    if (!from || seenAcc.has(from)) continue;
    seenAcc.add(from);

    for (let i = 0; i < txs.length; i++) {
      if (ids.has(i)) continue;
      if (String(txs[i].to || '') !== from) continue;
      ids.add(i);
      stack.push(i);
    }
  }

  return { ids, root: startIdx, size: ids.size };
}

/**
 * 点亮某个账户的全部往来（点弧块用）。
 * @returns {Set<number>} 触及该账户的流水下标集合
 */
export function traceByAccount(txs, accountName) {
  const ids = new Set();
  const nm = String(accountName || '');
  if (!nm) return ids;
  for (let i = 0; i < (txs || []).length; i++) {
    if (String(txs[i].from || '') === nm || String(txs[i].to || '') === nm) ids.add(i);
  }
  return ids;
}
