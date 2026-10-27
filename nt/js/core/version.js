/**
 * 版本与更新判定（纯函数）
 * 层：第一层 · 数据基座
 *
 * 版本号形如 `nt-v0.04` 或 `mw-personal-v13.66`，规则：
 *   取最后一段 `v<主>.<次>`，比较时按 主×1000 + 次 算大小。
 *
 * 为什么单独一个文件：版本号同时出现在
 *   · js/core/version.js（唯一源）
 *   · sw.js 的 CACHE_NAME（静态文件，改不到 JS）
 *   · index.html 的 <title>
 * 门禁会检查前两者是否一致，所以这里必须是纯函数、可被 Node 直接读。
 */

/** 当前版本 —— **改版本号只改这一处**，然后同步 sw.js 的 CACHE_NAME */
export const APP_VER = 'nt-v0.99';

/** 版本号 → 可比较的数字；认不出返回 -1 */
export function parseVer(v) {
  const m = String(v || '').match(/v?(\d+)\.(\d+)/);
  if (!m) return -1;
  return Number(m[1]) * 1000 + Number(m[2]);
}

/** a 是否比 b 新 */
export function isNewer(a, b) {
  return parseVer(a) > parseVer(b);
}

/** 取两者里较新的那个（用于「sw.js 与 index.html 各报一个版本」时选大的） */
export function pickBigger(a, b) {
  return parseVer(a) >= parseVer(b) ? a : b;
}

/** 归一化显示：'nt-v0.04' / 'v0.04' / '0.04' → 'nt-v0.04' */
export function normalizeVer(v, prefix) {
  const m = String(v || '').match(/v?(\d+\.\d+)/);
  if (!m) return '';
  return (prefix || 'nt-') + 'v' + m[1];
}

/**
 * 从 sw.js 的文本里抠出版本号。
 * CACHE_NAME 形如 'nt-v0.04.01' —— 只取前两段，避免与 APP_VER 的三段写法不等。
 */
export function versionFromSwText(text) {
  const m = String(text || '').match(/CACHE_NAME\s*=\s*['"]nt-v(\d+)\.(\d+)/);
  return m ? 'nt-v' + m[1] + '.' + m[2] : '';
}

/** 从 index.html 的文本里抠出版本号（兜底路径） */
export function versionFromHtmlText(text) {
  const m = String(text || '').match(/APP_VER\s*=\s*['"]([^'"]+)['"]/);
  return m ? normalizeVer(m[1]) : '';
}

/**
 * 判定更新结果。
 * @param {{local:string, remote:string}} input
 * @returns {{update:boolean, local:string, remote:string, reason:string}}
 */
export function decideUpdate(input) {
  const local = String((input && input.local) || '');
  const remote = String((input && input.remote) || '');

  if (!remote || parseVer(remote) < 0) {
    return { update: false, local, remote, reason: 'no-version' };
  }
  if (isNewer(remote, local)) {
    return { update: true, local, remote, reason: 'newer' };
  }
  return { update: false, local, remote, reason: 'up-to-date' };
}
