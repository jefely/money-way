/**
 * 浏览器层：本地持久化。
 *
 * 这一层**允许**碰 localStorage（它是边界），但不做任何业务计算。
 * core/ 里的纯函数不许 import 它。
 */

import { migrate } from '../core/migrate.js';

const KEY = 'nt_state_v1';

/** 读：拿不到就返回 null（调用方决定怎么提示）。 */
export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return migrate(obj).state;
  } catch (e) {
    return null;
  }
}

/** 写：失败要显式返回 false，不吞异常。 */
export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

/** 清空（开发/重置用）。 */
export function clearState() {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch (e) {
    return false;
  }
}

export const STORAGE_KEY = KEY;
