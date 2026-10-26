/**
 * 图数据切片器
 * 层：第三层 · Money Way 数学引擎
 *
 * 从全量数据里切出「这张图要画的那批单笔流水」：
 *   · 按区间筛日期
 *   · 过滤 __OPENING__ 虚拟账户
 *   · 按配置决定是否保留「资产 → 资产」的内部转账
 *   · Top N 账户折叠成「其它」，并滤掉过小的弦
 *
 * **只认 ID**（`from_id` / `to_id`）—— 流水里根本没有名字字段。
 * 输出是干净的单笔流水列表，保留单边流水（那一端为空），供 ☐7 消费。
 *
 * 验收：折叠后总额守恒（Σ 原边 = Σ 折叠后边，误差 < 0.005）。
 */

import { OPENING_ACCOUNT_ID, ACCOUNT_TYPE } from '../core/schema.js';

export const OTHER_NODE = '其它';
export const MIN_EDGE_RATIO = 0.015;   // 小于总额 1.5% 的弦不画

/**
 * @param {{transactions:Array, accounts:Array, range:{start:string,end:string},
 *          showInternal?:boolean, topN?:number}} input
 * @returns {{txs:Array, total:number, folded:number, dropped:number}}
 */
export function fetchGraphData(input) {
  const txs = (input && input.transactions) || [];
  const accounts = (input && input.accounts) || [];
  const range = (input && input.range) || {};
  const showInternal = !(input && input.showInternal === false);
  const topN = Math.max(1, Number((input && input.topN) || 12));

  // 账户表：id → 账户（类型判定只认 id）
  const accById = new Map();
  for (const a of accounts) {
    if (a && a.id) accById.set(a.id, a);
  }
  const typeOf = (id) => {
    const a = accById.get(id);
    return a ? a.type : '其它';
  };

  /* ---------- ① 区间 + 有效性过滤 ---------- */
  const picked = [];
  for (const t of txs) {
    if (!t) continue;
    const d = String(t.date || '');
    if (!d) continue;
    if (range.start && d < range.start) continue;
    if (range.end && d > range.end) continue;

    const from = t.from_id || '';
    const to = t.to_id || '';
    if (!from && !to) continue;
    // 期初流水不参与环网图（它是背景板，不是资金流动）
    if (from === OPENING_ACCOUNT_ID || to === OPENING_ACCOUNT_ID) continue;

    if (!showInternal
        && typeOf(from) === ACCOUNT_TYPE.ASSET
        && typeOf(to) === ACCOUNT_TYPE.ASSET) continue;

    picked.push({
      id: t.id,
      date: d,
      from_id: from,
      to_id: to,
      amount: Number(t.amount) || 0,
      typeFrom: typeOf(from),
      typeTo: typeOf(to),
    });
  }

  /* ---------- ② 总额（1.5% 阈值基准） ---------- */
  let total = 0;
  for (const x of picked) total += x.amount;

  /* ---------- ③ Top N 折叠：按「该账户参与的金额之和」排序 ---------- */
  const weight = new Map();
  for (const x of picked) {
    if (x.from_id) weight.set(x.from_id, (weight.get(x.from_id) || 0) + x.amount);
    if (x.to_id) weight.set(x.to_id, (weight.get(x.to_id) || 0) + x.amount);
  }
  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  const keep = new Set(ranked.slice(0, topN));

  const out = [];
  let folded = 0;
  for (const x of picked) {
    const from = keep.has(x.from_id) ? x.from_id : OTHER_NODE;
    const to = keep.has(x.to_id) ? x.to_id : OTHER_NODE;
    if (from === to) { folded += 1; continue; }      // 两端都被折叠 → 自环，丢
    if (from !== x.from_id || to !== x.to_id) folded += 1;
    out.push({ ...x, from_id: from, to_id: to });
  }

  /* ---------- ④ 过小的弦丢掉（避免糊成一团） ---------- */
  const minEdge = total * MIN_EDGE_RATIO;
  const kept = out.filter((x) => x.amount >= minEdge);
  const dropped = out.length - kept.length;

  return { txs: kept, total, folded, dropped };
}
