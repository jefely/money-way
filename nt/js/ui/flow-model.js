/**
 * 视图模型：state（ID 模型）→ 渲染行（名字）
 *
 * 三个原则里的「视图看名字」就落在这里：
 * 流水只有 from_id / to_id，本文件负责把它们翻成账户名。
 *
 * 纯函数：只吃 state，不碰 DOM。
 */

import { money, moneyAlways, moneyOrBlank, shortDate } from '../core/format.js';
import { toAmount } from '../core/stats.js';
import { indexAccounts } from '../core/schema.js';

/** 流水 → 渲染行。排序：seq 升序。 */
export function buildFlowRows(state) {
  const accMap = indexAccounts(state.accounts);
  const nameOf = (id) => (accMap.get(id) ? accMap.get(id).name : '');

  const rows = (state.transactions || []).slice()
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));

  return rows.map((t) => ({
    id: t.id,
    seq: Number(t.seq) || 0,
    // 编辑框里用「可编辑的名字」，提交时再解析回 ID
    date: t.date,
    from: nameOf(t.from_id),
    to: nameOf(t.to_id),
    amount: t.amount,
    note: t.note,
    // 期初行没有真实业务日期，显示成「期初」而不是 00-01-01
    dateEdit: t.opening ? '' : shortDate(t.date),
    amountEdit: moneyOrBlank(t.amount),
    dateText: t.opening ? '期初' : shortDate(t.date),
    amountText: money(t.amount),
    isOpening: !!t.opening,
    // 断链提示：有 ID 但映射不到名字（账户被删过）
    broken: (!!t.from_id && !accMap.has(t.from_id)) || (!!t.to_id && !accMap.has(t.to_id)),
  }));
}

/** 页脚信息：条数 + 合计 */
export function buildFooterInfo(state) {
  const list = state.transactions || [];
  let total = 0;
  for (const t of list) total += toAmount(t.amount);
  return { count: list.length, totalText: moneyAlways(total) };
}

/** 账户下拉选项（名字 + 分类，供补全用） */
export function buildAccountOptions(state) {
  return (state.accounts || [])
    .filter((a) => !a.isHidden)
    .map((a) => ({
      value: a.name,
      label: a.category ? `${a.name} · ${a.category}` : a.name,
    }));
}

/** 账户余额行（账户管理/统计用） */
export function buildAccountRows(state, balances) {
  return balances.map(({ acc, balance, inflow, outflow }) => ({
    id: acc.id,
    name: acc.name,
    type: acc.type,
    category: acc.category,
    balanceText: moneyAlways(balance),
    inflowText: moneyAlways(inflow),
    outflowText: moneyAlways(outflow),
  }));
}
