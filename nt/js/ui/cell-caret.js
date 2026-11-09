// 界面：点击坐标 → 输入框里的字符下标（双击定位光标）
/**
 * 光标定位
 * 层：第五层 · UI
 *
 * Chrome / Edge 的 `document.caretPositionFromPoint` 对 `<input>` 直接返回
 * 字符下标（实测 offsetNode === input）；其它浏览器降级为按字体逐字量宽。
 * 从 cell-edit.js 拆出来，只为守住「单文件 300 行有效代码」的公约。
 */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

let ctxCache = null;
function measureCtx() {
  if (ctxCache === null) {
    const cv = document.createElement('canvas');
    ctxCache = cv.getContext ? cv.getContext('2d') : null;
  }
  return ctxCache;
}

function caretIndexAt(input, x, y) {
  const text = String(input.value || '');
  const len = text.length;
  if (!len) return 0;

  const cp = document.caretPositionFromPoint
    ? document.caretPositionFromPoint(x, y) : null;
  if (cp && (cp.offsetNode === input
    || (cp.offsetNode && cp.offsetNode.parentNode === input))) {
    return clamp(cp.offset, 0, len);
  }

  // 其它浏览器：按字体逐字量宽度（中文全角也准）
  const rect = input.getBoundingClientRect();
  const cs = window.getComputedStyle(input);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const target = x - rect.left - padL + (input.scrollLeft || 0);
  const ctx = measureCtx();
  if (!ctx) return len;
  ctx.font = cs.font || (cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily);
  const ls = parseFloat(cs.letterSpacing) || 0;
  let acc = 0;
  for (let i = 0; i < len; i += 1) {
    const w = ctx.measureText(text[i]).width + ls;
    if (target < acc + w / 2) return i;
    acc += w;
  }
  return len;
}

/**
 * 把光标放到点击位置；x/y 不是数字时放到末尾。
 * @param {HTMLInputElement} input
 * @param {number} [x]
 * @param {number} [y]
 */
export function placeCaret(input, x, y) {
  const len = String(input.value || '').length;
  const idx = (Number.isFinite(x) && Number.isFinite(y)) ? caretIndexAt(input, x, y) : len;
  try { input.setSelectionRange(idx, idx); } catch (e) { /* 忽略 */ }
}
