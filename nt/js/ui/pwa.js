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
        // updateViaCache:'none' —— sw.js 自己也必须每次走网络，
        // 否则浏览器按 HTTP 缓存给一份旧 sw.js，reg.update() 永远看不出变化
        await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      } catch (e) { /* 忽略 */ }

      // 只在第一次清完后重载一次，避免循环
      if (!sessionStorage.getItem('nt_sw_cleared')) {
        sessionStorage.setItem('nt_sw_cleared', '1');
        location.reload();
      }
    })();
    return;
  }

  // 新 SW 接管的那一刻自动刷新一次。
  //
  // 为什么需要：sw.js 用的是 stale-while-revalidate（离线优先），命中缓存就
  // 立刻返回旧文件、后台再更新。所以**当前这一页**一定是用旧 CSS/JS 渲染的，
  // 新版本要等下次打开才生效 —— 用户看到的就是「明明更新了，样式还是老的」，
  // 得手动开两次。这里在换班瞬间重载，一次到位。
  //
  // 只在「原本就有控制器」时重载：首次安装也会触发 controllerchange，
  // 那一次页面本来就是最新的，重载只会白闪一下。
  const hadController = !!navigator.serviceWorker.controller;
  let swapped = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swapped || !hadController) return;
    swapped = true;
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    // 注册完主动问一次有没有新版：浏览器默认只在导航时检查 sw.js，
    // 一直开着不关的窗口可能几小时都发现不了更新。
    .then((reg) => reg.update().catch(() => {}))
    .catch(() => {});
}
