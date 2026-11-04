// 界面：（无界面）新账户名 → 类型 / 分类
/**
 * 自动建的账户按词库和银行/信用启发式归类。
 * 认不出才留空类型（流水序号变黄）。不改用户写下的账户名。
 */

import { LEXICON } from './lexicon.js';

const HEURISTICS = [
  { re: /工行|招行|建行|农行|中行|交行|邮储|储蓄卡|借记卡|储蓄/, type: '资产类', category: '储蓄' },
  { re: /花呗|白条|借呗|微粒贷/, type: '负债类', category: '网贷' },
  { re: /信用卡/, type: '负债类', category: '信用' },
];

function fromRole(row) {
  if (!row || row.role === 'note' || row.kind === 'note') return null;
  if (row.role === 'payment') return { type: '资产类', category: row.category || '网络账户', via: 'lexicon' };
  if (row.type) return { type: row.type, category: row.category || '', via: 'lexicon' };
  return null;
}

/** @returns {{type:string, category:string, via:string}|null} */
export function matchAccountName(name, lexicon = LEXICON) {
  const text = String(name || '').trim();
  if (!text) return null;
  for (const h of HEURISTICS) {
    if (h.re.test(text)) return { type: h.type, category: h.category, via: 'heuristic' };
  }
  const rows = (lexicon || []).filter((row) => row && row.keyword);
  rows.sort((a, b) => b.keyword.length - a.keyword.length);
  for (const row of rows) {
    if (text !== row.keyword && !text.includes(row.keyword)) continue;
    const hit = fromRole(row);
    if (hit) return hit;
  }
  return null;
}
