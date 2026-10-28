// 界面：（无界面）流水视图模型
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

/**
 * 流水 → 渲染行。排序：seq 升序。
 *
 * @param {object} state
 * @param {Array} [virtual] 时间状态机给出的「未来分期」虚拟事件，
 *                          追加在真实流水之后，只读（见 isVirtual）
 */
export function buildFlowRows(state, virtual) {
  const real = buildRealRows(state);
  if (!virtual || !virtual.length) return real;

  let n = real.length;
  const virt = virtual.map((v) => {
    n += 1;
    return {
      id: 'v_' + v.source + '_' + v.periodIndex,
      seq: n,
      date: v.date,
      from: v.fromName || '分期还款',
      to: v.toName || v.source || '',
      amount: v.amount,
      note: `第 ${v.periodIndex}/${v.periods} 期`,
      dateEdit: shortDate(v.date),
      amountEdit: moneyOrBlank(v.amount),
      dateText: shortDate(v.date),
      amountText: money(v.amount),
      isVirtual: true,
      isOpening: false,
      broken: false,
    };
  });
  return real.concat(virt);
}

/** 只取真实流水（原 buildFlowRows 的实现搬进来） */
function buildRealRows(state) {
  const accMap = indexAccounts(state.accounts);
  const nameOf = (id) => (accMap.get(id) ? accMap.get(id).name : '');

  // 「固定」列那个复选框的状态：这笔流水是否已经生成过固定收支规则。
  // 关联靠 scheduled.srcTxId（见 core/schema.js 的 createScheduled）。
  const fixedTx = new Set(
    (state.scheduled || []).filter((s) => s && s.srcTxId).map((s) => String(s.srcTxId)),
  );

  const rows = (state.transactions || []).slice()
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));

  return rows.map((t, i) => ({
    id: t.id,
    seq: i + 1,
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
    // 期初流水不该变成固定收支规则（它没有业务日期）
    fixed: !t.opening && fixedTx.has(String(t.id)),
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
