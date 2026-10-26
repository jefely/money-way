/**
 * 账户索引（O(1) 查找）
 * 层：第一层 · 数据基座
 *
 * 为什么需要：手机上敲一个字要立刻响应，不能每个按键都遍历几百个账户。
 * 这里一次性建三张 Map，之后查 id / 简码 / 名字都是 O(1)。
 *
 * 设计取舍：**不做全局可变索引**。
 * `buildAccountIndex(accounts)` 是纯函数，返回一个索引对象；
 * 调用方在 state 变化后重建一次即可（100 个账户重建约 0.05ms）。
 * 这样既保住 O(1) 查询，又不破坏「core 全是纯函数」的公约。
 */

import { normalizeCode } from './schema.js';

/**
 * @param {Array<{id:string,code:string,name:string}>} accounts
 * @returns {{
 *   byId: Map<string,object>, byCode: Map<string,object>, byName: Map<string,object>,
 *   size: number, duplicateCodes: string[], missingCode: string[]
 * }}
 */
export function buildAccountIndex(accounts) {
  const byId = new Map();
  const byCode = new Map();
  const byName = new Map();
  const duplicateCodes = [];
  const missingCode = [];

  for (const a of accounts || []) {
    if (!a || !a.id) continue;
    byId.set(a.id, a);

    const code = normalizeCode(a.code);
    if (!code) {
      missingCode.push(a.id);
    } else if (byCode.has(code)) {
      // 重复简码：保留先出现的那个，同时记下来交给 V7 报错
      duplicateCodes.push(code);
    } else {
      byCode.set(code, a);
    }

    const name = String(a.name || '').trim();
    if (name) byName.set(name, a);
  }

  return { byId, byCode, byName, size: byId.size, duplicateCodes, missingCode };
}

/** 按 id 取（最常用） */
export function getById(index, id) {
  return (index && index.byId.get(id)) || null;
}

/** 按简码取（大小写不敏感） */
export function getByCode(index, code) {
  const c = normalizeCode(code);
  return (index && index.byCode.get(c)) || null;
}

/** 按名字取 */
export function getByName(index, name) {
  const n = String(name || '').trim();
  return (index && index.byName.get(n)) || null;
}
