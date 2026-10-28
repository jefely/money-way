// 界面：（无界面）路径追踪
/**
 * 路径追溯（反向 BFS / 环路安全）
 * 层：第三层 · 数学引擎（纯计算）
 *
 * 用户的三大功能，追溯部分全在这里：
 *   功能一 费用类溯源：从费用账户**逆流而上**，找出"这笔钱是谁出的"
 *   功能二 资产负债循环：双向流动，必须防环路
 *   功能三 全链路：不追溯，直接用全部边
 *
 * 全部返回 **索引集合**，不含任何渲染信息。
 */

/**
 * 反向 BFS：从一个账户出发，沿着「指向它」的边一直往上游走。
 *
 * @param {Array<{from_id:string,to_id:string}>} links 单笔连线
 * @param {string} startAccountId 起点（通常是费用类账户）
 * @param {{maxDepth?:number}} opts
 * @returns {{linkIndices:number[], accountIds:string[], depths:Map<string,number>}}
 */
export function traceUpstream(links, startAccountId, opts) {
  const maxDepth = Number(opts && opts.maxDepth) || 12;
  const list = links || [];
  const start = String(startAccountId || '');

  const linkIndices = [];
  const accountIds = new Set();
  const depths = new Map();

  if (!start) return { linkIndices, accountIds: [], depths };

  // 反向索引：to_id → [linkIndex]
  const byTo = new Map();
  for (let i = 0; i < list.length; i++) {
    const to = list[i] && list[i].to_id;
    if (!to) continue;
    if (!byTo.has(to)) byTo.set(to, []);
    byTo.get(to).push(i);
  }

  const visitedLinks = new Set();
  const visitedAcc = new Set([start]);
  depths.set(start, 0);
  accountIds.add(start);

  // 队列：{ acc, depth }
  const queue = [{ acc: start, depth: 0 }];

  while (queue.length) {
    const cur = queue.shift();
    if (cur.depth >= maxDepth) continue;

    for (const li of byTo.get(cur.acc) || []) {
      if (visitedLinks.has(li)) continue;   // 同一条边只走一次（防环）
      visitedLinks.add(li);
      linkIndices.push(li);

      const from = list[li] && list[li].from_id;
      if (!from) continue;
      accountIds.add(from);

      // 同一个账户在更浅的层级被发现时更新 depth（给线宽分级用）
      const nd = cur.depth + 1;
      if (!depths.has(from) || depths.get(from) > nd) depths.set(from, nd);

      if (!visitedAcc.has(from)) {          // 账户只入队一次（防死循环）
        visitedAcc.add(from);
        queue.push({ acc: from, depth: nd });
      }
    }
  }

  linkIndices.sort((a, b) => a - b);
  return { linkIndices, accountIds: [...accountIds], depths };
}

/**
 * 侧栏某一笔流水的追踪链 = **支出倒推**：从它的收款账户往上游走（谁把钱给了它），
 * 并且**总是带上这笔自己**。
 *
 * 注意：逆流 / 顺流只是**画法**（颜色取哪一端、第 4 模式线宽取哪一端），
 * 不改这条链 —— 换方向时看到的是同一批线，见 ui/path-view.js。
 *
 * @param {Array} links 图的流水列表
 * @param {number} txIndex 这笔流水在 links 里的下标
 */
export function traceFromTx(links, txIndex) {
  const list = links || [];
  const i = Math.floor(Number(txIndex));
  const link = Number.isFinite(i) ? list[i] : null;
  const empty = { linkIndices: [], accountIds: [], depths: new Map() };
  if (!link) return empty;

  const anchor = String(link.to_id || '');
  if (!anchor) return { ...empty, linkIndices: [i] };

  const base = traceUpstream(list, anchor);

  // 这笔自己一定要在链上：它指向锚点，正常情况下已经包含；
  // 但单边流水（转出或转入缺一）时上游是空的，链头不能丢。
  const set = new Set(base.linkIndices);
  set.add(i);
  return { ...base, linkIndices: [...set].sort((a, b) => a - b) };
}

/**
 * 某个账户**直接相连**的线（点弧块用，**不递归**）。
 *
 *   dir='up'   流入它的线（to_id === id）—— 逆流
 *   dir='down' 从它流出的线（from_id === id）—— 顺流
 *   不传 dir   双向（「看这个账户的全部往来」）
 *
 * 注意：它不是 traceUpstream —— 弧块模式只看这一个账户的一圈线，
 * 递归上游链是「点左栏某一笔」才做的事。
 */
export function traceByAccount(links, accountId, dir) {
  const id = String(accountId || '');
  const out = [];
  for (let i = 0; i < (links || []).length; i++) {
    const l = links[i];
    if (!l) continue;
    if (dir === 'up') {
      if (l.to_id === id) out.push(i);
    } else if (dir === 'down') {
      if (l.from_id === id) out.push(i);
    } else if (l.from_id === id || l.to_id === id) {
      out.push(i);
    }
  }
  return out;
}

/**
 * 功能二：资产 ↔ 负债之间的「资金腾挪」子图。
 * 只保留 A→B / B→A 两端都是资产或负债的边。
 *
 * @param {Array} links
 * @param {Map<string,{type:string}>} byId
 */
export function extractLeverageLinks(links, byId) {
  const keep = [];
  for (let i = 0; i < (links || []).length; i++) {
    const l = links[i];
    if (!l) continue;
    const a = byId && byId.get(l.from_id);
    const b = byId && byId.get(l.to_id);
    if (!a || !b) continue;
    const movable = (t) => t === '资产类' || t === '负债类';
    if (movable(a.type) && movable(b.type)) keep.push(i);
  }
  return keep;
}

/**
 * 环路检测（调试/统计用）：返回图中是否存在环。
 * 用户的场景里"倒卡"就是环，这里只是给个布尔值，不影响渲染。
 */
export function hasCycle(links, byId) {
  const adj = new Map();
  for (const l of links || []) {
    if (!l || !l.from_id || !l.to_id) continue;
    if (!adj.has(l.from_id)) adj.set(l.from_id, []);
    adj.get(l.from_id).push(l.to_id);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const visit = (node) => {
    color.set(node, GRAY);
    for (const next of adj.get(node) || []) {
      const c = color.get(next) || WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && visit(next)) return true;
    }
    color.set(node, BLACK);
    return false;
  };

  for (const node of adj.keys()) {
    if ((color.get(node) || WHITE) === WHITE && visit(node)) return true;
  }
  return false;
}
