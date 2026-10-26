/**
 * ☐4 校验规则池
 * 层：第一层 · 数据基座
 *
 * 执行 V1~V6 六条规则，输出**结构化**问题列表（不是布尔值），
 * 让 UI 能指出「是哪一笔、错在哪」，而不是只报一句"数据有问题"。
 */

import { toAmount } from './stats.js';
import { checkAccountingIdentity } from './validate.js';

/** 问题等级 */
export const LEVEL = { ERROR: 'error', WARN: 'warn' };

/** 规则编号 → 说明（UI 直接展示 message） */
export const RULES = {
  V1: '单边流水：缺转出或转入',
  V2: '金额非法：≤ 0 或不是数字',
  V3: '断链：账户名不在账户表里',
  V4: '自己转自己：转出与转入相同',
  V5: '日期非法或缺失',
  V6: '会计恒等式不平：资产 + 费用 − 负债 − 权益 − 收入 ≠ 0',
};

/**
 * @param {{transactions:Array, accounts:Array, balances?:Array}} input
 * @returns {{ok:boolean, issues:Array<{code:string, level:string, message:string, ref:any}>}}
 */
export function validate(input) {
  const txs = (input && input.transactions) || [];
  const accounts = (input && input.accounts) || [];
  const issues = [];

  const names = new Set(accounts.map((a) => String(a.name || '').trim()));

  txs.forEach((t, i) => {
    const from = String((t && t.from) || '').trim();
    const to = String((t && t.to) || '').trim();
    const amt = toAmount(t && t.amount);
    const date = String((t && t.date) || '');

    // V1 单边
    if (!from || !to) {
      issues.push({ code: 'V1', level: LEVEL.ERROR, message: RULES.V1, ref: { index: i, id: t && t.id } });
    }
    // V2 金额
    if (!(amt > 0)) {
      issues.push({ code: 'V2', level: LEVEL.ERROR, message: RULES.V2, ref: { index: i, id: t && t.id } });
    }
    // V3 断链
    if ((from && !names.has(from)) || (to && !names.has(to))) {
      issues.push({ code: 'V3', level: LEVEL.ERROR, message: RULES.V3, ref: { index: i, id: t && t.id } });
    }
    // V4 自转
    if (from && to && from === to) {
      issues.push({ code: 'V4', level: LEVEL.ERROR, message: RULES.V4, ref: { index: i, id: t && t.id } });
    }
    // V5 日期
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      issues.push({ code: 'V5', level: LEVEL.ERROR, message: RULES.V5, ref: { index: i, id: t && t.id } });
    }
  });

  // V6 恒等式（需要调用方传余额；没传就跳过，不假装通过）
  if (Array.isArray(input && input.balances)) {
    const acc = checkAccountingIdentity(input.balances);
    if (!acc.ok) {
      issues.push({ code: 'V6', level: LEVEL.ERROR, message: RULES.V6, ref: { diff: acc.diff } });
    }
  }

  return { ok: issues.length === 0, issues };
}

/** 只数错误（warn 不算失败）。 */
export function errorCount(result) {
  return ((result && result.issues) || []).filter((x) => x.level === LEVEL.ERROR).length;
}
