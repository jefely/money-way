// 界面：（无界面）官方站点来源判断
/**
 * 纯函数：调用方把 location.origin 传进来。
 * 本文件不读 location，方便 Node 测试。
 */

import { APP_URL } from './meta.js';

export { APP_URL };

/**
 * @param {string} origin location.origin；空串表示还不知道
 * @returns {{ok:boolean, local:boolean, dev:boolean, official:string, text:string}}
 */
export function originWarning(origin) {
  const official = APP_URL;
  let officialOrigin = '';
  try {
    officialOrigin = new URL(official).origin;
  } catch (e) {
    officialOrigin = '';
  }
  const value = String(origin || '');
  if (!value) {
    return { ok: true, local: true, dev: true, official, text: '' };
  }
  if (officialOrigin && value === officialOrigin) {
    return { ok: true, local: false, dev: false, official, text: '' };
  }
  const local = value === 'null'
    || value.indexOf('file:') === 0
    || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(value);
  const text = local
    ? '当前是本机打开，不是官方站点 ' + official
    : '非官方或被篡改的版本。请从官方地址打开：' + official;
  return { ok: false, local, dev: local, official, text };
}

/** 官方域名上如果完整性清单没签名，按被篡改处理。本机开发构建放行。 */
export function devManifestOnOfficial(origin, verdict) {
  if (!verdict || !verdict.dev || verdict.tampered) return false;
  const st = originWarning(origin);
  return st.ok === true && st.dev === false;
}
