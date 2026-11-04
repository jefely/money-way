// 界面：主屏幕备份提醒
/**
 * 安装到主屏幕之后的备份提醒，外加请求持久化存储。
 * 层：第五层 · UI
 *
 * persist() 在安卓已安装的 PWA 上经常能成功，iPhone 上常常直接返回 false。
 * 失败也不挡使用：真正靠得住的是用户分享出去的加密文件。
 */

import { readDeviceProfile } from '../platform/device-profile.js';
import { shouldRemindBackup } from '../core/backup-reminder.js';

const LAST_KEY = 'nt_backup_at';
const SNOOZE_KEY = 'nt_backup_snooze';

function readNum(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; }
}

export function markBackupDone(now) {
  try { localStorage.setItem(LAST_KEY, String(Number(now) || Date.now())); } catch (e) { /* 隐私模式写不进 */ }
  const bar = document.getElementById('nt-backup-banner');
  if (bar) bar.hidden = true;
}

export function snoozeBackup(now) {
  try { localStorage.setItem(SNOOZE_KEY, String(Number(now) || Date.now())); } catch (e) { /* 忽略 */ }
  const bar = document.getElementById('nt-backup-banner');
  if (bar) bar.hidden = true;
}

/** 尽量让系统别把主屏幕账本清掉。不保证成功。 */
export async function askPersist() {
  try {
    const storage = navigator.storage;
    if (!storage || typeof storage.persist !== 'function') return 'unsupported';
    if (typeof storage.persisted === 'function' && await storage.persisted()) return 'granted';
    const ok = await storage.persist();
    return ok ? 'granted' : 'denied';
  } catch (e) {
    return 'unsupported';
  }
}

export function installBackupGuard() {
  askPersist();
  const bar = document.getElementById('nt-backup-banner');
  if (!bar) return;
  const standalone = !!(readDeviceProfile().isStandalone);
  const show = shouldRemindBackup({
    standalone,
    lastAt: readNum(LAST_KEY),
    dismissedAt: readNum(SNOOZE_KEY),
    now: Date.now(),
  });
  bar.hidden = !show;
  const later = document.getElementById('nt-backup-later');
  if (later && later.dataset.bound !== '1') {
    later.dataset.bound = '1';
    later.addEventListener('click', () => snoozeBackup(Date.now()));
  }
}
