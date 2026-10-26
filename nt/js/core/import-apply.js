/**
 * 导入落库（纯函数）
 * 层：第一层 · 数据基座
 *
 * 输入「解析结果 + 当前 state」，输出「新 state + 统计」。
 * 不碰 DOM、不写盘 —— 所以能完整测试「建账户 → 建流水 → 不丢不重」。
 */

import { normalizeCode } from './schema.js';
import { defaultAccountPatch } from './import-parser.js';
import { addAccount, addTransaction, idOf, nextSeq } from './state-store.js';

/**
 * 简码去重：撞了就往后加数字。
 * @param {Array<{code:string}>} accounts
 * @param {string} base
 */
export function uniqueCode(accounts, base) {
  const used = new Set((accounts || []).map((a) => normalizeCode(a.code)));
  const c = normalizeCode(base) || 'ACC';
  if (!used.has(c)) return c;
  for (let i = 2; i < 100; i++) {
    const cand = (c.slice(0, 3) + i).slice(0, 5);
    if (!used.has(cand)) return cand;
  }
  return ('X' + String(Date.now()).slice(-4)).slice(0, 5);
}

/**
 * 把解析结果落到 state 上。
 *  ① 先补缺失的账户（简码自动去重）
 *  ② 再用**补完之后**的 state 解析每行的名字 → id
 *  ③ 两端都解析不到的行跳过并计数
 *
 * @param {object} state
 * @param {{accounts:Array<{display:string}>, rows:Array}} parsed
 * @returns {{state:object, created:number, added:number, skipped:number, createdNames:string[]}}
 */
export function applyImportToState(state, parsed) {
  let s = state;
  const createdNames = [];

  // ① 账户
  for (const a of (parsed && parsed.accounts) || []) {
    const display = String(a.display || '').trim();
    if (!display) continue;
    if (idOf(s, display)) continue;
    const patch = defaultAccountPatch(display);
    patch.code = uniqueCode(s.accounts, patch.code);
    s = addAccount(s, patch);
    createdNames.push(display);
  }

  // ② 流水
  let added = 0;
  let skipped = 0;
  for (const r of (parsed && parsed.rows) || []) {
    const fromId = idOf(s, r.from);
    const toId = idOf(s, r.to);
    if (!fromId && !toId) { skipped += 1; continue; }
    s = addTransaction(s, {
      date: r.date,
      from_id: fromId,
      to_id: toId,
      amount: r.amount,
      note: r.note || '',
      seq: nextSeq(s),
    });
    added += 1;
  }

  return { state: s, created: createdNames.length, added, skipped, createdNames };
}
