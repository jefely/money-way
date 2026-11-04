// 界面：（无界面）本机安装号与见过的最大时间
/**
 * 安装号放在 localStorage，不写进账本备份。
 * 备份拷到新设备会是另一个安装号，从而占用激活码上的名额。
 * 见过的最大时间两边都记：账本里一份（随加密备份走），本机再留一份，避免用旧备份把时钟拨回去。
 */

const ID_KEY = 'nt-install-id';
const SEEN_KEY = 'nt-license-max-seen';

export function getInstallId() {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = makeId();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch (e) {
    return 'install-ephemeral';
  }
}

export function readLocalMaxSeen() {
  try {
    const n = Number(localStorage.getItem(SEEN_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (e) {
    return 0;
  }
}

export function writeLocalMaxSeen(ms) {
  const next = Math.max(readLocalMaxSeen(), Number(ms) || 0);
  try {
    localStorage.setItem(SEEN_KEY, String(next));
  } catch (e) { /* 隐私模式写不进去时，账本里仍有一份 */ }
  return next;
}

function makeId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'inst-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
