// 界面：统计小表的自定义顺序（把某一张往上挪一位）
/**
 * 用户 2026-11：每张小表的类型标签后面加一个 ▲，点了这张表往上移一位。
 * 顺序存在 localStorage —— 它和「左栏宽度」一样是**界面偏好**，不进加密账本
 * （换台设备/换本账都不该带着走）。
 *
 * 两个视图（分类 / 节点）共用同一份顺序：它们本来就是同一批六类表。
 */

const KEY = 'nt_stat_order';

/** 默认顺序：用户 2026-11 定的 收入 / 负债 / 权益 / 资产 / 费用 / 成本 */
export const STAT_ORDER_DEFAULT = ['收入类', '负债类', '权益类', '资产类', '费用类', '成本类'];

/** 读当前顺序：只认已知类型，缺的补在末尾（以后加第七类也不会丢） */
export function loadStatOrder() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return STAT_ORDER_DEFAULT.slice();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return STAT_ORDER_DEFAULT.slice();
    const known = arr.filter((t) => STAT_ORDER_DEFAULT.includes(t));
    for (const t of STAT_ORDER_DEFAULT) if (!known.includes(t)) known.push(t);
    return known;
  } catch (e) {
    return STAT_ORDER_DEFAULT.slice();
  }
}

/**
 * 把某一类往上移一位。
 * @returns {boolean} 真的移了没有（已经是第一个就返回 false）
 */
export function moveStatUp(type) {
  const list = loadStatOrder();
  const i = list.indexOf(type);
  if (i <= 0) return false;
  [list[i - 1], list[i]] = [list[i], list[i - 1]];
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* 忽略 */ }
  return true;
}
