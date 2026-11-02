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
 * @param {{maxDepth?:number}} [opts] 上游深度上限（面板「追踪深度」，默认 12）
 */
export function traceFromTx(links, txIndex, opts) {
  const list = links || [];
  const i = Math.floor(Number(txIndex));
  const link = Number.isFinite(i) ? list[i] : null;
  const empty = { linkIndices: [], accountIds: [], depths: new Map() };
  if (!link) return empty;

  const anchor = String(link.to_id || '');
  if (!anchor) return { ...empty, linkIndices: [i] };

  const base = traceUpstream(list, anchor, opts);

  // 这笔自己一定要在链上：它指向锚点，正常情况下已经包含；
  // 但单边流水（转出或转入缺一）时上游是空的，链头不能丢。
  const set = new Set(base.linkIndices);
  set.add(i);
  return { ...base, linkIndices: [...set].sort((a, b) => a - b) };
}

/**
 * 点弧块时看哪一侧的线（2026-11 用户定，取代原来的「逆流 / 顺流」开关）：
 *
 *   收入类 / 权益类          只看**转出**（钱从这来，关心它往哪去）
 *   资产类 / 负债类 / 成本类  转入与转出**都看**（中转站，两头都是它的故事）
 *   费用类                   只看**转入**（钱花到这，关心它从哪来）
 *
 * 放在这一层而不是 views/path.js：纯数据、可被 Node 直接测。
 */
export const ACC_SIDE = {
  收入类: 'out',
  权益类: 'out',
  资产类: 'both',
  负债类: 'both',
  成本类: 'both',
  费用类: 'in',
};

/** 类型 → 看哪一侧；认不出的类型按中转站处理（两头都看，至少不会漏线） */
export function sideForType(type) {
  return ACC_SIDE[type] || 'both';
}

/**
 * **资金路径追踪（2026-11 用户定的新逻辑）** —— 沿着钱走过的路，一步一步往前走。
 *
 * 选中第 E0 笔（from0 → to0）：
 *
 *   **向前**（正序号）
 *     to0 在 E0 **之后**第一次作为**转出节点**的那笔 → 记 1
 *     （记 1 那笔的转入节点，在它之后第一次作为转出节点的那笔 → 记 2，以此类推）
 *
 *   **向后**（负序号）—— **汇聚追踪**
 *     from0 在 E0 **之前**、所有以它为**转入节点**的记录 → 全部记 -1
 *     （这些记录的转出节点，在它们各自之前、以该节点为转入节点的所有记录 → 全部记 -2，以此类推）
 *
 * 注意两个方向不对称：
 *   · **向后是汇聚**：同一个账户的钱可能来自很多处，所以那一层要**全收**；
 *   · **向前是单线**：只认「第一次作为转出节点」的那一笔（用户原话「1 2 3 4 不用，因为这是汇聚追踪」）。
 *
 * 与旧版 `traceFromTx`（把上游所有线都收进一个集合）的区别：
 * 两个方向都用 `steps` 记下序号，所以链上每一笔都有明确的前后位置。
 *
 * `links` 的顺序就是发生顺序（录入顺序），前后都按这个下标走。
 *
 * @param {Array} links 图的流水列表
 * @param {number} txIndex 选中那笔在 links 里的下标
 * @param {{maxDepth?:number}} [opts] 单侧最大跳数（面板「追踪深度」）
 * @returns {{linkIndices:number[], steps:Map<number,number>}}
 *          steps：流水下标 → 序号（选中 = 0，向前 1/2/3…，向后 -1/-2/-3…）
 */
export function traceFlowPath(links, txIndex, opts) {
  const list = links || [];
  const start = Math.floor(Number(txIndex));
  // 0 / 不传 / 非数字 = **不限跳数**：每一跳都要先占一个新下标，
  // 所以 `steps` 天然保证终止，最坏也就 n 跳。
  const rawDepth = Number(opts && opts.maxDepth);
  const depth = rawDepth > 0 ? Math.floor(rawDepth) : Infinity;
  // 「同一个节点」的判定。默认按 ID 严格相等；调用方可以传入更宽松的谓词
  // （path.js 会把**同名不同 ID** 的账户当成同一个 —— 账本里合并/迁移留下的重名账户
  // 否则会让追踪在这里断掉，用户看到的就是「这笔明明转进同一个钱包却没被追到」）。
  const same = (opts && typeof opts.sameAccount === 'function')
    ? opts.sameAccount
    : (a, b) => a === b;
  const steps = new Map();
  const linkIndices = [];
  if (!Number.isFinite(start) || !list[start]) return { linkIndices, steps };

  const take = (idx, step) => {
    if (steps.has(idx)) return false;
    steps.set(idx, step);
    linkIndices.push(idx);
    return true;
  };

  take(start, 0);

  // 金额上限：选中那笔的发生额。向后、向前两个第二轮的累计判定都用它。
  const cap = Math.abs(Number(list[start] && list[start].amount) || 0);

  // 向前：**两轮**（2026-11-03 加第二层）
  //
  //   第一轮（链）：to0 之后第一次作为「转出节点」的那笔 = 1，
  //                 它之后第一次作为转出的 = 2 ……
  //   第二轮（叠加）：每层把「转出账户 == 该层代表记录的转出账户」的其它记录也标成同一层；
  //                 累计转出额一旦 > 选中那笔的发生额，就停止叠加。
  //                 道理：下游各笔加起来超过这笔钱本身，说明混进了别的资金。
  const fChain = [];
  let cur = start;
  for (let step = 1; step <= depth; step += 1) {
    const node = list[cur] && list[cur].to_id;
    if (!node) break;
    let next = -1;
    for (let k = cur + 1; k < list.length; k += 1) {
      const t = list[k];
      if (t && t.from_id && same(t.from_id, node) && !steps.has(k)) { next = k; break; }
    }
    if (next < 0) break;
    fChain.push({ idx: next, node, level: step });
    cur = next;
  }

  let fHalted = false;
  for (const c of fChain) {
    if (fHalted) break;
    take(c.idx, c.level);
    // 代表记录不占额度（同向后那一轮）
    let acc = 0;
    for (let k = c.idx + 1; k < list.length; k += 1) {
      const t = list[k];
      if (!t || !t.from_id || !same(t.from_id, c.node)) continue;
      const amt = Math.abs(Number(t.amount) || 0);
      if (cap > 0 && acc + amt > cap) { fHalted = true; break; }
      take(k, c.level);
      acc += amt;
    }
  }

  // 向后：**两轮**（2026-11-03 用户重新梳理）
  //
  //   第一轮（链，每层只找一条）
  //     E-1 = 选中那笔「转出节点」作为**转入**的、之前最近一条记录
  //     E-2 = E-1 的「转出节点」作为转入的、在 E-1 之前的最近一条
  //     E-3 = E-2 的「转出节点」作为转入的、在 E-2 之前的最近一条 ……
  //
  //   第二轮（补齐，同层同号）
  //     每一层把「转入账户 == 该层代表记录的转入账户」的其它记录也标成同一层
  //     （只补这一层代表记录**之前**的，不会把未来的记录拉进来）
  let boundary = start;
  let node = list[start] && list[start].from_id;
  const chain = [];
  for (let level = 1; level <= depth && node; level += 1) {
    let found = -1;
    for (let k = boundary - 1; k >= 0; k -= 1) {
      const t = list[k];
      // 关键字是**最近**一条（下标最大），不是最早
      if (t && t.to_id && same(t.to_id, node)) { found = k; break; }
    }
    if (found < 0) break;
    chain.push({ idx: found, node, level });
    boundary = found;
    node = list[found].from_id;
  }

  // 第二轮：同层补齐 + **金额累计判定**（2026-11 用户加，随后修正）
  //
  //   每一层从代表记录往前补「转入同一账户」的记录，累计超过**选中那笔的发生额**就停。
  //
  //   两个容易写错的地方（2026-11-03 用户报「-2 累计的不够」就是这两条）：
  //     ① **代表记录本身不占额度**：它是这一层的锚，一定收；把它算进累计时，
  //        补任何一笔都会立刻超（own + amt > own），同层永远补不进第二条。
  //     ② **停止只作用于当前层**：-1 超限不该把 -2、-3 一起掐掉，
  //        每层是独立的，加起来超了只说明这一层到这里为止。
  for (const c of chain) {
    take(c.idx, -c.level);
    let sum = 0;
    for (let k = c.idx - 1; k >= 0; k -= 1) {
      const t = list[k];
      if (!t || !t.to_id || !same(t.to_id, c.node)) continue;
      const amt = Math.abs(Number(t.amount) || 0);
      if (cap > 0 && sum + amt > cap) break;
      take(k, -c.level);
      sum += amt;
    }
  }

  linkIndices.sort((a, b) => a - b);
  return { linkIndices, steps };
}

/**
 * 某个账户**直接相连**的线（点弧块用，**不递归**）。
 *
 * `side` 决定看哪一侧（2026-11 起由**节点类型**决定，不再有方向开关）：
 *
 *   'in'   流入它的线（to_id === id）    —— 费用类是终点，只看钱从哪来
 *   'out'  从它流出的线（from_id === id） —— 收入/权益是源头，只看钱往哪去
 *   'both' 两侧都算                       —— 资产/负债/成本是中转站，两头都是它的故事
 *
 * 兼容旧调用：'up' 等价于 'in'，'down' 等价于 'out'。
 */
export function traceByAccount(links, accountId, side) {
  const id = String(accountId || '');
  const mode = side === 'both'
    ? 'both'
    : (side === 'down' || side === 'out' ? 'out' : 'in');
  const out = [];
  for (let i = 0; i < (links || []).length; i++) {
    const l = links[i];
    if (!l) continue;
    const ok = mode === 'both'
      ? (l.from_id === id || l.to_id === id)
      : (mode === 'out' ? l.from_id === id : l.to_id === id);
    if (ok) out.push(i);
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
    // 成本类和资产类、负债类一样是「可以在中间倒手」的类型（存货 / 在产品）
    const movable = (t) => t === '资产类' || t === '负债类' || t === '成本类';
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
