// 核心：别名表（说法 → 规范节点名）
/**
 * 别名表
 * 层：第一层 · core
 *
 * 它是软件级的「认知表」，三个入口共用一份：
 *   · 导入账单：味丰源 命中别名 → 直接归到「早餐」，不再建临时节点
 *   · 泡泡一句话记账：从一句话里认出说法 → 落到对应节点
 *   · 统计排查：某个节点下的钱是哪些说法进来的
 *
 * 表只存「说法 → 名字」，**不存节点 id** —— 换一个账本，「早餐」这个节点
 * 可能不存在，那时才需要新建。存 id 会让这张表绑死在一个账本上。
 *
 * 纯函数：不读写存储、不碰 DOM。
 */

const norm = (v) => String(v == null ? '' : v).trim();

/** 比较用的键：去空白、忽略大小写（味丰源 = 味丰源 ） */
export function aliasKey(term) {
  return norm(term).replace(/\s+/g, '').toLowerCase();
}

/**
 * 查一个说法对应哪个规范名。
 * @param {Array<{term:string,target:string}>} list
 * @param {string} term
 * @returns {string} 没有就返回空串
 */
export function aliasGet(list, term) {
  const k = aliasKey(term);
  if (!k) return '';
  const hit = (list || []).find((a) => a && aliasKey(a.term) === k);
  return hit ? norm(hit.target) : '';
}

/**
 * 写入/更新一条别名（同一个说法只留一条）。
 * @param {Array} list
 * @param {string} term   说法（味丰源）
 * @param {string} target 规范名（早餐）
 * @param {string} [source] 'local'（用户自己归的）| 'builtin'（随版本下发的基线）
 * @returns {Array} 新数组
 */
export function aliasPut(list, term, target, source) {
  const t = norm(term);
  const g = norm(target);
  if (!t || !g || aliasKey(t) === aliasKey(g)) return list || [];
  const rest = (list || []).filter((a) => a && aliasKey(a.term) !== aliasKey(t));
  return [...rest, { term: t, target: g, source: source || 'local', updatedAt: new Date().toISOString() }];
}

/** 批量写入：[{term, target}] 一次并进表里 */
export function aliasPutMany(list, pairs, source) {
  let out = list || [];
  for (const p of pairs || []) {
    if (p && p.term && p.target) out = aliasPut(out, p.term, p.target, source);
  }
  return out;
}

/**
 * 待归类项：备注关键字正好是一个临时节点名，并且有流水指向它。
 * 备注区据此显示「批量归类 N 项」。
 *
 * @param {object} state
 * @returns {Array<{note:object, acc:object, keyword:string, count:number}>}
 */
export function pendingKeywords(state) {
  const notes = (state && state.notes) || [];
  const accounts = (state && state.accounts) || [];
  const txs = (state && state.transactions) || [];
  const out = [];
  for (const n of notes) {
    const kw = norm(n && n.keyword);
    if (!kw) continue;
    const acc = accounts.find((a) => a && norm(a.name) === kw);
    if (!acc) continue;
    const count = txs.filter((t) => t && (t.from_id === acc.id || t.to_id === acc.id)).length;
    if (!count) continue;
    out.push({ note: n, acc, keyword: kw, count });
  }
  return out;
}
