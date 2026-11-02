// 界面：（无界面）计算引擎：余额 / 双式恒等 / 实物成本台账
/**
 * 计算引擎（Calc Engine）—— 解释层，只从事实算数，不产生事实。
 * 层：第一层 · 数据基座
 *
 * 一条公式统管全部余额（v4.1 §1.2）：
 *
 *     余额 = polarity ? (转入 − 转出) : (转出 − 转入)
 *
 * 账本里没有「资产/负债/收入/费用」的判断，只有那个布尔值。
 * 五个账户类型早在 event-engine 的 polarityOfType() 里就被压缩掉了。
 *
 * 复式恒等式在这个模型里退化成一行：
 *
 *     Σ(A 极余额) = Σ(B 极余额)
 *
 * 它与 validate.js 的「资产 + 成本 + 费用 = 负债 + 权益 + 收入」**完全等价** ——
 * 前者是后者的展开式（A 极 = 资产 + 成本 + 费用，B 极 = 负债 + 权益 + 收入）。
 * 所以这条检查既是新模型的自洽证明，
 * 也是旧账本可以直接拿来验的既有恒等式。
 *
 * 纯函数：不碰 DOM / 存储 / 时钟，Node 可测。
 */

import {
  EVENT_STATUS,
  NODE_NATURE,
  round2,
  toNodeIndex,
  resolveNodeId,
  validateEvents,
} from './event-engine.js';
import { ACCOUNT_TYPE } from './schema.js';

/** 只有 POSTED 的事件参与计算。RAW 是缓冲池，VOID 是作废，两者都不动余额。 */
export function postableEvents(events) {
  return (events || []).filter((e) => e
    && e.status === EVENT_STATUS.POSTED
    && Array.isArray(e.links)
    && e.links.length > 0);
}

/** 还躺在缓冲池里、没归类的半成品（v4.1 §2.1「备注即缓冲」）。 */
export function pendingEvents(events) {
  return (events || []).filter((e) => e && e.status === EVENT_STATUS.RAW);
}

/**
 * 全量余额。返回 Map<id, row>，row 里带着节点、进出、余额。
 *
 * 合并过的节点（mergedInto）不会被写入 —— 指向它的连线在解析时
 * 已经被重定向到目标的 ID，所以它的余额天然是 0，不必特判。
 *
 * @param {Array|Map|object} nodes
 * @param {Array} events
 * @returns {{rows:Map<string,object>, list:Array<object>, index:Map<string,object>}}
 */
export function computeBalances(nodes, events) {
  const index = toNodeIndex(nodes);
  const rows = new Map();

  for (const node of index.values()) {
    rows.set(node.id, {
      id: node.id,
      node,
      polarity: node.polarity === true,
      inflow: 0,
      outflow: 0,
      balance: 0,
    });
  }

  for (const ev of postableEvents(events)) {
    for (const link of ev.links) {
      const amt = round2(link && link.amount);
      if (!(amt > 0)) continue;
      const fromId = resolveNodeId(link.from, index);
      const toId = resolveNodeId(link.to, index);
      const fromRow = fromId ? rows.get(fromId) : null;
      const toRow = toId ? rows.get(toId) : null;
      if (fromRow) fromRow.outflow = round2(fromRow.outflow + amt);
      if (toRow) toRow.inflow = round2(toRow.inflow + amt);
    }
  }

  const list = [];
  for (const row of rows.values()) {
    row.inflow = round2(row.inflow);
    row.outflow = round2(row.outflow);
    row.balance = row.polarity
      ? round2(row.inflow - row.outflow)
      : round2(row.outflow - row.inflow);
    list.push(row);
  }

  return { rows, list, index };
}

/**
 * 单节点余额（口径与 balance-calculator.js 的 balanceOf 完全一致）。
 *
 * 第三个参数是**全量节点表**：节点被合并过时必须传，
 * 否则解析不出 mergedInto 的目标，旧 ID 会自己给自己记一笔余额。
 * 极性取**解析后**那个节点的，不是传进来那个 —— 合并到不同极性的节点上时，
 * 该按新的算。
 */
export function balanceOfNode(node, events, nodes) {
  const zero = { balance: 0, inflow: 0, outflow: 0 };
  if (!node || !node.id) return zero;

  const index = nodes ? toNodeIndex(nodes) : toNodeIndex([node]);
  const target = resolveNodeId(node.id, index);
  if (!target) return zero;
  const real = index.get(target) || node;

  let inflow = 0;
  let outflow = 0;
  for (const ev of postableEvents(events)) {
    for (const link of ev.links) {
      const amt = round2(link && link.amount);
      if (!(amt > 0)) continue;
      if (resolveNodeId(link.from, index) === target) outflow = round2(outflow + amt);
      if (resolveNodeId(link.to, index) === target) inflow = round2(inflow + amt);
    }
  }

  const balance = real.polarity === true
    ? round2(inflow - outflow)
    : round2(outflow - inflow);
  return { balance, inflow, outflow };
}

/**
 * 双式恒等：Σ(A 极余额) − Σ(B 极余额) = 0。
 *
 * 这是本模型唯一的全局平衡约束，也是「所有节点余额都由 Events + Polarity
 * 重算出来」这句话的可执行形式 —— 只要有两端，差额就落不到别处去。
 */
export function doubleEntryCheck(nodes, events) {
  const { list } = computeBalances(nodes, events);
  let aTotal = 0;
  let bTotal = 0;
  const unbalanced = [];

  for (const row of list) {
    if (row.polarity) aTotal += row.balance;
    else bTotal += row.balance;
    if (Math.abs(row.balance) >= 0.005 && !Number.isFinite(row.balance)) {
      unbalanced.push(row.id);
    }
  }

  aTotal = round2(aTotal);
  bTotal = round2(bTotal);
  const diff = round2(aTotal - bTotal);
  return {
    aTotal,
    bTotal,
    diff,
    ok: Math.abs(diff) < 0.005,
    /** 余额不是有限数的节点（NaN / Infinity），出现即数据损坏 */
    broken: unbalanced,
  };
}

/**
 * 实物成本台账（v4.1 §2.3「建仓 / 折旧 / 平仓」）。
 *
 * 残值**不存**在节点上，每次都由流水现算：
 *   建仓   银行卡 → 实物_电脑    → 实物 balance += 10000（费用不增加）
 *   折旧   实物_电脑 → 折旧费用  → 实物 balance -= 2000（沉没成本落到费用）
 *   平仓   实物_手机 → 银行卡 3000 + 处置损益 2000 → 实物 balance 归零
 *
 * 原值优先取节点上的 originalCost；没填就**拿累计转入推断** ——
 * 买电脑那 10000 的流水本身就是原值的证据，不该逼用户再抄一遍。
 * costSource 会说明这次用的是哪一个，别让「推断」冒充「事实」。
 *
 * @returns {{id:string,name:string,originalCost:number,accumulated:number,
 *            residual:number,costSource:'field'|'inferred',itemStatus:string,
 *            disposed:boolean,overConsumed:boolean}}
 */
export function physicalBook(node, events, nodes) {
  const src = node || {};
  const row = balanceOfNode(src, events, nodes);
  const declared = round2(src.originalCost);
  const originalCost = declared > 0 ? declared : round2(row.inflow);
  const residual = round2(row.balance);
  const accumulated = round2(originalCost - residual);

  return {
    id: src.id,
    name: src.name || '',
    originalCost,
    accumulated,
    residual,
    costSource: declared > 0 ? 'field' : 'inferred',
    itemStatus: src.itemStatus || 'active',
    // 从没建过仓的成本类账户（原值 0）不算「已处置」
    disposed: src.itemStatus === 'disposed' || (originalCost > 0 && Math.abs(residual) < 0.005),
    /** 消耗超过原值：多半是漏记了建仓，或者把别的钱记到了这个节点上 */
    overConsumed: accumulated > originalCost + 0.005,
  };
}

/**
 * 全部实物节点的台账，按已消耗降序 —— 报表里最该先看的就是快耗光的那几台。
 * 成本类账户一定收进来（哪怕它没有 nature 字段，旧数据就是这样）；
 * 别的类型只要标了 physical 也收。
 */
export function physicalBooks(nodes, events) {
  const list = Array.isArray(nodes) ? nodes : [...toNodeIndex(nodes).values()];
  return list
    .filter((n) => n && !n.mergedInto && (n.nature === NODE_NATURE.PHYSICAL || n.type === ACCOUNT_TYPE.COST))
    .map((n) => physicalBook(n, events, list))
    .sort((a, b) => b.accumulated - a.accumulated);
}

/**
 * 某个节点的进出明细。合并过的老 ID 也能查到（先重定向再比）。
 * @returns {Array<{event:object,link:object,direction:'in'|'out',amount:number}>}
 */
export function nodeFlows(nodeId, nodes, events) {
  const index = toNodeIndex(nodes);
  const target = resolveNodeId(nodeId, index);
  const out = [];
  if (!target) return out;

  for (const ev of postableEvents(events)) {
    for (const link of ev.links) {
      const amt = round2(link && link.amount);
      if (!(amt > 0)) continue;
      if (resolveNodeId(link.from, index) === target) out.push({ event: ev, link, direction: 'out', amount: amt });
      if (resolveNodeId(link.to, index) === target) out.push({ event: ev, link, direction: 'in', amount: amt });
    }
  }
  return out;
}

/** 时间切片：闭区间 [start, end]，任一为空表示不设限。 */
export function eventsInRange(events, start, end) {
  const lo = String(start || '0000-00-00');
  const hi = String(end || '9999-12-31');
  return (events || []).filter((e) => {
    const d = String((e && e.date) || '');
    return d >= lo && d <= hi;
  });
}

/** 把已知事实之外的差额算出来：事件里链接不到节点的钱，不会凭空消失，必须报出来。 */
export function danglingAmount(nodes, events) {
  const index = toNodeIndex(nodes);
  let total = 0;
  for (const ev of postableEvents(events)) {
    for (const link of ev.links) {
      const amt = round2(link && link.amount);
      if (!(amt > 0)) continue;
      if (!resolveNodeId(link.from, index) || !resolveNodeId(link.to, index)) total += amt;
    }
  }
  return round2(total);
}

/**
 * 一次体检：结构 + 双式恒等 + 缓冲池 + 断链金额。
 * 界面上的「校验」页只需要这一个入口。
 */
export function auditBook(nodes, events) {
  const shape = validateEvents(events, nodes);
  const doubleEntry = doubleEntryCheck(nodes, events);
  const pending = pendingEvents(events);
  const pendingTotal = round2(pending.reduce((s, e) => s + round2(e && e.amount), 0));
  const dangling = danglingAmount(nodes, events);

  return {
    ok: shape.ok && doubleEntry.ok && Math.abs(dangling) < 0.005,
    shape,
    doubleEntry,
    pending: { count: pending.length, amount: pendingTotal },
    dangling,
  };
}
