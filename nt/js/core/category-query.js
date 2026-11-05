// 数据：分类查询（纯函数）
/**
 * 在选定时间段里，按「账户分类」筛流水。
 * 一笔流水只要转出方或转入方任一账户的分类包含关键字，就算命中。
 * 不碰 DOM，方便测试；显示格式化留给 UI。
 */

import { isPosted } from './schema.js';

function inRange(date, start, end) {
  const d = String(date || '');
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

/**
 * @param {Array} transactions
 * @param {Array} accounts
 * @param {{start?:string,end?:string}} range
 * @param {string} text
 * @returns {Array<{tx:object,from:object|null,to:object|null}>}
 */
export function queryByCategory(transactions, accounts, range, text) {
  const q = String(text || '').trim();
  if (!q) return [];
  const byId = new Map((accounts || []).filter(Boolean).map((a) => [a.id, a]));
  const start = (range && range.start) || '';
  const end = (range && range.end) || '';
  const hit = (acc) => !!acc && String(acc.category || '').includes(q);

  return (transactions || [])
    .filter((t) => t && isPosted(t) && inRange(t.date, start, end))
    .filter((t) => hit(byId.get(t.from_id)) || hit(byId.get(t.to_id)))
    .sort((a, b) => {
      const d = String(b.date || '').localeCompare(String(a.date || ''));
      if (d) return d;
      return (Number(b.seq) || 0) - (Number(a.seq) || 0);
    })
    .map((t) => ({ tx: t, from: byId.get(t.from_id) || null, to: byId.get(t.to_id) || null }));
}
