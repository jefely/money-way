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

/**
 * 金额 → 取整后的 "¥16,500"（**不保留小数**；0 → ¥0）。
 *
 * 用在「分期金额」这种用户手填的本金格，以及环图/路径追踪的金额：
 * 用户 2026-11 明确要求这些地方不要两位小数。存的值不动，只改显示。
 */
export function moneyInt(v) {
  return moneyAlways(Math.round(Number(v) || 0)).replace(/\.00$/, '');
}

/**
 * 统计页专用：**纯整数、不带 ¥、不带千分位**（用户 2026-11）。
 *
 * 手机上 5 列挤一屏，`¥203,047.50` 要 12 个字符宽，而一列只剩 60 多像素；
 * `203048` 只有 6 个字符，直接把四成宽度还回来。逗号也去掉 —— 一列就 6~7 个字符，
 * 千分位省不下多少，反而让数字更难和别的格子对齐。
 * 四舍五入到整数（显示用，存的值不动）。
 */
export function statAmount(v) {
  return String(Math.round(Number(v) || 0));
}

/** 今天，YYYY-MM-DD。now 只给测试注入。 */
export function todayIso(now) {
  const d = now instanceof Date ? now : new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/**
 * 日期格输入。`:` / `：` 单独出现时表示今天。
 * 6 位 YYMMDD、8 位 YYYYMMDD 都认；其余原样返回，空则今天。
 */
export function normalizeTypedDate(v, now) {
  const s = String(v || '').trim();
  if (s === ':' || s === '：') return todayIso(now);
  const d = s.replace(/[^0-9]/g, '');
  const clock = now instanceof Date ? now : new Date();
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (d.length === 6) {
    const yy = Number(d.slice(0, 2));
    const full = yy > clock.getFullYear() % 100 ? 1900 + yy : 2000 + yy;
    return `${full}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
  }
  return s || todayIso(clock);
}

/** 输入框回填：0/空 → 空串（区分「没填」与「填了 0」）。 */
export function moneyOrBlank(v) {
  if (v === '' || v == null) return '';
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '';
  return money(n);
}

/**
 * 短日期：2026-08-30 → 260830（六位，与单文件版一致）
 *
 * 之前输出 "26-08-30"（带连字符），和单文件版的 YYMMDD 不是一个格式，
 * 表格里一列日期看着就是「格式不对」。调用方本来就大多要 .replace(/-/g,'')，
 * 统一成六位之后那些地方也天然正确。
 */
export function shortDate(iso) {
  const s = String(iso || '').replace(/[^0-9]/g, '');
  if (s.length >= 8) return s.slice(2, 8);
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
