// 界面：（无界面）同步窗口自适应：一张码能装多少天就装多少天
/**
 * 同步窗口（纯逻辑层）
 *
 * 设计（用户 2026-10-29）：
 *   选定一个截止日 → 从这天往前按**天**往里装流水，直到二维码装不下为止；
 *   最后一天放不下就整天不要（一日为单位截断）。
 *
 * 做法：把所有 ≤ 截止日的流水日期去重、倒序；对「从第 i 个日期到截止日」的
 * 窗口做二分（窗口越大、装得越多，URL 单调变长，tooDense 单调），找到最大的可行窗口。
 *
 * 容量由 core/sync-code.js 的 QR_MAX_URL 决定（packForQr 内部判断），
 * 这里只负责「找到能装满的那一天」。
 */

import { packForQr } from './sync-code.js';

const DAY_MS = 86400000;

/** 含两端的自然日天数 */
function spanDays(from, until) {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(until + 'T00:00:00');
  return Math.max(1, Math.round((b - a) / DAY_MS) + 1);
}

/**
 * @param {object} state 账本 state
 * @param {{base?:string, until:string, per?:number, maxCount?:number}} opts
 * @returns {Promise<{
 *   empty?:boolean, tooDense?:boolean,
 *   from:string, until:string, days:number,
 *   parts:Array, count:number
 * }>}
 */
export async function fitWindow(state, opts) {
  const o = opts || {};
  const base = String(o.base || '');
  const until = String(o.until || '');
  const per = Math.max(3, Math.min(200, Number(o.per) || 200));
  // 用户 2026-10-29：一张码目标 70 笔就够，别塞满整张
  const maxCount = Math.max(1, Number(o.maxCount) || 70);

  const txs = (state.transactions || []).filter(
    (t) => t && !t.opening && t.date && String(t.date) <= until,
  );
  if (!txs.length) {
    return { empty: true, from: until, until, days: 0, parts: [], count: 0 };
  }

  // 截止日之前有流水的日期，倒序（最近在前）
  const datesDesc = [...new Set(txs.map((t) => String(t.date)))].sort().reverse();

  const run = (idx) => packForQr(state, {
    base,
    until,
    days: spanDays(datesDesc[idx], until),
    per,
  });

  let lo = 0;
  let hi = datesDesc.length - 1;
  let best = -1;
  let bestR = null;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = await run(mid);
    const cnt = (r.parts || []).reduce((s, p) => s + (p.count || 0), 0);
    // 装不下有三种样子：URL 太长、被切成多张、超过 70 笔的软上限
    if (r.tooDense || (r.parts || []).length > 1 || cnt > maxCount) {
      hi = mid - 1;              // 从这天起就装不下了，只可能更近
    } else {
      best = mid;
      bestR = r;
      lo = mid + 1;              // 还能再往前装一天
    }
  }

  if (best < 0) {
    // 最近一天的量都装不下
    return { tooDense: true, from: datesDesc[0], until, days: 1, parts: [], count: 0 };
  }

  const from = datesDesc[best];
  const count = (bestR.parts || []).reduce((s, p) => s + (p.count || 0), 0);
  return { from, until, days: spanDays(from, until), parts: bestR.parts || [], count };
}
