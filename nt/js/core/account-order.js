// 数据基座：账户的分区、序号与排序（纯函数，无浏览器 API）
/**
 * 账户顺序（用户 2026-10-30）
 *
 * · 分区：A = 资产类/费用类（以及用户自己填的未知类型，默认归 A）；B = 负债类/权益类/收入类
 * · 序号：账户上可带 seq 字段（允许跳号，如 …63、80、100、101）；
 *   没带 seq 的旧账户按它在区内的位置当序号
 * · 排序：区内按序号升序，同序号保持原相对顺序（稳定）
 */

import { ZONES } from './settings.js';

const B_TYPES = (ZONES.find((z) => z.key === 'B') || {}).types || [];

/** 这个账户属于哪个区（未知类型默认 A） */
export function zoneKeyOf(acc) {
  const type = String((acc && acc.type) || '').trim();
  return B_TYPES.indexOf(type) >= 0 ? 'B' : 'A';
}

/** 某区里的可见账户（未排序） */
export function accountsOfZone(accounts, zoneKey) {
  return (accounts || []).filter((a) => a && !a.isHidden && zoneKeyOf(a) === zoneKey);
}

/** 有效序号：有 seq 用 seq，没有就用区内位置（从 1 开始） */
export function effectiveSeq(acc, fallback) {
  const n = Number(acc && acc.seq);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 按序号升序（稳定） */
export function orderBySeq(list) {
  return list
    .map((a, i) => ({ a, k: effectiveSeq(a, i + 1), i }))
    .sort((x, y) => (x.k - y.k) || (x.i - y.i))
    .map((x) => x.a);
}

/** 下一个自动序号 = 区内最大有效序号 + 1 */
export function nextSeqFor(list) {
  let max = 0;
  list.forEach((a, i) => {
    const k = effectiveSeq(a, i + 1);
    if (k > max) max = k;
  });
  return max + 1;
}

/** 上移：与同一类型里的前一个账户交换位置（跨类型换看不出效果，所以限制在类型内） */
export function moveWithinType(accounts, id) {
  const list = (accounts || []).slice();
  const i = list.findIndex((a) => a && a.id === id);
  if (i < 0) return { moved: false, accounts: list };

  const acc = list[i];
  let j = -1;
  for (let k = i - 1; k >= 0; k -= 1) {
    if (list[k] && list[k].type === acc.type) { j = k; break; }
  }
  if (j < 0) return { moved: false, accounts: list };

  list[i] = list[j];
  list[j] = acc;
  return { moved: true, accounts: list };
}
