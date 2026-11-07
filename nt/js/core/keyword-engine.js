// 核心：关键字引擎（把一条流水压成手机上看得下的短串）
/**
 * 关键字引擎
 * 层：第一层 · core
 *
 * 用户 2026-11-08 定的三层密度：
 *
 *   ① 原文（账单导进来的长备注，一个字不丢）
 *   ② `路径：关键字，YYMMDDHHMM，账户简码`
 *   ③ `关键字，YYMMDDHHMM`            ← 手机上只剩这一行
 *
 * 压缩规则（全部来自用户给的 12 个实例）：
 *   · 时间：2026-08-08 13:17 → 2608081317（YYMMDDHHMM）
 *   · 账户：用简码（招商银行储蓄卡(7912) → 招行储7912）
 *   · 路径：对方节点沿 parentId 向上，名字用「：」连（出行：共享车）
 *   · 关键字：别名表命中就用短名（丙怀餐饮 → 丙怀），否则用备注关键字原文
 *
 * 纯函数：不读写 state、不碰 DOM。原文永远保留，短串只是显示层。
 */

import { aliasGet } from './alias-table.js';

const norm = (v) => String(v == null ? '' : v).trim();

/** 一段时间的压缩写法：2026-08-08 + 13:17 → 2608081317 */
export function compactTime(date, time) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(norm(date));
  if (!m) return norm(date).replace(/-/g, '');
  const hm = /(\d{1,2}):(\d{2})/.exec(norm(time));
  const hh = hm ? String(hm[1]).padStart(2, '0') : '00';
  const mm = hm ? hm[2] : '00';
  return m[2] + m[3] + hh + mm;          // MM DD HH MM
  // 年份只留两位：yy 在调用处拼，见 shortNote（这里返回 MMDDHHMM）
}

/** 完整时间戳：2608081317（yyMMddHHmm） */
export function stamp(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(norm(date));
  const rest = compactTime(date, time);
  if (!d) return rest;
  return d[1].slice(2) + rest;
}

/** 从备注里抠时间（HH:MM），没有就空 */
export function timeIn(note) {
  const m = /(\d{1,2}):(\d{2})/.exec(norm(note));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

/** id → account */
function indexOf(accounts) {
  const map = new Map();
  for (const a of accounts || []) if (a && a.id) map.set(a.id, a);
  return map;
}

/**
 * 关键字链（用户 2026-11-08 的升级规则）：
 *
 *   自己**总是**出现在链里（最深层）；
 *   往上走，祖先只要还是「未定型的节点」（`type` 为空 = U 区，没被升级）
 *   就继续用「：」串进来；碰到一个**已定型**的祖先就停 —— 它已经是正式节点，
 *   不再占用备注前缀。
 *
 *   餐饮（U 区）+ 丙怀（U 区）      → 餐饮：丙怀
 *   餐饮（U 区）+ 丙怀（费用类）     → 餐饮：丙怀
 *   餐饮（费用类）+ 丙怀（费用类）   → 丙怀
 */
export function keywordChain(accounts, acc) {
  if (!acc) return '';
  const map = indexOf(accounts);
  const names = [norm(acc.name)].filter(Boolean);
  let cur = acc;
  for (let i = 0; i < 20; i += 1) {
    const up = cur && cur.parentId ? map.get(String(cur.parentId)) : null;
    if (!up) break;
    if (norm(up.type)) break;          // 已升级成正式节点 → 不再进链
    names.unshift(norm(up.name));
    cur = up;
  }
  return names.join('：');
}

/** 短名：别名表命中就用它，否则原文 */
export function shortKey(keyword, aliases) {
  const k = norm(keyword);
  if (!k) return '';
  return aliasGet(aliases, k) || k;
}

/** 账户显示：优先简码，其次名字 */
function accountLabel(acc) {
  if (!acc) return '';
  return norm(acc.code) || norm(acc.name);
}

/**
 * 一条流水 → 第 ② 层短串：`路径：关键字，时间，账户`
 * @param {object} state
 * @param {object} tx
 * @param {{withAccount?:boolean, aliases?:Array}} [opts]
 */
export function shortNote(state, tx, opts) {
  const o = opts || {};
  const accounts = (state && state.accounts) || [];
  const aliases = o.aliases || (state && state.aliases) || [];
  const map = indexOf(accounts);

  const other = map.get(String(tx && tx.to_id)) || map.get(String(tx && tx.from_id)) || null;
  const mine = map.get(String(tx && tx.from_id)) || null;

  // 前缀 = 关键字链：自己总在，往上只收「还没升级」的祖先（见 keywordChain）
  const chain = keywordChain(accounts, other);
  const key = chain || shortKey((tx && tx.noteKeyword) || (other && other.name), aliases);
  const when = stamp(tx && tx.date, timeIn(tx && tx.note));

  const seg = [];
  if (key) seg.push(key);
  seg.push(when);
  if (o.withAccount !== false) {
    const acc = accountLabel(mine);
    if (acc) seg.push(acc);
  }
  return seg.filter(Boolean).join('，');
}

/** 第 ③ 层：只剩「关键字，时间」—— 手机上最挤的时候用 */
export function shortestNote(state, tx, opts) {
  const o = opts || {};
  const accounts = (state && state.accounts) || [];
  const aliases = o.aliases || (state && state.aliases) || [];
  const map = indexOf(accounts);
  const other = map.get(String(tx && tx.to_id)) || map.get(String(tx && tx.from_id)) || null;
  const key = shortKey(norm(other && other.name) || (tx && tx.noteKeyword), aliases);
  const when = stamp(tx && tx.date, timeIn(tx && tx.note));
  return [key, when].filter(Boolean).join('，');
}

/**
 * 备注栏实际显示的串：**按这条流水的对方节点有没有升级自动选**。
 *
 *   还没定型（U 区）→ 第 ② 层：`餐饮：丙怀，2608081317，交行储8380`
 *   已定型（有类型）→ 第 ③ 层：`丙怀，2608081317`
 *
 * 这正是用户说的「关键字1 升级成节点后，关键字2 就变成了 1」。
 */
export function displayNote(state, tx, opts) {
  const accounts = (state && state.accounts) || [];
  const map = indexOf(accounts);
  const other = map.get(String(tx && tx.to_id)) || map.get(String(tx && tx.from_id)) || null;
  return norm(other && other.type)
    ? shortestNote(state, tx, opts)
    : shortNote(state, tx, opts);
}
