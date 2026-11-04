// 界面：（无界面）写盘冲突判定
/**
 * 多标签写盘：期望的密文和磁盘上的不一致，就不能覆盖。
 * 层：第一层 · 数据基座
 */
export function cipherMatches(expected, current) {
  return String(expected || '') === String(current || '');
}
