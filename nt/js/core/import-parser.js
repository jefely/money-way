/**
 * 导入解析器（纯函数）
 * 层：第一层 · 数据基座
 *
 * 把用户粘贴的文本 / CSV 解析成「待建账户」+「待建流水」。
 * 不碰 DOM、不写库 —— 所以能在 Node 下逐条测。
 *
 * 支持的分隔符：Tab（从 Excel/表格复制）、逗号、竖线、多个空格。
 * 支持的日期：2026-08-20 / 260820 / 20260820 / 26-08-20
 * 账户列填**简码或名字**都可以，解析在调用方用索引完成。
 *
 * 行格式（列顺序固定，缺列用空占位）：
 *   日期 | 转出 | 转入 | 金额 | 备注
 */

import { normalizeCode } from './schema.js';
import { toAmount } from './stats.js';

/** 表头可能的写法（识别到就跳过这一行） */
const HEADER_HINTS = ['日期', '转出', '转入', '金额', '备注', 'date', 'from', 'to', 'amount', 'note'];

/**
 * @param {string} text
 * @returns {{
 *   rows: Array<{line:number, date:string, from:string, to:string, amountStr:string, amount:number, note:string}>,
 *   accounts: Array<{key:string, display:string, count:number}>,
 *   errors: Array<{line:number, raw:string, message:string}>,
 *   stats: {total:number, ok:number, bad:number}
 * }}
 */
export function parseImportText(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/);

  const rows = [];
  const errors = [];
  const accMap = new Map();   // key(大写或原名) → { key, display, count }

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const s = line.trim();
    if (!s) return;
    if (s.startsWith('#')) return;               // 注释行

    const cells = splitCells(s);
    if (cells.length < 3) {
      errors.push({ line: lineNo, raw: s, message: '列数不足（至少要有 日期/转出/转入）' });
      return;
    }
    if (looksLikeHeader(cells)) return;          // 表头

    const dateStr = cells[0];
    const from = cells[1] || '';
    const to = cells[2] || '';
    const amountStr = cells[3] || '';
    const note = cells.slice(4).join(' ').trim();

    const date = normalizeDate(dateStr);
    if (!date) {
      errors.push({ line: lineNo, raw: s, message: `日期认不出：「${dateStr}」` });
      return;
    }
    if (!from && !to) {
      errors.push({ line: lineNo, raw: s, message: '转出与转入不能都为空' });
      return;
    }
    const amount = toAmount(amountStr);
    if (!(amount > 0)) {
      errors.push({ line: lineNo, raw: s, message: `金额认不出：「${amountStr}」` });
      return;
    }

    rows.push({ line: lineNo, date, from, to, amountStr, amount, note });

    for (const name of [from, to]) {
      if (!name) continue;
      const key = normalizeCode(name) || name;
      if (!accMap.has(key)) accMap.set(key, { key, display: name, count: 0 });
      accMap.get(key).count += 1;
    }
  });

  return {
    rows,
    accounts: [...accMap.values()],
    errors,
    stats: { total: rows.length + errors.length, ok: rows.length, bad: errors.length },
  };
}

/** 按 Tab → 逗号 → 竖线 → 连续空格 的优先级切分 */
export function splitCells(line) {
  if (line.includes('\t')) return line.split('\t').map((x) => x.trim());
  if (line.includes(',')) return line.split(',').map((x) => x.trim());
  if (line.includes('|')) return line.split('|').map((x) => x.trim());
  return line.split(/\s{2,}/).map((x) => x.trim());
}

/** 多种日期写法 → YYYY-MM-DD；认不出返回空串 */
export function normalizeDate(input) {
  const s = String(input || '').trim();
  if (!s) return '';

  // 已是 ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isRealDate(s) ? s : '';

  const d = s.replace(/[^0-9]/g, '');
  let y;
  let m;
  let day;

  if (d.length === 8) {
    y = Number(d.slice(0, 4));
    m = Number(d.slice(4, 6));
    day = Number(d.slice(6, 8));
  } else if (d.length === 6) {
    const yy = Number(d.slice(0, 2));
    y = yy > 50 ? 1900 + yy : 2000 + yy;
    m = Number(d.slice(2, 4));
    day = Number(d.slice(4, 6));
  } else {
    return '';
  }

  if (!(m >= 1 && m <= 12) || !(day >= 1 && day <= 31)) return '';
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isRealDate(iso) ? iso : '';
}

/** 校验日期真实存在（2/30 这种要拒掉） */
function isRealDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 这一行像表头吗 */
function looksLikeHeader(cells) {
  const joined = cells.join(' ').toLowerCase();
  let hit = 0;
  for (const h of HEADER_HINTS) if (joined.includes(h.toLowerCase())) hit += 1;
  return hit >= 2 && !/\d{4,}/.test(cells[0]);
}

/**
 * 给导入用的账户补默认值：类型与统计分类都留空时给一个能用的默认。
 * @param {string} display 用户填的名字
 */
export function defaultAccountPatch(display) {
  const name = String(display || '').trim();
  const code = (normalizeCode(name.replace(/[^\w]/g, '')) || 'ACC').slice(0, 5) || 'ACC';
  return {
    name,
    code,
    type: '资产类',
    category: '未分类',
  };
}
