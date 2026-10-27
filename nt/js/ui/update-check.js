/**
 * 版本更新（UI 层）
 * 层：第五层 · UI
 *
 * 参照单文件版的做法：
 *   ① 只拉 sw.js（几 KB），从 CACHE_NAME 读远端版本；读不到才退回拉 index.html
 *   ② 远端更新 → 清 Cache Storage + 让 SW skipWaiting + 记一个标记 + reload
 *   ③ 已是最新 → 不动缓存，只把远端版本号显示出来
 *
 * 不用 Service Worker 的 waiting 判断：只改 index.html 而 sw.js 没变时，
 * 浏览器根本不触发 install，waiting 永远是空，会一直说「已是最新」。
 */

import { APP_VER, decideUpdate, versionFromSwText, versionFromHtmlText, pickBigger } from '../core/version.js';

export const UPDATED_FLAG = 'nt_updated';

/** 防更新循环：30 秒内只允许触发一次 */
const LOOP_GUARD = 'nt_update_guard';

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
/**
 * 执行更新：清缓存 + 让 SW 换班 + 刷新。
 *
 * 注意两点（上一版就是这里出的问题）：
 *   ① 清缓存必须 await —— 不 await 就刷新，缓存可能还没删完，
 *      刷新后拿到的仍是旧文件，于是「检测到更新 → 刷新 → 还是旧的 → 又检测到更新」无限循环
 *   ② 打一个时间戳标记，30 秒内不再触发更新，避免任何形式的循环
 */
/**
 * @deprecated 已不再使用。改用 hardReload。
 *
 * 为什么弃用：它只清缓存 + 让 SW 换班，而 reg.update() 是异步的，
 * 250ms 后 reload 时新 SW 往往还没接管，刷新后仍是旧文件 ——
 * 用户点了没反应，以为「更新失败」。hardReload 注销 SW，一定拿到最新的。
 */
export async function applyUpdate(remoteVer, opts) {
  const o = opts || {};

  // 防循环
  try {
    const last = Number(sessionStorage.getItem(LOOP_GUARD) || 0);
    if (last && Date.now() - last < 30000) {
      return { skipped: true, reason: 'loop-guard' };
    }
    sessionStorage.setItem(LOOP_GUARD, String(Date.now()));
  } catch (e) { /* 忽略 */ }

  // ① 清缓存（必须等到清完）
  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
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

  // ③ 记「刚更新过」，刷新后由启动逻辑提示
  try { sessionStorage.setItem(UPDATED_FLAG, String(remoteVer || '')); } catch (e) { /* 忽略 */ }

  // ④ 刷新（留 250ms 让上面的操作落地）
  const reload = o.reload || (() => { location.reload(); });
  setTimeout(() => { try { reload(); } catch (e) {} }, 250);
  return { updated: true, remote: remoteVer };
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

/**
 * 硬重载：清掉所有 Cache Storage + 注销 Service Worker + 刷新。
 *
 * 为什么需要它：旧的 SW 是 cache-first，连 sw.js 本身都被缓存过，
 * 于是版本检查永远读到旧版本号、看起来「没问题」，但界面还是旧的。
 * 这个按钮把缓存和 SW 一起清掉，是那种情况唯一可靠的解法。
 *
 * @param {{reload?:Function}} [opts] 测试时可注入
 */
export async function hardReload(opts) {
  const o = opts || {};
  const reload = o.reload || (() => { location.reload(); });

  /**
   * 更新 = 让 SW 换班，**不注销、不清缓存**。
   *
   * 为什么不能清缓存 + 注销：Service Worker 是离线可用的唯一基础。
   * 注销之后断网刷新会得到浏览器原生的「打不开网页」，而且它会一直这样 ——
   * 因为用户手上已经没有 SW 了，只能联网重新装一次。
   *
   * 正确顺序：
   *   ① reg.update() 让浏览器去比对 sw.js
   *   ② 等新 SW install 完成 —— 它在 install 里会把全部资源预缓存好
   *   ③ SKIP_WAITING 让它立刻接管
   *   ④ 刷新
   * 全程 SW 都在，离线能力一次都没断。
   */
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration();

      if (reg) {
        // ① 检查新版
        try { await reg.update(); } catch (e) { /* 离线时这里会失败，正常 */ }

        // ② 等新 SW 装好（最多等 20 秒）
        const incoming = reg.installing;
        if (incoming) {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 20000);
            incoming.addEventListener('statechange', () => {
              if (incoming.state === 'installed' || incoming.state === 'activated') {
                clearTimeout(timer);
                resolve();
              }
            });
          });
        }

        // ③ 让它接管
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        // 从来没装过：注册一次，等它就绪再刷新
        const reg2 = await navigator.serviceWorker.register('./sw.js', { scope: './' });
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 20000);
          if (reg2.active) { clearTimeout(timer); resolve(); return; }
          const w = reg2.installing;
          if (w) {
            w.addEventListener('statechange', () => {
              if (w.state === 'installed' || w.state === 'activated') {
                clearTimeout(timer);
                resolve();
              }
            });
          }
        });
      }
    }
  } catch (e) {
    /* 任何一步失败都不该让用户卡住，直接刷新即可 */
  }

  // ④ 刷新（SW 保留）
  setTimeout(() => { try { reload(); } catch (e) {} }, 150);
}

/**
 * 彻底重置：清所有缓存 + 注销所有 SW。
 *
 * **只在真的坏了的时候用** —— 它会拆掉离线能力，之后必须联网才能重新装回来。
 * 所以入口藏起来（连点几次版本号才出现），不作为常规按钮。
 */
export async function resetApp(opts) {
  const o = opts || {};

  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch (e) { /* 忽略 */ }

  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker
        && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) { /* 忽略 */ }

  const reload = o.reload || (() => { location.reload(); });
  setTimeout(() => { try { reload(); } catch (e) {} }, 100);
}

/**
 * 启动时把版本号写进页面的 #nt-ver；如果上一次刚更新过，顺手提示一下。
 * @param {(text:string)=>void} [setFooter]
 */
export function initVersion(setFooter) {
  try {
    const ver = document.getElementById('nt-ver');
    if (ver) ver.textContent = APP_VER;
  } catch (e) { /* 忽略 */ }

  const updated = takeUpdatedFlag();
  if (updated && typeof setFooter === 'function') setFooter('已更新到 ' + updated);
}
