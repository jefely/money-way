// 界面：（无界面）备份提醒判定
/**
 * 主屏幕账本的备份提醒
 * 层：第一层 · 数据基座
 *
 * 只在「已安装到主屏幕」时提醒。浏览器标签里不吵。
 * 七天没导出过，或从未导出，就算该提醒。关掉后一天内不再出现。
 */

export const BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;
export const BACKUP_SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{standalone:boolean, lastAt:number, dismissedAt:number, now:number}} x
 */
export function shouldRemindBackup(x) {
  const o = x || {};
  if (!o.standalone) return false;
  const now = Number(o.now) || 0;
  const dismissed = Number(o.dismissedAt) || 0;
  if (dismissed && now - dismissed < BACKUP_SNOOZE_MS) return false;
  const last = Number(o.lastAt) || 0;
  if (!last) return true;
  return now - last >= BACKUP_STALE_MS;
}
