// 界面：PWA 注册

/**
 * Service Worker 注册（UI 层，只在浏览器里跑）
 *
 * ?debug=1 是「不用旧缓存」的意思，**不是「不装 SW」**。
 *
 * 早先的实现是直接 unregister，副作用很大：
 *   · 在 ?debug=1 下永远没有离线能力
 *   · 一直用 debug 地址访问，就会以为「这软件不能离线」
 *   · 断网时浏览器直接请求网络 → 「打不开网页」
 *
 * 现在：清掉旧缓存后**立刻重新注册**。
 *   · 下次加载一定拿到新代码（缓存已空）
 *   · SW 仍在，离线能力不中断
 */

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const isDebug = new URLSearchParams(location.search).has('debug');

  if (isDebug) {
    (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();

        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      } catch (e) { /* 忽略 */ }

      // 关键：注销完立刻重新注册，别让离线能力断掉
      try {
        await navigator.serviceWorker.register('./sw.js');
      } catch (e) { /* 忽略 */ }

      // 只在第一次清完后重载一次，避免循环
      if (!sessionStorage.getItem('nt_sw_cleared')) {
        sessionStorage.setItem('nt_sw_cleared', '1');
        location.reload();
      }
    })();
    return;
  }

  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
