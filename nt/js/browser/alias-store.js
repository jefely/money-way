// 界面：（无界面）软件级别名表的落盘
/**
 * 别名表存储
 * 层：browser/（浏览器边界）
 *
 * **软件级**：存在 IndexedDB 里一个独立的 key（`aliases`），不进账本 state。
 * 所以换账本不会丢、重置账本也不会删（`destroyVault` 只删 `state`）。
 *
 * 明文存：表里只有「说法 → 节点名」，没有金额、没有流水。
 * 用账本钥匙加密会带来一个死结 —— 换主密码后旧钥匙打不开这张表，
 * 而这张表本该在换密码、换账本之后继续活着。
 */

import { idbGet, idbPut } from './idb.js';

const KEY = 'aliases';

/** @returns {Promise<Array<{term:string,target:string,source?:string}>>} */
export async function loadAliases() {
  const rec = await idbGet(KEY);
  return rec && Array.isArray(rec.items) ? rec.items : [];
}

export async function saveAliases(items) {
  return idbPut(KEY, {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: Array.isArray(items) ? items : [],
  });
}
