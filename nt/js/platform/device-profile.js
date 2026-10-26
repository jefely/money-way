// 界面：（无界面）设备指纹
/**
 * ☐10 设备特征库
 * 层：第四层 · 平台适配
 *
 * 只输出「这台设备是什么样」，**严禁写任何业务逻辑**。
 * 有了它，UA 判断、安全区、dpr 之类的补丁就不会散落在各处。
 */

/**
 * @param {object} [env] 便于测试时注入假环境；不传则读全局
 * @returns {{isIOS:boolean, isAndroid:boolean, isSafari:boolean, isStandalone:boolean,
 *            safeAreaTop:number, safeAreaBottom:number, dpr:number,
 *            viewport:{width:number,height:number}, hasTouch:boolean, isDesktop:boolean}}
 */
export function readDeviceProfile(env) {
  const g = env || (typeof globalThis !== 'undefined' ? globalThis : {});
  const nav = g.navigator || {};
  const ua = String(nav.userAgent || '');
  const win = g.window || g;

  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|Edg|FxiOS/i.test(ua);

  // 独立窗口（已加到主屏）
  const isStandalone = !!(nav.standalone) || (typeof win.matchMedia === 'function'
    && win.matchMedia('(display-mode: standalone)').matches);

  const width = Number(win.innerWidth) || 0;
  const height = Number(win.innerHeight) || 0;

  return {
    isIOS,
    isAndroid,
    isSafari,
    isStandalone,
    // 安全区由 CSS env() 读取，这里只给一个「是否需要留白」的布尔判断
    safeAreaTop: isIOS && isStandalone ? 1 : 0,
    safeAreaBottom: isIOS ? 1 : 0,
    dpr: Number(win.devicePixelRatio) || 1,
    viewport: { width, height },
    hasTouch: Number(nav.maxTouchPoints) > 0 || 'ontouchstart' in win,
    isDesktop: width >= 1024,
  };
}
