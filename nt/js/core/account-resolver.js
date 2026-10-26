// 界面：（无界面）账户名/简码解析
/**
 * 账户解析（输入 → 账户）
 * 层：第一层 · 数据基座
 *
 * 用户在流水页的格子里可能打三种东西：
 *   ① 简码   jhc      → 精确命中 byCode
 *   ② 真实名 交行储8380 → 精确命中 byName
 *   ③ 片段   交行      → 模糊，用于「候选气泡」
 *
 * 解析结果永远是**账户对象**（含 id），绝不含"把简码当外键"这种事。
 */

import { normalizeCode } from './schema.js';
import { getByCode, getByName } from './account-index.js';

/** 候选气泡最多给几个（手机上放太多会挡视线） */
export const MAX_SUGGEST = 5;

/** 输入至少几个字符才开始弹候选 */
export const MIN_SUGGEST_LEN = 2;

/**
 * 精确解析：简码优先，其次真实名。
 * @returns {{acc:object|null, via:'code'|'name'|null}}
 */
export function resolveAccount(index, input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw || !index) return { acc: null, via: null };

  const byCodeHit = getByCode(index, raw);
  if (byCodeHit) return { acc: byCodeHit, via: 'code' };

  const byNameHit = getByName(index, raw);
  if (byNameHit) return { acc: byNameHit, via: 'name' };

  return { acc: null, via: null };
}

/**
 * 模糊候选（给气泡用）。排序：简码前缀 > 名字前缀 > 名字包含 > 分类包含。
 * @returns {Array<{acc:object, reason:string, score:number}>}
 */
export function suggestAccounts(index, input, limit = MAX_SUGGEST) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw || !index || raw.length < MIN_SUGGEST_LEN) return [];

  const upper = normalizeCode(raw);
  const hits = [];

  for (const acc of index.byId.values()) {
    if (!acc || acc.isHidden) continue;
    const code = normalizeCode(acc.code);
    const name = String(acc.name || '');
    const category = String(acc.category || '');

    let score = 0;
    let reason = '';

    if (code && code.startsWith(upper)) { score = 100; reason = 'code'; }
    else if (name.startsWith(raw)) { score = 80; reason = 'name'; }
    else if (name.includes(raw)) { score = 60; reason = 'name'; }
    else if (code && code.includes(upper)) { score = 40; reason = 'code'; }
    else if (category.includes(raw)) { score = 20; reason = 'category'; }

    if (score > 0) hits.push({ acc, reason, score });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // 同分：简码短的靠前（更好打）
    return normalizeCode(a.acc.code).length - normalizeCode(b.acc.code).length;
  });

  return hits.slice(0, limit);
}

/**
 * 一步到位：解析 + 回退。
 * 用于「用户敲了简码然后按回车」这个动作。
 *
 * @returns {{acc:object|null, display:string, via:string|null}}
 *          display 是要回填到输入框的文本（命中就给真实名，未命中保留原文）
 */
export function parseAccountInput(index, input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return { acc: null, display: '', via: null };

  const { acc, via } = resolveAccount(index, raw);
  if (acc) return { acc, display: acc.name, via };

  // 没命中：如果有唯一候选，就替用户选掉（省一次点击）
  const hits = suggestAccounts(index, raw, 2);
  if (hits.length === 1) {
    return { acc: hits[0].acc, display: hits[0].acc.name, via: 'unique-suggest' };
  }

  return { acc: null, display: raw, via: null };
}
