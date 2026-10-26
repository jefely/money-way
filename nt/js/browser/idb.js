// 界面：（无界面）IndexedDB 打开
/**
 * IndexedDB 薄封装（只有 open / get / put / del）。
 *
 * 为什么用 IndexedDB 而不是 localStorage：
 *   · 存的是二进制密文，IndexedDB 原生支持 Uint8Array，不用 base64 膨胀 33%
 *   · localStorage 是同步 API，大账本会卡主线程
 *   · localStorage 更容易被随手打开控制台看到
 */

const DB_NAME = 'nt_vault';
const DB_VERSION = 1;
const STORE = 'vault';

let _dbPromise = null;

/** 打开（并缓存）数据库连接。 */
export function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

/** 读一条。key 省略时读默认的 'state'。 */
export async function idbGet(key = 'state') {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/** 写一条（覆盖）。 */
export async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/** 删一条。 */
export async function idbDel(key = 'state') {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
