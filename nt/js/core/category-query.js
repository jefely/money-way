// 数据：分类查询（纯函数）
/**
 * 在选定时间段里，按「账户分类」筛流水。
 * 一笔流水只要转出方或转入方任一账户的分类命中，就算命中。
 *
 * 命中规则（2026-11 加第二条）：
 *   ① 分类名包含查询串 —— 「储」命中「储蓄」
 *   ② 分类名的**拼音首字母**包含查询串 —— 「cx」命中「储蓄」，「rc」命中「日常」
 * 只输入字母时走 ②；输汉字时 ① 先命中。不碰 DOM，方便测试。
 */

import { isPosted } from './schema.js';
import { initialsOf } from './pinyin.js';

function inRange(date, start, end) {
  const d = String(date || '');
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

/** 分类 → 首字母串（同一分类只算一次；分类数很少，但流水很多） */
function initialsMap(accounts, field) {
  const map = new Map();
  for (const a of accounts || []) {
    if (!a) continue;
    const c = String(a[field] || '');
    if (!c || map.has(c)) continue;
    map.set(c, initialsOf(c));
  }
  return map;
}

/**
 * 按某个字段（分类 / 节点名）在选定时间段里筛流水。
 * 一笔流水只要转出方或转入方任一账户的该字段命中，就算命中。
 *
 * 分类详情和节点详情共用这一套：它们除了「比哪个字段」之外完全一样，
 * 所以没有理由写两份。
 *
 * @param {Array} transactions
 * @param {Array} accounts
 * @param {{start?:string,end?:string}} range
 * @param {string} text
 * @param {'category'|'name'} field
 */
function queryBy(transactions, accounts, range, text, field, useInitials) {
  const q = String(text || '').trim();
  if (!q) return [];
  const qLower = q.toLowerCase();
  const byId = new Map((accounts || []).filter(Boolean).map((a) => [a.id, a]));
  // 只有分类查询认拼音首字母；节点详情不认（用户 2026-11）——
  // 简码本身经常就是三四个字母（ZHC），再叠一层首字母匹配会互相误伤。
  const initials = useInitials ? initialsMap(accounts, field) : null;
  const start = (range && range.start) || '';
  const end = (range && range.end) || '';

  const hit = (acc) => {
    const key = String((acc && acc[field]) || '');
    if (!key) return false;
    if (key.includes(q)) return true;
    if (!initials) return false;
    return (initials.get(key) || '').includes(qLower);
  };

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

/**
 * @param {Array} transactions
 * @param {Array} accounts
 * @param {{start?:string,end?:string}} range
 * @param {string} text
 * @returns {Array<{tx:object,from:object|null,to:object|null}>}
 */
export function queryByCategory(transactions, accounts, range, text) {
  return queryBy(transactions, accounts, range, text, 'category', true);
}

/**
 * 按**节点名**筛流水（节点视图的「详情」用）。
 * 口径与 queryByCategory 一致，但两处不同：
 *   ① 匹配字段换成 `account.name`
 *   ② **不认拼音首字母**（用户 2026-11）—— 节点那边靠简码定位，
 *      再叠一层首字母匹配会互相误伤（简码 `ZHC` 恰好也是「招行储」的首字母）。
 */
export function queryByNode(transactions, accounts, range, text) {
  return queryBy(transactions, accounts, range, text, 'name', false);
}

/**
 * 按**账户类型**筛流水（用户 2026-11：点小表的类型名，看该类型的全部流水）。
 * 一笔流水只要转出方或转入方任一端是该类型就算命中 —— 所以「收入类」会同时
 * 带出「工资 → 银行卡」这类收入的转出端。
 *
 * @param {string} type 类型全名（`收入类`，不是短名 `收入`）
 */
export function queryByType(transactions, accounts, range, type) {
  const want = String(type || '').trim();
  if (!want) return [];
  const byId = new Map((accounts || []).filter(Boolean).map((a) => [a.id, a]));
  const start = (range && range.start) || '';
  const end = (range && range.end) || '';
  const hit = (acc) => !!acc && String(acc.type || '') === want;

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

/**
 * 把一串「简码 / 名字」拆成词（用户 2026-11）。
 * 分隔符：空格、中文逗号、英文逗号、点 —— 都认，混着用也行。
 */
export function splitTerms(text) {
  return String(text || '')
    .split(/[\s,，.、]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 简码 → 节点名（大小写不敏感）。找不到返回空串。
 * 节点简码就是账户表里那一列「简码」，用来快速指代一个节点。
 */
export function nodeNameOfCode(accounts, code) {
  const q = String(code || '').trim().toUpperCase();
  if (!q) return '';
  const hit = (accounts || []).find(
    (a) => a && !a.isHidden && String(a.code || '').toUpperCase() === q,
  );
  return hit ? String(hit.name || '') : '';
}

/**
 * 多个节点各自命中的流水合并成一份（节点视图的详情：可以一次看几个节点）。
 * 同一笔只出现一次（它可能同时命中两个名字），最后按日期倒序。
 */
export function queryByNodes(transactions, accounts, range, names) {
  const seen = new Set();
  const out = [];
  for (const name of names || []) {
    for (const r of queryByNode(transactions, accounts, range, name)) {
      const id = r.tx && r.tx.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(r);
    }
  }
  out.sort((a, b) => {
    const d = String(b.tx.date || '').localeCompare(String(a.tx.date || ''));
    if (d) return d;
    return (Number(b.tx.seq) || 0) - (Number(a.tx.seq) || 0);
  });
  return out;
}

/**
 * 输入框要「自动带入分类名」时用：查询串精确命中**唯一**分类就返回它的全名。
 *
 * 精确 = 分类名全等，或分类名的首字母串全等（「rc」→「日常」）。
 * 命中多个（「c」能对上餐饮/储蓄/宠物…）就返回空串，让输入原样保留 ——
 * 猜错一次比不猜更烦。
 *
 * @param {Array} accounts
 * @param {string} text
 * @returns {string} 分类全名或 ''
 */
export function resolveCategory(accounts, text) {
  const q = String(text || '').trim();
  if (!q) return '';
  const qLower = q.toLowerCase();

  const cats = [...new Set(
    (accounts || []).filter(Boolean).map((a) => String(a.category || '')).filter(Boolean),
  )];
  const hits = cats.filter((c) => c === q || initialsOf(c) === qLower);
  return hits.length === 1 ? hits[0] : '';
}

/**
 * 输入框的候选分类（「输入 c 就弹出储蓄」）。
 *
 * 命中规则与 queryByCategory 一致：名字包含，或首字母包含。
 * 排序按「有多准」：首字母全等 > 首字母前缀 > 名字前缀 > 其它，
 * 同档看节点数多的、再按名字。这样打 `c` 时 `cx`（储蓄）排在 `rc`（日常）前。
 *
 * @param {Array} accounts
 * @param {string} text
 * @param {number} [limit]
 * @returns {Array<{name:string, initials:string, count:number}>}
 */
export function suggestCategories(accounts, text, limit) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return [];

  const counts = new Map();
  for (const a of accounts || []) {
    const c = String((a && a.category) || '');
    if (!c) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }

  const hits = [];
  for (const [name, count] of counts) {
    const ini = initialsOf(name);
    const nameLower = name.toLowerCase();
    if (!nameLower.includes(q) && !ini.includes(q)) continue;

    let rank = 4;
    if (ini === q || nameLower === q) rank = 0;
    else if (ini.startsWith(q)) rank = 1;
    else if (nameLower.startsWith(q)) rank = 2;
    else if (ini.includes(q) || nameLower.includes(q)) rank = 3;

    hits.push({ name, initials: ini, count, rank });
  }

  hits.sort((a, b) => (a.rank - b.rank) || (b.count - a.count) || a.name.localeCompare(b.name));
  return hits.slice(0, Math.max(1, Number(limit) || 8))
    .map(({ name, initials, count }) => ({ name, initials, count }));
}
