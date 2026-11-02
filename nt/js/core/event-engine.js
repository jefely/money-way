// 界面：（无界面）事件引擎：节点 / 事件 / 双极性连线（事实层）
/**
 * 事件引擎（Event Engine）—— 事实层，只造事实，不算余额。
 * 层：第一层 · 数据基座
 *
 * 模型（v4.1 的落地版）：
 *
 *   Node  节点 —— 有极性（polarity: true=A / false=B）与统计分类
 *   Event 事件 —— 唯一事实源：原始文本 + 金额 + 状态 + 0..n 条连线
 *   Link  连线 —— { from, to, amount }：钱从 from 走到 to
 *
 * 三条铁律：
 *   ① 事件是事实，只增不改；要改就**再开一条逆向事件**（reverseEvent），
 *      原事件除了「作废」这个状态迁移之外，任何字段都不许动。
 *   ② **极性是节点的属性，不是连线的属性。** 这一点是本模型最容易被写错的地方：
 *      连线的两端各带自己的极性，所以 A→A / A→B / B→A / B→B 四种组合**都合法**。
 *      （v4.1 原文把连线写成恒定的「B极 → A极」，这是把「转出端/转入端」
 *      误标成了「B极/A极」—— 见 nt/EVENT-MODEL.md §2 的订正。）
 *   ③ 极性只是一个布尔值。类型（资产/费用/收入/负债/权益）只是极性的一种写法，
 *      由 polarityOfType() 一次性映射，**任何地方都不许再写 if (type === '资产类')**。
 *
 * 纯定义 + 纯函数：不碰 DOM / 存储 / 时钟，Node 可测。
 */

import { isIsoDate } from './format.js';
import { ACCOUNT_TYPE, isDebitType, makeId } from './schema.js';

/** A 极 = true（资金落地/消耗的终点）；B 极 = false（资金来源/被消耗的起点） */
export const POLARITY = { A: true, B: false };

/** 节点性质：普通账户 / 实物成本 / 未分类隔离舱 */
export const NODE_NATURE = {
  ACCOUNT: 'account',
  PHYSICAL: 'physical',
  UNCLASSIFIED: 'unclassified',
};

/** 事件状态：未归类（缓冲池）/ 已入账 / 已作废 */
export const EVENT_STATUS = {
  RAW: 'RAW',
  POSTED: 'POSTED',
  VOID: 'VOID',
};

/** 未分类隔离舱的固定 ID（匹配不到名字时兜底，不参与分类统计） */
export const UNCLASSIFIED_NODE_ID = '__UNCLASSIFIED__';

/** 金额统一两位小数。全模块唯一的取整口径，别在别处另写一套。 */
export function round2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * 账户类型 → 极性。资产类、费用类、成本类为 A 极（转入增加）；其余为 B 极。
 * 这层映射**只是** schema.js 的 DEBIT_TYPES 换一种说法，不再自己维护第二份名单
 * —— 加类型时只改 schema.js 一处，极性自动跟上。
 */
export function polarityOfType(type) {
  const t = String(type == null ? '' : type).trim();
  if (!t) return POLARITY.A; // 与 createAccount 的默认值（资产类）保持一致
  return isDebitType(t);
}

/* ---------- 节点 ---------- */

/**
 * 造一个节点。极性优先取显式 polarity，其次由 type 推导，最后默认 A 极。
 * 记录 polaritySource，是为了事后能回答「这个极性是人定的还是推出来的」。
 *
 * **成本类 = 实物成本池**（v4.1 §2.3 的建仓 / 折旧 / 平仓）：
 * 选了 type:'成本类' 就自动成为 physical，不用再填一遍 nature。
 *
 * 实物节点只存 originalCost（原值），**不存 residualValue（残值）** ——
 * 残值必须由 Events 现算（见 calc-engine 的 physicalBook）。
 * 存了它就是第二份事实，迟早和流水对不上。
 */
export function createNode(patch = {}) {
  const explicit = patch.polarity;
  const hasPolarity = explicit === true || explicit === false;
  const type = String(patch.type == null ? '' : patch.type).trim();
  const isCost = type === ACCOUNT_TYPE.COST;
  const nature = (patch.nature === NODE_NATURE.PHYSICAL || isCost)
    ? NODE_NATURE.PHYSICAL
    : patch.nature === NODE_NATURE.UNCLASSIFIED
      ? NODE_NATURE.UNCLASSIFIED
      : NODE_NATURE.ACCOUNT;

  const node = {
    id: patch.id || makeId('nd'),
    name: String(patch.name || '').trim(),
    polarity: hasPolarity ? explicit : polarityOfType(type),
    polaritySource: hasPolarity ? 'explicit' : type ? 'type' : 'default',
    category: String(patch.category || '').trim(),
    nature,
    isHidden: !!patch.isHidden,
  };

  if (type) node.type = type;
  if (patch.code) node.code = String(patch.code).trim().toUpperCase();
  if (patch.mergedInto) node.mergedInto = String(patch.mergedInto);

  if (nature === NODE_NATURE.PHYSICAL) {
    const cost = round2(patch.originalCost);
    node.originalCost = cost > 0 ? cost : 0;
    node.itemStatus = patch.itemStatus === 'disposed' ? 'disposed' : 'active';
    if (patch.purchasedOn && isIsoDate(patch.purchasedOn)) node.purchasedOn = patch.purchasedOn;
  }

  return node;
}

/** 数组或 Map → Map<id, node>。接受数组、Map、普通对象三种形态。 */
export function toNodeIndex(nodes) {
  if (nodes instanceof Map) return nodes;
  const map = new Map();
  if (Array.isArray(nodes)) {
    for (const n of nodes) if (n && n.id) map.set(n.id, n);
  } else if (nodes && typeof nodes === 'object') {
    for (const [id, n] of Object.entries(nodes)) if (n && typeof n === 'object') map.set(id, { id, ...n });
  }
  return map;
}

/**
 * 幽灵重定向：沿 mergedInto 一路走到还活着的那个节点。
 * 合并只在新节点上写一行 mergedInto，历史流水一个字都不改。
 *
 * 环（A→B→A）的处理是「**环上所有节点收敛到同一个代表**」（取字典序最小）。
 * 不能遇到环就各自停在自己身上 —— 那样 a 会解析成 b、b 解析成 a，
 * 一条 a→b 的连线立刻变成自环还查不出来，余额还会被两边各记一次。
 * @returns {string|null} 解析后的节点 ID；节点不存在返回 null
 */
export function resolveNodeId(id, nodes) {
  const index = toNodeIndex(nodes);
  const start = index.get(id);
  if (!start) return null;

  const seen = [];
  let cur = start;
  for (let hops = 0; cur.mergedInto && hops < 64; hops += 1) {
    const next = index.get(cur.mergedInto);
    if (!next) return cur.id;
    const at = seen.indexOf(next.id);
    if (at >= 0) {
      const ring = seen.slice(at).concat([cur.id]);
      ring.sort();
      return ring[0];
    }
    seen.push(cur.id);
    cur = next;
  }
  return cur.id;
}

/**
 * 合并节点（幽灵重定向）：废弃 fromId，指到 intoId。
 * 不删节点、不动流水 —— 删了历史就没法解释了。
 */
export function mergeNode(nodes, fromId, intoId) {
  const list = Array.isArray(nodes) ? nodes : [...toNodeIndex(nodes).values()];
  const fresh = list.map((n) => ({ ...n }));
  if (!fromId || !intoId || fromId === intoId) return fresh;
  const exists = new Set(fresh.map((n) => n.id));
  if (!exists.has(fromId) || !exists.has(intoId)) return fresh;
  return fresh.map((n) => (n.id === fromId
    ? { ...n, mergedInto: intoId, isHidden: true }
    : n));
}

/* ---------- 连线 ---------- */

/**
 * 造一条连线。金额恒为正数 —— 方向由 from / to 表达，不由正负号表达。
 * 一条连线**自带平衡**：钱从 from 出多少，to 就进多少。
 * 复式记账的「借贷平衡」在这个模型里因此不是额外校验，而是结构本身。
 */
export function createLink(patch = {}) {
  return {
    from: patch.from ? String(patch.from) : '',
    to: patch.to ? String(patch.to) : '',
    amount: Math.abs(round2(patch.amount)),
    ...(patch.note ? { note: String(patch.note) } : {}),
    ...(patch.kind ? { kind: String(patch.kind) } : {}),
  };
}

/* ---------- 事件 ---------- */

/**
 * 造一条事件。amount 没给就由连线合计反推（拆分场景天然对得上）。
 * links 一律走 createLink 归一，外部传进来的脏数据不会污染事实层。
 */
export function createEvent(patch = {}) {
  const links = Array.isArray(patch.links) ? patch.links.map((l) => createLink(l)) : [];
  const total = round2(links.reduce((s, l) => s + l.amount, 0));
  const given = round2(patch.amount);
  const amount = given > 0 ? given : total;

  return {
    id: patch.id || makeId('ev'),
    date: String(patch.date || ''),
    amount,
    status: Object.values(EVENT_STATUS).includes(patch.status) ? patch.status : EVENT_STATUS.RAW,
    note: String(patch.note || ''),
    rawText: String(patch.rawText || ''),
    links,
    ...(patch.reverses ? { reverses: String(patch.reverses) } : {}),
    ...(patch.voidReason ? { voidReason: String(patch.voidReason) } : {}),
    ...(patch.opening ? { opening: true } : {}),
  };
}

/** 一条事件里还没分配到连线上的钱（RAW 事件等于全额）。 */
export function unallocatedOf(event) {
  const e = event || {};
  const links = Array.isArray(e.links) ? e.links : [];
  const total = round2(links.reduce((s, l) => s + round2(l && l.amount), 0));
  return round2(round2(e.amount) - total);
}

/* ---------- 校验 ---------- */

/**
 * 校验一条事件。返回**全部**问题，不是遇到第一个就返回 ——
 * 录入界面要一次把所有错都摆出来。
 *
 * 只校验事实层：日期、金额、状态、连线端点、连线合计。
 * 余额对不对是 calc-engine 的事，这里不掺和。
 * @returns {{ok:boolean, problems:Array<{code:string,message:string,linkIndex?:number}>, total:number, unallocated:number}}
 */
export function validateEvent(event, nodes) {
  const problems = [];
  const add = (code, message, extra) => problems.push({ code, message, ...(extra || {}) });
  const e = event || {};
  const index = toNodeIndex(nodes);

  if (!e.id) add('E_NO_ID', '事件没有 id');
  if (!isIsoDate(e.date)) add('E_BAD_DATE', `日期不是合法的 YYYY-MM-DD：${e.date}`);
  if (!(round2(e.amount) > 0)) add('E_BAD_AMOUNT', `事件金额必须为正：${e.amount}`);
  if (!Object.values(EVENT_STATUS).includes(e.status)) add('E_BAD_STATUS', `未知状态：${e.status}`);

  const links = Array.isArray(e.links) ? e.links : [];
  if (e.status === EVENT_STATUS.POSTED && links.length === 0) {
    add('E_NO_LINKS', '已入账事件必须至少有一条连线');
  }

  links.forEach((link, i) => {
    const l = link || {};
    const no = i + 1;
    if (!(round2(l.amount) > 0)) add('E_LINK_AMOUNT', `第 ${no} 条连线金额必须为正`, { linkIndex: i });
    if (!l.from || !l.to) {
      add('E_LINK_OPEN', `第 ${no} 条连线缺端点（${l.from || '?'} → ${l.to || '?'}）`, { linkIndex: i });
      return;
    }
    const from = resolveNodeId(l.from, index);
    const to = resolveNodeId(l.to, index);
    if (!from) add('E_UNKNOWN_NODE', `第 ${no} 条连线的转出节点不存在：${l.from}`, { linkIndex: i });
    else if (!to) add('E_UNKNOWN_NODE', `第 ${no} 条连线的转入节点不存在：${l.to}`, { linkIndex: i });
    else if (from === to) add('E_SELF_LINK', `第 ${no} 条连线的两端是同一个节点：${from}`, { linkIndex: i });
  });

  const total = round2(links.reduce((s, l) => s + round2(l && l.amount), 0));
  const unallocated = round2(round2(e.amount) - total);
  if (e.status === EVENT_STATUS.POSTED && links.length && Math.abs(unallocated) >= 0.005) {
    add('E_UNALLOCATED', `连线合计 ${total} 与事件金额 ${round2(e.amount)} 差 ${unallocated}`);
  }

  return { ok: problems.length === 0, problems, total, unallocated };
}

/** 整本账一次校验完；返回按事件分组的问题清单。 */
export function validateEvents(events, nodes) {
  const items = [];
  for (const ev of events || []) {
    const r = validateEvent(ev, nodes);
    if (!r.ok) items.push({ eventId: ev && ev.id, problems: r.problems });
  }
  return { ok: items.length === 0, items, badCount: items.length };
}

/* ---------- 状态迁移（不修改原对象） ---------- */

/** RAW → POSTED：归类完成后把缓冲池里的半成品正式入账。 */
export function postEvent(event, links) {
  const base = createEvent(event);
  const added = Array.isArray(links) ? links.map((l) => createLink(l)) : [];
  return {
    ...base,
    status: EVENT_STATUS.POSTED,
    links: added.length ? [...base.links, ...added] : base.links,
  };
}

/** 作废：只改状态、留下理由，连线和内容一个字都不删。 */
export function voidEvent(event, reason = '') {
  return {
    ...createEvent(event),
    status: EVENT_STATUS.VOID,
    voidReason: String(reason || ''),
  };
}

/**
 * 拆一分多：一条事件追加多条连线（超市 500 → 食品 300 / 日用 150 / 其它 50）。
 * @param {object} event
 * @param {Array<{from?:string,to:string,amount:number}>} parts
 * @param {{from?:string}} [opts] 未写 from 的片段默认从 opts.from 出
 */
export function splitEvent(event, parts, opts = {}) {
  const base = createEvent(event);
  const fallback = (opts && opts.from) || '';
  const added = (parts || []).map((p) => createLink({
    from: (p && p.from) || fallback,
    to: p && p.to,
    amount: p && p.amount,
  }));
  return { ...base, links: [...base.links, ...added] };
}

/**
 * 逆向事件（退款 / 冲销）：连线两端对调，生成**新**事件并指向原事件。
 * 原事件完全不动 —— 这是「流水事实不可丢失」那条底线的唯一合法实现方式。
 * @param {object} event 原事件
 * @param {{id?:string,date?:string,note?:string,status?:string}} [opts]
 */
export function reverseEvent(event, opts = {}) {
  const src = createEvent(event);
  const links = src.links.map((l) => createLink({ from: l.to, to: l.from, amount: l.amount }));
  return {
    ...src,
    id: (opts && opts.id) || makeId('ev'),
    date: (opts && opts.date) || src.date,
    note: (opts && opts.note) || `冲销 ${src.note || src.id}`,
    status: (opts && opts.status) || EVENT_STATUS.POSTED,
    links,
    reverses: src.id,
  };
}
