// 数据：日期筛选框的解析（纯函数，Node 可跑）
/**
 * 日期筛选
 * 层：第一层 · 数据基座
 *
 * 照单文件版的 qParseRange / qExpandStart / qExpandEnd 搬过来，格式一致：
 *   260801            单日
 *   2608              整月（2026-08-01 ~ 08-31）
 *   26                整年
 *   260801-260807     区间（分隔符可以是 - ~ ～ — 到）
 *   20260801          也认 8 位
 *
 * 年份一律按 20YY 展开（与单文件版一致）。
 */

const clean = (v) => String(v == null ? '' : v).replace(/\D/g, '');

function lastDayOf(year, month) {
  return new Date(year, month, 0).getDate();
}

/** 一个日期片段的**第一天**（YY / YYMM / YYMMDD / YYYYMMDD） */
export function expandStart(tok) {
  const q = clean(tok);
  if (!q) return null;
  if (q.length === 8) return `${q.slice(0, 4)}-${q.slice(4, 6)}-${q.slice(6, 8)}`;
  if (q.length === 6) return `20${q.slice(0, 2)}-${q.slice(2, 4)}-${q.slice(4, 6)}`;
  if (q.length === 4) return `20${q.slice(0, 2)}-${q.slice(2, 4)}-01`;
  if (q.length === 2) return `20${q}-01-01`;
  return null;
}

/** 一个日期片段的**最后一天** */
export function expandEnd(tok) {
  const q = clean(tok);
  if (!q) return null;
  if (q.length === 8) return `${q.slice(0, 4)}-${q.slice(4, 6)}-${q.slice(6, 8)}`;
  if (q.length === 6) return `20${q.slice(0, 2)}-${q.slice(2, 4)}-${q.slice(4, 6)}`;
  if (q.length === 4) {
    const yy = `20${q.slice(0, 2)}`;
    const mm = q.slice(2, 4);
    const last = lastDayOf(Number(yy), Number(mm));
    return `${yy}-${mm}-${String(last).padStart(2, '0')}`;
  }
  if (q.length === 2) return `20${q}-12-31`;
  return null;
}

/**
 * 日期筛选框 → { from, to }（ISO）；认不出返回 null。
 * @param {string} text
 */
export function parseDateRange(text) {
  const raw = String(text == null ? '' : text).replace(/\s/g, '');
  if (!raw) return null;

  // 横线可能是 - ~ ～ — 或「到」
  const m = raw.match(/^([0-9]{2,8})[-~～—到]([0-9]{2,8})$/);
  if (m) {
    const from = expandStart(m[1]);
    const to = expandEnd(m[2]);
    if (!from || !to) return null;
    return { from, to };
  }

  // 单值：按「该范围的第一天 ~ 最后一天」展开
  const from = expandStart(raw);
  const to = expandEnd(raw);
  if (!from || !to) return null;
  return { from, to };
}

/** 一个 ISO 日期是否落在筛选框的范围内（认不出时返回 true，不过滤） */
export function dateInRange(isoDate, text) {
  const r = parseDateRange(text);
  if (!r) return true;
  const d = String(isoDate || '');
  if (!d) return false;
  return d >= r.from && d <= r.to;
}
