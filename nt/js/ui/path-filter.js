// 界面：路径页左栏（流水表）的筛选
/**
 * 路径页左栏筛选
 * 层：第五层 · UI（纯逻辑，只读数据不碰 DOM）
 *
 * 五个条件框：日期 / 转出 / 转入 / 金额 / 备注。
 * 规则与查询页完全一致（core/query-engine 的 matchAccount / exactAccount）：
 *   · 转出、转入填同一节点 → 「该节点作为转出方或转入方」
 *   · 简码在提交时换成节点名字
 *
 * 单独成文件的原因：views/path.js 本来只负责装配图与侧栏，
 * 把这段筛选塞进去会顶破公约的 300 行上限。
 */

import { matchAccount, exactAccount, sameAccountQuery } from '../core/query-engine.js';
import { dateInRange } from '../core/date-query.js';

/** 空白筛选条件（清空时也用它，保证字段集合只有一份） */
export function emptyFilter() {
  return { date: '', from: '', to: '', amount: '', note: '' };
}

/**
 * 按筛选条件过滤出 tx 下标。
 *
 * @param {Array} txs
 * @param {{date?:string,from?:string,to?:string,amount?:string,note?:string}} filter
 * @param {Map<string,object>} byId  账户 id → 账户
 * @param {Array} accounts 全部账户（判断两个输入串是不是同一个节点）
 * @returns {number[]}
 */
export function visibleIdx(txs, filter, byId, accounts) {
  const f = filter || emptyFilter();
  const any = f.date || f.from || f.to || f.amount || f.note;
  if (!any) return (txs || []).map((_, i) => i);

  const hitAcc = (id, q) => matchAccount(byId ? byId.get(id) : null, q);

  // 转出、转入填同一个节点 = 该节点的「转出 + 转入」一起列。
  // 一笔流水不可能自己转给自己，两栏同值时按「与」筛永远是 0 行。
  let from = f.from;
  let to = f.to;
  let sameNode = '';
  if (from && to && sameAccountQuery(accounts || [], from, to)) {
    sameNode = from;
    from = '';
    to = '';
  }

  const out = [];
  for (let i = 0; i < (txs || []).length; i += 1) {
    const t = txs[i];
    if (f.date && !dateInRange(t.date, f.date)) continue;
    if (from && !hitAcc(t.from_id, from)) continue;
    if (to && !hitAcc(t.to_id, to)) continue;
    if (sameNode && !hitAcc(t.from_id, sameNode) && !hitAcc(t.to_id, sameNode)) continue;
    if (f.amount && !String(t.amount || '').includes(f.amount)) continue;
    if (f.note && !String(t.note || '').includes(f.note)) continue;
    out.push(i);
  }
  return out;
}

/**
 * 提交时的输入值：精确命中账户就换成它的名字，否则原样返回。
 * @param {Array} accounts
 * @param {string} text
 */
export function commitNodeValue(accounts, text) {
  const acc = exactAccount(accounts || [], text);
  const name = acc ? String(acc.name || '') : '';
  return name && name !== text ? name : text;
}
