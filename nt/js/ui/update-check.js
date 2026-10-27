/**
 * 版本更新（UI 层）
 * 层：第五层 · UI
 *
 * 参照单文件版的做法：
 *   ① 只拉 sw.js（几 KB），从 CACHE_NAME 读远端版本；读不到才退回拉 index.html
 *   ② 远端更新 → 清 Cache Storage + 让 SW skipWaiting + 记一个标记 + reload
 *   ③ 已最新 → 只提示，不动缓存
 *
 * 不用 Service Worker 的 waiting 判断：只改 index.html 而 sw.js 没变时，
 * 浏览器根本不触发 install，waiting 永远是空，会一直说「已是最新」。
 */

import { APP_VER, decideUpdate, versionFromSwText, versionFromHtmlText, pickBigger } from '../core/version.js';

export const UPDATED_FLAG = 'nt_updated';

/**
 * 检查远端版本。
 * @param {{base?:string, timeoutMs?:number}} [opts]
 * @returns {Promise<{local:string, remote:string, update:boolean, reason:string}>}
 */
export async function checkUpdate(opts) {
  const o = opts || {};
  const base = o.base || '';
  const timeout = Number(o.timeoutMs) || 8000;

  let remote = '';

  // ① sw.js 足够小，优先它
  const swText = await fetchText(base + 'sw.js', timeout);
  if (swText) remote = versionFromSwText(swText);

  // ② 兜底：读 index.html 里的 APP_VER
  if (!remote) {
    const htmlText = await fetchText(base + 'index.html', timeout);
    if (htmlText) remote = pickBigger(remote, versionFromHtmlText(htmlText));
  }

  return decideUpdate({ local: APP_VER, remote });
}

/**
 * 执行更新：清缓存 + 让 SW 换班 + 刷新。
 * @param {string} remoteVer
 * @param {{reload?:Function}} [opts] 测试时可注入
 */
export async function applyUpdate(remoteVer, opts) {
  const o = opts || {};

  // ① 清掉所有缓存（不 await，让它后台跑）
  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      caches.keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .catch(() => {});
    }
  } catch (e) { /* 忽略 */ }

  // ② 让 Service Worker 更新并接管
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }
  } catch (e) { /* 忽略 */ }

  // ③ 记标记，刷新后由启动逻辑提示「已更新到 X」
  try {
    sessionStorage.setItem(UPDATED_FLAG, String(remoteVer || ''));
  } catch (e) { /* 忽略 */ }

  // ④ 刷新
  const reload = o.reload || (() => { location.reload(); });
  setTimeout(() => { try { reload(); } catch (e) {} }, 60);
}

/** 启动时读一次「刚更新过」标记，读完就删 */
export function takeUpdatedFlag() {
  try {
    const v = sessionStorage.getItem(UPDATED_FLAG);
    if (v) sessionStorage.removeItem(UPDATED_FLAG);
    return v || '';
  } catch (e) {
    return '';
  }
}

/** 带超时的 fetch 文本；失败返回空串 */
async function fetchText(url, timeoutMs) {
  if (typeof fetch !== 'function') return '';
  let timer = 0;
  try {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, timeoutMs);
    const res = await fetch(url + '?t=' + Date.now(), {
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    return await res.text();
  } catch (e) {
    clearTimeout(timer);
    return '';
  }
}
