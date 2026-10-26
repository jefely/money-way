/**
 * 视图模型：把 state 变成「列表要的行」和「页脚要的数字」。
 *
 * 纯函数（公约 3.2）：只吃 state，不碰 DOM，不写回。
 */

import { money, moneyAlways, moneyOrBlank, shortDate } from '../core/format.js';
import { toAmount } from '../core/stats.js';

/** 流水 → 渲染行。排序：seq 升序（与旧版一致）。 */
export function buildFlowRows(state) {
  const rows = (state.transactions || []).slice()
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));

  return rows.map((t) => ({
    id: t.id,
    seq: Number(t.seq) || 0,
    // 编辑框里用「可编辑的原始值」，展示用「算好的文本」，两者分开：
    date: t.date,
    from: t.from,
    to: t.to,
    amount: t.amount,
    note: t.note,
    dateEdit: shortDate(t.date),
    amountEdit: moneyOrBlank(t.amount),
    dateText: shortDate(t.date),
    amountText: money(t.amount),
  }));
}

/** 页脚信息：条数 + 合计。 */
export function buildFooterInfo(state) {
  const list = state.transactions || [];
  let total = 0;
  for (const t of list) total += toAmount(t.amount);
  return { count: list.length, totalText: moneyAlways(total) };
}

/** 下拉用的账户选项（转出/转入两个 select 共用一份）。 */
export function buildAccountOptions(state) {
  return (state.accounts || []).map((a) => ({
    value: a.name,
    label: a.code ? `${a.code} · ${a.name}` : a.name,
  }));
}
