/**
 * 校验规则池（V1~V7）
 * 层：第一层 · 数据基座
 *
 * 输出**结构化**问题列表（不是布尔值），让 UI 能指出「是哪一笔、错在哪」。
 * 全部按 ID 判定 —— 账户改名不会引起任何误报，这正是 ID 模型的意义。
 */

import { toAmount } from './stats.js';
import { checkAccountingIdentity } from './validate.js';
import { normalizeCode, isValidCode, CODE_MIN_LEN, CODE_MAX_LEN } from './schema.js';

export const LEVEL = { ERROR: 'error', WARN: 'warn' };

export const RULES = {
  V1: '单边流水：缺转出或转入',
  V2: '金额非法：≤ 0 或不是数字',
  V3: '断链：账户 ID 在账户表里找不到',
  V4: '自己转自己：转出与转入相同',
  V5: '日期非法或缺失',
  V6: '会计恒等式不平：资产 + 费用 − 负债 − 权益 − 收入 ≠ 0',
  V7: `简码必须唯一且非空（${CODE_MIN_LEN}~${CODE_MAX_LEN} 位字母/数字）`,
};

/**
 * @param {{transactions?:Array, accounts?:Array, balances?:Array}} input
 * @returns {{ok:boolean, issues:Array<{code:string, level:string, message:string, ref:any}>}}
 */
export function validate(input) {
  const txs = (input && input.transactions) || [];
  const accounts = (input && input.accounts) || [];
  const issues = [];

  const ids = new Set(accounts.map((a) => a.id));

  /* ---------- 流水：V1~V5 ---------- */
  txs.forEach((t, i) => {
    const fromId = t && t.from_id;
    const toId = t && t.to_id;
    const amt = toAmount(t && t.amount);
    const date = String((t && t.date) || '');

    if (!fromId || !toId) {
      issues.push({ code: 'V1', level: LEVEL.ERROR, message: RULES.V1, ref: { index: i, id: t && t.id } });
    }
    if (!(amt > 0)) {
      issues.push({ code: 'V2', level: LEVEL.ERROR, message: RULES.V2, ref: { index: i, id: t && t.id } });
    }
    if ((fromId && !ids.has(fromId)) || (toId && !ids.has(toId))) {
      issues.push({ code: 'V3', level: LEVEL.ERROR, message: RULES.V3, ref: { index: i, id: t && t.id } });
    }
    if (fromId && toId && fromId === toId) {
      issues.push({ code: 'V4', level: LEVEL.ERROR, message: RULES.V4, ref: { index: i, id: t && t.id } });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      issues.push({ code: 'V5', level: LEVEL.ERROR, message: RULES.V5, ref: { index: i, id: t && t.id } });
    }
  });

  /* ---------- 简码：V7 ---------- */
  const seenCodes = new Map();
  for (const a of accounts) {
    if (!a || a.isHidden) continue;   // 期初虚拟账户不参与简码约束
    const code = normalizeCode(a.code);
    if (!code) {
      issues.push({
        code: 'V7', level: LEVEL.ERROR,
        message: `${RULES.V7}（账户「${a.name}」缺少简码）`,
        ref: { accountId: a.id },
      });
      continue;
    }
    if (!isValidCode(code)) {
      issues.push({
        code: 'V7', level: LEVEL.ERROR,
        message: `${RULES.V7}（账户「${a.name}」的简码「${code}」长度或字符不合法）`,
        ref: { accountId: a.id },
      });
      continue;
    }
    if (seenCodes.has(code)) {
      issues.push({
        code: 'V7', level: LEVEL.ERROR,
        message: `${RULES.V7}（简码「${code}」重复：${seenCodes.get(code)} 与 ${a.name}）`,
        ref: { accountId: a.id, duplicate: code },
      });
      continue;
    }
    seenCodes.set(code, a.name);
  }

  /* ---------- 恒等式：V6 ---------- */
  if (Array.isArray(input && input.balances)) {
    const acc = checkAccountingIdentity(input.balances);
    if (!acc.ok) {
      issues.push({ code: 'V6', level: LEVEL.ERROR, message: RULES.V6, ref: { diff: acc.diff } });
    }
  }

  return { ok: issues.length === 0, issues };
}

/** 只数错误（warn 不算失败） */
export function errorCount(result) {
  return ((result && result.issues) || []).filter((x) => x.level === LEVEL.ERROR).length;
}

/** 按规则编号过滤（UI 可以只显示某一类） */
export function issuesOf(result, codeName) {
  return ((result && result.issues) || []).filter((x) => x.code === codeName);
}
