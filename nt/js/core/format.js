// 界面：（无界面）金额/日期格式化
/**
 * 纯函数：格式化。
 *
 * 不依赖浏览器（不用 toLocaleString 的可选参数差异），Node 与浏览器结果一致。
 */

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 金额 → "¥1,400.00"；0/空 → "—"。 */
export function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const [int, dec] = abs.toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}¥${grouped}.${dec}`;
}

/** 合计用：永远显示数字（0 也显示 ¥0.00）。 */
export function moneyAlways(v) {
  const n = Number(v) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const [int, dec] = abs.toFixed(2).split('.');
  return `${sign}¥${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}

/** 输入框回填：0/空 → 空串（区分「没填」与「填了 0」）。 */
export function moneyOrBlank(v) {
  if (v === '' || v == null) return '';
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '';
  return money(n);
}

/** ISO 日期 → "26-08-30"（界面短格式）。 */
export function shortDate(iso) {
  const s = String(iso || '').replace(/[^0-9]/g, '');
  if (s.length >= 8) return `${s.slice(2, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return String(iso || '');
}

/** 校验日期是否合法 ISO（YYYY-MM-DD）。
 *  注意：不能用 toISOString 比较 —— 它是 UTC，本地时区（如 +8）会把日期减一天，
 *  于是 "2026-08-30" 被判成非法。这里改用本地年月日还原。 */
export function isIsoDate(v) {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return false;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}` === s;
}

/** 数字 → 中文序号（给分组标签用，1 → 一）。 */
export function cnNumber(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v < 10) return CN_DIGITS[v];
  return String(v);
}
