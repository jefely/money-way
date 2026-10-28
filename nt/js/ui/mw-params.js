// 界面：全局：环图参数（CSS 变量 → 数字）
/**
 * 环图参数的读取（UI 层）
 *
 * 数据只往一个方向流：
 *   core/mw-settings.js  →  SCHEMA / 默认值 / min,max
 *   core/settings.js     →  normalize（含钳制）
 *   ui/apply-settings.js →  写 --nt-mw-* 到 :root，并广播 nt-layout
 *   ui/mw-params.js      →  从 :root 读回来，交给渲染器与计算器
 *
 * 为什么不直接 import 常量：面板改值时只有 CSS 变量会变，模块常量不会 ——
 * 那正是「调了没反应」的由来。常量还在（渲染器拿它当默认值），
 * 但**运行时的值只认 CSS 变量**。
 *
 * 缓存：一次 render 里 path.js 和 path-view.js 会各要一遍参数，
 * 每次都 getComputedStyle 是同步强制样式重算，250 条线的图上会掉帧。
 * apply-settings 广播 nt-layout 时，订阅方调 invalidate() 让它重读。
 */

import { MW_SCHEMA, MW_DEFAULTS } from '../core/mw-settings.js';

/** 默认参数（Node 里跑测试、或还没有任何 CSS 变量时用） */
export function defaultParams() {
  return { ...MW_DEFAULTS };
}

let cache = null;

/** 参数可能变了：下次 readMwParams 重新从 :root 读 */
export function invalidateMwParams() {
  cache = null;
}

/**
 * 当前参数（基准单位）。
 * @returns {typeof MW_DEFAULTS}
 */
export function readMwParams() {
  if (cache) return cache;

  const out = { ...MW_DEFAULTS };
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (root) {
    const cs = getComputedStyle(root);
    for (const s of MW_SCHEMA) {
      // parseFloat 能吃掉 '640' / '640px' / ' 640 ' 三种写法；
      // 读不到（空串）时保留默认值，不会把整张图打成 NaN
      const n = parseFloat(cs.getPropertyValue(s.cssVar));
      if (Number.isFinite(n)) out[s.field] = n;
    }
  }

  cache = out;
  return out;
}

/**
 * 订阅「界面参数变了」。
 *
 * 回调之前先让缓存失效 —— 不失效的话，重画时读到的还是上一轮的 CSS 变量值，
 * 表现就是「面板调了，图要等下一次切页才变」。
 *
 * @param {() => void} handler 参数变化后要做的事（一般是重画）
 * @returns {() => void} 退订
 */
export function onLayoutChange(handler) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const run = () => {
    invalidateMwParams();
    if (typeof handler === 'function') handler();
  };
  window.addEventListener('nt-layout', run);
  return () => window.removeEventListener('nt-layout', run);
}
