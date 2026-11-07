// 界面：（无界面）旧账本 → 事件模型的单向投影（只读）
/**
 * 账本适配器（Ledger Adapter）—— `accounts` / `transactions` → `nodes` / `events`。
 * 层：第一层 · 数据基座
 *
 * 只读：不修改 state、不改写流水、不生成新 id。投影出来的都是**新**对象：
 * 与旧账本共享同一些事实，不共享引用。
 *
 * 为什么要有它（EVENT-MODEL.md §10 第 2 条）：
 *   「事件引擎算得对」和「事件引擎能重算出这本旧账」是两件事。
 *   后者需要一个**无损投影**：每条流水对得上一条事件，每个账户对得上一个节点，
 *   然后把 `auditBook()` 与 `balanceOf()` 逐账户比一遍。
 *   差额为 0，才谈得上把新引擎接到产品上。
 *
 * 三条口径，都是**复刻旧模型**，不是重新设计：
 *   ① 极性 = `isDebitType(account.type)`，显式传给 createNode；
 *   ② `status:'draft'` 的流水 → RAW 事件（缓冲池，不进余额）；
 *   ③ 断链 / 自环 / 零额 / 负额 / 非 ISO 日期 —— **原样投影，只记一条 issue**。
 *      不补值、不丢弃、不猜测。补一个端点就是替用户编事实。
 *
 * ⚠ 已知口径分歧：空类型账户
 *   `core/balance-calculator.js` 的 `balanceOf()` 用 `isDebitType('')` → false，
 *   空类型按 **B 极**算；而 `event-engine.polarityOfType('')` 默认 **A 极**
 *   （对齐 `createAccount` 的默认资产类）。旧账里 U 区（未分类）账户的 type
 *   就是空串 —— 适配器必须显式传 polarity，否则同一个账户在新旧两套算法里
 *   会给出相反的符号。这里选 B 极，因为对账的对象是**旧模型的既有结果**。
 */

import { isDebitType, isPosted } from './schema.js';
import { isIsoDate } from './format.js';
import {
  EVENT_STATUS, createEvent, createLink, createNode, round2,
} from './event-engine.js';
import { balanceOf } from './balance-calculator.js';
import { auditBook, balanceOfNode } from './calc-engine.js';

/** 投影异常的代码表。它们是**报告项**，不是失败 —— 旧账里本来就有这些情况。 */
export const ADAPT_ISSUE = {
  NO_ID: 'NO_ID',
  NO_FROM: 'NO_FROM',
  NO_TO: 'NO_TO',
  UNKNOWN_FROM: 'UNKNOWN_FROM',
  UNKNOWN_TO: 'UNKNOWN_TO',
  SELF_LINK: 'SELF_LINK',
  ZERO_AMOUNT: 'ZERO_AMOUNT',
  NEGATIVE_AMOUNT: 'NEGATIVE_AMOUNT',
  BAD_DATE: 'BAD_DATE',
  UNTYPED_ACCOUNT: 'UNTYPED_ACCOUNT',
  DUP_ACCOUNT: 'DUP_ACCOUNT',
};

const issue = (code, detail, extra) => ({ code, detail, ...(extra || {}) });

/**
 * 账户 → 节点。重复 id 按**后出现者覆盖**（与 `indexAccounts` 一致）。
 * @returns {{nodes:Array, issues:Array}}
 */
export function adaptAccounts(accounts) {
  const map = new Map();
  const issues = [];

  for (const acc of accounts || []) {
    if (!acc || !acc.id) continue;
    const type = String(acc.type == null ? '' : acc.type).trim();
    const node = createNode({
      id: acc.id,
      name: acc.name,
      type,
      category: acc.category,
      code: acc.code,
      isHidden: !!acc.isHidden,
      nature: acc.nature,
      originalCost: acc.originalCost,
      itemStatus: acc.itemStatus,
      // 显式给极性：见文件头的「空类型账户」分歧。不传就会退回 polarityOfType('') = A 极。
      polarity: isDebitType(type),
    });

    // 空类型在节点上留个记号，统计/报表据此把它归到 U 区；但极性已经定了，不再改。
    if (!type) node.untyped = true;
    if (map.has(acc.id)) issues.push(issue(ADAPT_ISSUE.DUP_ACCOUNT, `账户 id 重复：${acc.id}`, { accountId: acc.id }));
    map.set(acc.id, node);
  }

  return { nodes: [...map.values()], issues };
}

/**
 * 流水 → 事件。
 * @param {object} tx 一条旧流水
 * @param {Map<string,object>} index 账户 id → 节点
 * @returns {{event:Object, issues:Array}}
 */
export function adaptTransaction(tx, index) {
  const src = tx || {};
  const nodes = index instanceof Map ? index : new Map();
  const issues = [];
  const id = String(src.id || '');
  const date = String(src.date || '');
  const rawAmount = Number(src.amount);
  const amount = round2(Number.isFinite(rawAmount) ? rawAmount : 0);
  const draft = !isPosted(src);

  if (!id) issues.push(issue(ADAPT_ISSUE.NO_ID, '流水缺 id，事件 id 是空串'));
  if (!isIsoDate(date)) issues.push(issue(ADAPT_ISSUE.BAD_DATE, `日期不是 YYYY-MM-DD：${date}`, { txId: id }));
  if (amount === 0) issues.push(issue(ADAPT_ISSUE.ZERO_AMOUNT, '金额为 0，不进任何余额', { txId: id }));
  if (amount < 0) {
    issues.push(issue(ADAPT_ISSUE.NEGATIVE_AMOUNT,
      `金额 ${amount} 为负，事件模型只存正数（按 ${Math.abs(amount)} 投影）`, { txId: id }));
  }

  const links = [];
  if (!draft) {
    const from = String(src.from_id || '');
    const to = String(src.to_id || '');
    if (!from) issues.push(issue(ADAPT_ISSUE.NO_FROM, '已入账流水缺转出方', { txId: id }));
    if (!to) issues.push(issue(ADAPT_ISSUE.NO_TO, '已入账流水缺转入方', { txId: id }));
    if (from && to && from === to) issues.push(issue(ADAPT_ISSUE.SELF_LINK, '两端是同一个账户', { txId: id }));
    if (from && !nodes.has(from)) issues.push(issue(ADAPT_ISSUE.UNKNOWN_FROM, `转出账户不存在：${from}`, { txId: id }));
    if (to && !nodes.has(to)) issues.push(issue(ADAPT_ISSUE.UNKNOWN_TO, `转入账户不存在：${to}`, { txId: id }));
    links.push(createLink({ from, to, amount: Math.abs(amount) }));
  }

  const event = createEvent({
    id,
    date,
    amount: Math.abs(amount),
    status: draft ? EVENT_STATUS.RAW : EVENT_STATUS.POSTED,
    note: src.note,
    rawText: draft ? String(src.note || '') : '',
    opening: !!src.opening,
    links,
  });

  // 溯源字段：事件模型不解释它们，但丢了它们就答不出「这条事件对应哪条流水」。
  event.source = {
    seq: Number(src.seq) || 0,
    draft,
    ...(src.opening ? { opening: true } : {}),
    ...(src.inst ? { inst: true } : {}),
    ...(src.refund ? { refund: true } : {}),
    ...(src.planKey ? { planKey: String(src.planKey) } : {}),
  };

  return { event, issues };
}

/**
 * 一整本账（`{accounts, transactions}`）→ `{nodes, events, issues, audit, stats}`。
 * `audit` 是 `auditBook()` 的原样结果 —— 结构、双式恒等、缓冲池、断链一次给全。
 */
export function adaptBook(book) {
  const src = book || {};
  const accounts = adaptAccounts(src.accounts);
  const index = new Map(accounts.nodes.map((n) => [n.id, n]));
  const events = [];
  const issues = accounts.issues.slice();

  for (const tx of src.transactions || []) {
    const one = adaptTransaction(tx, index);
    events.push(one.event);
    issues.push(...one.issues);
  }

  const drafts = events.filter((e) => e.status === EVENT_STATUS.RAW).length;
  return {
    nodes: accounts.nodes,
    events,
    issues,
    // 原始账本的引用：compareBalances 要拿它跟新结果逐账户比。
    // 只读，不复制 —— 复制一份就等于承认「对账用的不是这本账」。
    legacy: {
      accounts: src.accounts || [],
      transactions: src.transactions || [],
    },
    audit: auditBook(accounts.nodes, events),
    stats: {
      accounts: accounts.nodes.length,
      transactions: (src.transactions || []).length,
      events: events.length,
      posted: events.length - drafts,
      drafts,
    },
  };
}

/**
 * 逐账户对账：旧 `balanceOf()` 与新 `balanceOfNode()` 的差。
 *
 * 每行 `delta = 新 − 旧`，`ok` 是 |delta| < 0.005（半分钱）。
 * 全部 ok + `audit.doubleEntry.diff === 0`，才是「这本账接得住」。
 *
 * @returns {{rows:Array, mismatched:Array, count:number, maxDelta:number}}
 */
export function compareBalances(book, nodes, events) {
  const index = new Map((nodes || []).map((n) => [n.id, n]));
  const legacy = (book && book.legacy) || book || {};
  const list = legacy.accounts || [];
  const rows = [];

  for (const acc of list) {
    if (!acc || !acc.id) continue;
    const node = index.get(acc.id);
    if (!node) continue;
    const oldBal = round2(balanceOf(acc, legacy.transactions).balance);
    const next = round2(balanceOfNode(node, events, nodes).balance);
    const delta = round2(next - oldBal);
    rows.push({
      id: acc.id,
      name: acc.name || '',
      type: acc.type || '',
      legacy: oldBal,
      next,
      delta,
      ok: Math.abs(delta) < 0.005,
    });
  }

  const mismatched = rows.filter((r) => !r.ok);
  const maxDelta = rows.reduce((m, r) => Math.max(m, Math.abs(r.delta)), 0);
  return { rows, mismatched, count: rows.length, maxDelta };
}

/**
 * 全部账本（活动账本 + `state.ledgers` 快照）→ 适配结果数组。
 * 活动账本排第一；`active` 标出哪本是当前打开的。
 */
export function adaptState(state) {
  const s = state || {};
  const names = s.ledgerNames || {};
  const activeId = String(s.activeLedger || 'main');
  const out = [{
    id: activeId,
    name: names[activeId] || '主账本',
    active: true,
    ...adaptBook({ accounts: s.accounts, transactions: s.transactions }),
  }];

  for (const [id, book] of Object.entries(s.ledgers || {})) {
    if (!book || id === activeId) continue;
    out.push({ id, name: names[id] || id, active: false, ...adaptBook(book) });
  }
  return out;
}

/**
 * 全线体检摘要：每本账一行，够校验页直接摆出来。
 * `ok` 要求三件事同时成立：结构无误、双式恒等 `diff = 0`、逐账户与旧算法无差。
 */
export function auditAll(state) {
  return adaptState(state).map((book) => {
    const cmp = compareBalances(book, book.nodes, book.events);
    const diff = book.audit.doubleEntry.diff;
    return {
      id: book.id,
      name: book.name,
      active: book.active,
      ...book.stats,
      diff,
      dangling: book.audit.dangling,
      pending: book.audit.pending.count,
      mismatched: cmp.mismatched.length,
      maxDelta: cmp.maxDelta,
      issues: book.issues.length,
      ok: book.audit.ok && cmp.mismatched.length === 0,
    };
  });
}
