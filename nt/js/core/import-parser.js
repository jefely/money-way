/**
 * 账本文本解析器（纯函数）
 * 层：第一层 · 数据基座
 *
 * 支持用户定义的**两段式**格式：
 *
 *   账户：
 *   类型，分类，简码，名称，期初，账单日，还款日，
 *   资产类，现金，XJ，现金，200，
 *
 *   流水：
 *   日期，转出，转入，金额，备注，
 *   260801，XJ，S，3.5，
 *
 * 兼容模式（都是真实会遇到的输入）：
 *   · 分隔符：中文逗号「，」、半角逗号「,」、Tab、竖线、双空格 —— 任意混用
 *   · 全角数字与全角符号（２６０８０１ → 260801）
 *   · 行尾多余的空列（「…，200，」最后那个空 cell 会被丢掉）
 *   · 表头行（首列是「类型」「日期」这类中文列名）自动跳过
 *   · 空行、# 注释、BOM
 *   · 没有「账户：」「流水：」标记时，整篇按流水解析（兼容旧粘贴）
 *   · 日期：YYMMDD / YYYYMMDD / YYYY-MM-DD / YY-MM-DD / 带斜杠
 *
 * 账户按**名称**判重由调用方负责；这里只如实解析。
 */

import { normalizeCode, ACCOUNT_TYPE } from './schema.js';
import { toAmount } from './stats.js';

export const SECTION = { ACCOUNT: 'account', TRANSACTION: 'transaction' };

const TYPES = [
  ACCOUNT_TYPE.ASSET, ACCOUNT_TYPE.LIABILITY, ACCOUNT_TYPE.EQUITY,
  ACCOUNT_TYPE.INCOME, ACCOUNT_TYPE.EXPENSE,
];

/** 段标题的识别词 */
const ACCOUNT_HEAD = /^账\s*户\s*[:：]?\s*$/;
const TX_HEAD = /^流\s*水\s*[:：]?\s*$/;

/** 表头提示词 */
const HEADER_WORDS = ['类型', '分类', '简码', '名称', '期初', '账单日', '还款日',
  '日期', '转出', '转入', '金额', '备注'];

/**
 * 主入口。
 * @param {string} text
 * @returns {{
 *   accounts: Array<{line:number,type:string,category:string,code:string,name:string,
 *                    opening:number,billDay:string,repayDay:string}>,
 *   transactions: Array<{line:number,date:string,from:string,to:string,amount:number,note:string}>,
 *   errors: Array<{line:number,raw:string,message:string}>,
 *   stats: {accountOk:number, accountBad:number, txOk:number, txBad:number, total:number}
 * }}
 */
export function parseLedgerText(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);

  const accounts = [];
  const transactions = [];
  const errors = [];

  // 先扫一遍看有没有段标记；没有就整篇当流水
  const hasSections = lines.some((l) => looksLikeSectionHeader(l));
  let mode = hasSections ? null : SECTION.TRANSACTION;

  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = normalizePunct(rawLine).trim();
    if (!line) return;
    if (line.startsWith('#')) return;

    if (looksLikeSectionHeader(line)) {
      mode = ACCOUNT_HEAD.test(line) ? SECTION.ACCOUNT : SECTION.TRANSACTION;
      return;
    }

    const cells = splitCells(line);
    if (!cells.length) return;
    if (isHeaderRow(cells)) return;              // 表头

    if (mode === SECTION.ACCOUNT) parseAccountRow(cells, lineNo, line, accounts, errors);
    else parseTxRow(cells, lineNo, line, transactions, errors);
  });

  // 没写段标题、但明显是 7 列账户格式时，别硬当流水
  // （这里不猜：有段标题才解析账户，避免把流水误判成账户）

  return {
    accounts,
    transactions,
    errors,
    stats: {
      accountOk: accounts.length,
      accountBad: errors.filter((e) => e.section === SECTION.ACCOUNT).length,
      txOk: transactions.length,
      txBad: errors.filter((e) => e.section === SECTION.TRANSACTION).length,
      total: accounts.length + transactions.length + errors.length,
    },
  };
}

/* ---------- 账户行 ---------- */

function parseAccountRow(cells, lineNo, raw, out, errors) {
  const cells7 = trimTrailingEmpty(cells);
  const type = cells7[0] || '';
  const name = cells7[3] || '';

  if (!TYPES.includes(type)) {
    errors.push({
      line: lineNo, raw, section: SECTION.ACCOUNT,
      message: `账户类型认不出：「${type}」（只能是 ${TYPES.join(' / ')}）`,
    });
    return;
  }
  if (!name) {
    errors.push({ line: lineNo, raw, section: SECTION.ACCOUNT, message: '账户缺名称' });
    return;
  }

  out.push({
    line: lineNo,
    type,
    category: cells7[1] || '未分类',
    code: normalizeCode(cells7[2] || ''),
    name,
    opening: toAmount(cells7[4] || ''),
    billDay: String(cells7[5] || ''),
    repayDay: String(cells7[6] || ''),
  });
}

/* ---------- 流水行 ---------- */

function parseTxRow(cells, lineNo, raw, out, errors) {
  const c = trimTrailingEmpty(cells);

  // 允许用户省略说明列
  const dateStr = c[0] || '';
  const from = c[1] || '';
  const to = c[2] || '';
  const amountStr = c[3] || '';
  const note = c.slice(4).join(' ').trim();

  if (c.length < 3) {
    errors.push({ line: lineNo, raw, section: SECTION.TRANSACTION, message: '列数不足（至少 日期,转出,转入）' });
    return;
  }

  const date = normalizeDate(dateStr);
  if (!date) {
    errors.push({ line: lineNo, raw, section: SECTION.TRANSACTION, message: `日期认不出：「${dateStr}」` });
    return;
  }
  if (!from && !to) {
    errors.push({ line: lineNo, raw, section: SECTION.TRANSACTION, message: '转出与转入不能都为空' });
    return;
  }
  const amount = toAmount(amountStr);
  if (!(amount > 0)) {
    errors.push({ line: lineNo, raw, section: SECTION.TRANSACTION, message: `金额认不出：「${amountStr}」` });
    return;
  }

  out.push({ line: lineNo, date, from, to, amount, note });
}

/* ---------- 兼容层 ---------- */

/**
 * 把全角标点/数字归一化成半角。
 * 用户从中文输入法打出来的逗号是「，」—— 这是上一版导不进来的直接原因。
 */
export function normalizePunct(s) {
  return String(s || '')
    // 全角数字 ０-９ → 0-9
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    // 全角字母 Ａ-Ｚ ａ-ｚ
    .replace(/[\uFF21-\uFF3A\uFF41-\uFF5A]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    // 全角逗号 / 顿号 → 半角逗号
    .replace(/[\uFF0C\u3001]/g, ',')
    // 全角句号 / 全角句点 → 点（金额里的 3。5 或 3．5）
    .replace(/[\u3002\uFF0E]/g, '.')
    // 全角冒号 → 半角
    .replace(/\uFF1A/g, ':')
    // 全角空格 → 半角
    .replace(/\u3000/g, ' ');
}

/**
 * 切分一行。优先级：Tab → 逗号 → 竖线 → 双空格。
 *
 * 逗号**永远是字段分隔符**（用户明确：金额里没有千分位逗号），
 * 所以这里不做任何「数字间逗号合并」的处理 —— 那会把 4 列切成 3 列。
 * 单空格也不切，否则「交行信 1」这种名字会被拆开。
 */
export function splitCells(line) {
  const s = String(line || '');
  if (s.includes('\t')) return s.split('\t').map(cleanCell);
  if (s.includes(',')) return s.split(',').map(cleanCell);
  if (s.includes('|')) return s.split('|').map(cleanCell);
  if (/\s{2,}/.test(s)) return s.split(/\s{2,}/).map(cleanCell);
  return [cleanCell(s)];
}

/**
 * 保留导出名以免旧引用报错，但**不再做任何合并**：
 * 逗号是通用分隔符，金额里没有千分位（用户明确）。
 * @deprecated 直接删掉调用即可
 */
export function protectThousands(s) {
  return String(s || '');
}

function cleanCell(x) {
  return String(x == null ? '' : x).trim().replace(/^["']|["']$/g, '').trim();
}

/** 去掉末尾的空列（用户习惯每行最后多打一个逗号） */
export function trimTrailingEmpty(cells) {
  const out = (cells || []).slice();
  while (out.length && !String(out[out.length - 1] || '').trim()) out.pop();
  return out;
}

/** 「账户：」「流水：」这类段标题 */
export function looksLikeSectionHeader(line) {
  const s = String(line || '').trim();
  return ACCOUNT_HEAD.test(s) || TX_HEAD.test(s);
}

/** 表头行：至少命中两个中文列名，且首列不是日期 */
export function isHeaderRow(cells) {
  const joined = (cells || []).join('');
  let hit = 0;
  for (const w of HEADER_WORDS) if (joined.includes(w)) hit += 1;
  if (hit < 2) return false;
  return !/\d{6,}/.test(String(cells[0] || ''));
}

/**
 * 日期归一化：YYMMDD / YYYYMMDD / YYYY-MM-DD / YY-MM-DD / 斜杠分隔。
 * 认不出返回空串。
 */
export function normalizeDate(input) {
  const s = normalizePunct(input).trim();
  if (!s) return '';

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return build(y, m, d);
  }

  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length === 8) {
    return build(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
  }
  if (digits.length === 6) {
    const yy = Number(digits.slice(0, 2));
    const y = yy > 50 ? 1900 + yy : 2000 + yy;
    return build(y, Number(digits.slice(2, 4)), Number(digits.slice(4, 6)));
  }
  return '';
}

function build(y, m, d) {
  if (!(y >= 1900 && y <= 2999)) return '';
  if (!(m >= 1 && m <= 12)) return '';
  if (!(d >= 1 && d <= 31)) return '';
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
