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

  // 不在 controllerchange 上自动刷新。
  //
  // 用户 2026-11-09：更新后重新输密码进入，过一会儿又弹回解锁页。
  // 原因：sw.js 用 skipWaiting + clients.claim，新 SW 接管时会触发 controllerchange；
  // 之前这里在「解锁页可见」时 reload —— 用户刚输完密码、enterApp 还没藏起解锁页的
  // 那一小段里，controllerchange 一到就刷新；密钥只在内存，刷新即回锁屏。
  // 现在一律不自动刷新：新 SW 接管后本页继续跑旧代码（没有损失），
  // 下次自然打开就是新文件；要立刻更新走校验页的「更新」（hardReload）。

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    // 注册完主动问一次有没有新版：浏览器默认只在导航时检查 sw.js，
    // 一直开着不关的窗口可能几小时都发现不了更新。
    .then((reg) => reg.update().catch(() => {}))
    .catch(() => {});
}
