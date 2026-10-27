// 界面：PWA 注册
/**
 * Service Worker 注册（UI 层，只在浏览器里跑）
 *
 * ?debug=1 时反过来**注销**旧 SW —— 本地调试时旧缓存会把改动挡住，
 * 而且只自动重载一次，避免循环刷新。
 */

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const isDebug = new URLSearchParams(location.search).has('debug');

  if (isDebug) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => {
        if (!regs.length) return;
        regs.forEach((r) => r.unregister());
        if (navigator.serviceWorker.controller && !sessionStorage.getItem('nt_sw_cleared')) {
          sessionStorage.setItem('nt_sw_cleared', '1');
          location.reload();
        }
      })
      .catch(() => {});
    return;
  }

  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
