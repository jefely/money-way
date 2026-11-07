// 核心：节点上下级（一棵由用户自己确立的树）
/**
 * 节点关系
 * 层：第一层 · core
 *
 * 用户 2026-11-08：**上下级关系由用户在节点配置表里确立**，未确立时保持开放
 *（不替用户猜「餐饮属于生活」这种关系）。这里只提供最小的树操作：
 * 查上级 / 查下级 / 判环 / 汇总后代。
 *
 * 关系的存储是 `account.parentId` —— 指向另一个节点。**没有 parentId 就是根**，
 * 不是「未分类」，也不是「空字符串分类」，两者不要混。
 *
 * 纯函数：不读写 state。
 */

const norm = (v) => String(v == null ? '' : v).trim();

/** id → account */
function byId(accounts) {
  const map = new Map();
  for (const a of accounts || []) {
    if (a && a.id) map.set(a.id, a);
  }
  return map;
}

/** 某个节点的上级（没有就 null） */
export function parentOf(accounts, id) {
  const map = byId(accounts);
  const a = map.get(norm(id));
  if (!a || !a.parentId) return null;
  return map.get(String(a.parentId)) || null;
}

/** 某个节点的直接下级 */
export function childrenOf(accounts, id) {
  const pid = norm(id);
  if (!pid) return [];
  return (accounts || []).filter((a) => a && a.id !== pid && String(a.parentId || '') === pid);
}

/** 所有根节点（没有上级的） */
export function rootsOf(accounts) {
  return (accounts || []).filter((a) => a && !a.parentId);
}

/**
 * 把 id 挂到 parentId 下面会不会造成环（自己 → 自己，或 A→B→A）。
 * 配置表在保存前必须过这一关，否则树会变成一个环，统计时无限递归。
 */
export function wouldCycle(accounts, id, parentId) {
  const self = norm(id);
  let cur = norm(parentId);
  if (!self || !cur) return false;
  if (cur === self) return true;
  const map = byId(accounts);
  for (let i = 0; i < 200; i += 1) {
    const a = map.get(cur);
    if (!a) return false;
    const next = norm(a.parentId);
    if (!next) return false;
    if (next === self) return true;
    cur = next;
  }
  return true;   // 深到 200 层还没走完，按环处理，别让它进统计
}

/** 某个节点的全部后代（不含自己），按层展开 */
export function descendantsOf(accounts, id) {
  const out = [];
  const seen = new Set();
  const walk = (pid) => {
    for (const c of childrenOf(accounts, pid)) {
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
      walk(c.id);
    }
  };
  walk(norm(id));
  return out;
}
