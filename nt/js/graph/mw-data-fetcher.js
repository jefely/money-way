// 界面：（无界面）路径图数据抓取
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

/* ============================================================
   切片规则（2026-10 按单文件版对齐）
   ------------------------------------------------------------
   单文件版的 mwDrawSvg 是「有多少笔画多少笔」：
   · 不做 Top N 折叠（我们的「折叠 145」是自创的，它没有）
   · 不做「小于总额 1.5% 的弦不画」的阈值
   · 保留单边流水（只填了一侧也画，那一端留空接口）
   之前那套折叠 + 阈值会把大量小额流水吞掉，图上的弧块数量与角度
   跟单文件版对不上 —— 这就是「计算不对」的来源。
   ============================================================ */

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

  /* ---------- ② 总额（统计用） ---------- */
  let total = 0;
  for (const x of picked) total += x.amount;

  return { txs: picked, total, folded: 0, dropped: 0 };
}
