// 数据：三家账单（支付宝 / 微信支付 / 招商银行）的识别与解析
/**
 * 账单解析
 * 层：第一层 · core
 *
 * 这三家导出的都是「单边」记录（我付了 XX），而本程序一笔要两端账户，
 * 所以解析完还要在 UI 层补两件事：
 *   ① 我的账户 ← 支付方式 / 招行账单直接选卡
 *   ② 对方账户 ← 交易对方或摘要，先查规则表，查不到让人工确认
 *
 * 判重优先用交易单号（tradeNo），没有单号再退回「日期·账户·金额·备注」指纹。
 */

import { normalizeDate } from './import-parser.js';
import { excelSerialToISO } from './xlsx-xml.js';

/** 列名关键词表：命中越多越像表头 */
export const BILL_PRESETS = [
  {
    id: 'alipay',
    name: '支付宝',
    cols: {
      category: ['交易分类'],
      date: ['交易时间', '交易创建时间', '付款时间'],
      dir: ['收/支', '收支'],
      amount: ['金额'],
      party: ['交易对方', '对方'],
      item: ['商品说明', '商品名称', '商品'],
      method: ['收/付款方式', '付款方式', '支付方式'],
      tradeNo: ['交易订单号', '交易号'],
      note: ['备注'],
    },
  },
  {
    id: 'wechat',
    name: '微信支付',
    cols: {
      category: ['交易类型'],
      date: ['交易时间', '时间'],
      dir: ['收/支', '收支'],
      amount: ['金额(元)', '金额（元）', '金额'],
      party: ['交易对方', '对方'],
      item: ['商品'],
      method: ['支付方式', '付款方式'],
      tradeNo: ['交易单号'],
      note: ['备注'],
    },
  },
  {
    id: 'cmb',
    name: '招商银行',
    cols: {
      date: ['交易日期', '记账日期', '日期'],
      time: ['交易时间'],
      dir: ['借贷标志', '收支', '交易方向'],
      // 不写泛泛的「金额」：否则一张普通的「日期 / 转出 / 转入 / 金额」表
      // 会被误判成招行账单
      amount: ['交易金额', '发生额'],
      party: ['交易摘要', '摘要', '对方户名', '对手信息'],
      item: ['交易备注', '用途', '备注'],
      method: [],
      tradeNo: ['流水号', '交易流水号', '参考号'],
    },
    // 招行导出的「表头」是合并单元格，列名全挤在第 0 列；
    // 按关键词定位会让 date/amount/party 一律指向第 0 列，
    // 于是把日期文本当金额。它的列位置其实是固定的，直接按位置读。
    // currency 用来跳过标题行（标题里也有「2025-10-21 -- 2026-10-21」）；
    // item = 交易摘要（汇入汇款 / 快捷支付 / 银联代收…），是它唯一可用的分类维度。
    fixedMap: { date: 0, amount: 2, party: 9, item: 6, currency: 1 },
  },
];

/** 固定列模式下，找第一行真正的数据行 */
function findFixedDataStart(rows, preset) {
  const fm = preset.fixedMap;
  if (!fm) return -1;
  for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
    const cells = rows[i] || [];
    if (cells.length < 3) continue;
    if (!parseBillDate(cells[fm.date])) continue;
    if (fm.currency != null
        && !/^[A-Z]{3}$/.test(String(cells[fm.currency] || '').trim())) continue;
    return i;
  }
  return -1;
}

/** 招行的第 1 列是币种（CNY），这是它和其它表最明显的区别 */
function looksLikeCmb(rows, start) {
  const cells = rows[start] || [];
  return /^[A-Z]{3}$/.test(String(cells[1] || '').trim());
}

export function detectBill(rows) {
  let best = { preset: null, idx: -1, map: {}, score: 0 };

  // 招行导出里有多段合并表头，按关键词会命中第二段、漏掉前半截数据。
  // 币种列 + 首列日期足够确认，直接按固定列从第一行数据读。
  for (const p of BILL_PRESETS) {
    if (!p.fixedMap) continue;
    const start = findFixedDataStart(rows, p);
    if (start >= 0 && looksLikeCmb(rows, start)) {
      return { preset: p, idx: start - 1, map: p.fixedMap, score: 100 };
    }
  }

  for (const p of BILL_PRESETS) {
    const r = findBillHeader(rows, p);
    // 至少要有日期 + 金额才算认出来
    if (r.idx >= 0 && r.map.date != null && r.map.amount != null && r.score > best.score) {
      best = { preset: p, idx: r.idx, map: r.map, score: r.score };
    }
  }

  return best;
}

/** 需要识别的字段顺序 */
const FIELDS = ['category', 'date', 'time', 'dir', 'amount', 'party', 'item', 'method', 'tradeNo', 'note'];

/**
 * 在一张表里认出表头行。
 *
 * @param {string[][]} rows
 * @param {{cols:object}} preset
 * @returns {{idx:number, score:number, map:object}}  idx = -1 表示没找到
 */
export function findBillHeader(rows, preset) {
  let best = { idx: -1, score: 0, map: {} };
  const limit = Math.min(rows.length, 60);

  for (let i = 0; i < limit; i += 1) {
    const cells = rows[i] || [];
    if (cells.length < 3) continue;

    const map = {};
    let score = 0;

    for (const key of FIELDS) {
      const kws = (preset.cols[key] || []);
      if (!kws.length) continue;

      for (let ci = 0; ci < cells.length; ci += 1) {
        if (map[key] != null) break;
        const cell = cells[ci];
        if (!cell) continue;
        if (kws.some((kw) => cell.includes(kw))) {
          map[key] = ci;
          score += 1;
        }
      }
    }

    // 合并单元格的「表头」会把所有列名塞进同一个 cell，
    // 于是 date/amount/party 全部指向第 0 列 —— 这种行不能当表头
    if (map.date != null && map.amount != null && map.date === map.amount) continue;

    // 有日期和金额最像表头
    if (map.date != null && map.amount != null) score += 2;

    if (score > best.score) best = { idx: i, score, map };
  }

  return best;
}

/**
 * 从账单头部的说明里找线索。目前只取卡号尾四位 ——
 * 招行的「账号：6214********7912」是唯一能说明「这是哪张卡」的信息，
 * 没有它，一千多笔流水全缺转出方（按 U 区规则一条也入不了账）。
 *
 * @returns {{cardTail?:string}}
 */
export function extractBillHints(rows) {
  const head = (rows || []).slice(0, 40);
  for (const cells of head) {
    const line = (cells || []).map((c) => String(c == null ? '' : c)).join(' ');
    const m = /(?:账号|卡号|账户)[：:]\s*([\d*]{8,})/.exec(line);
    if (!m) continue;
    const digits = m[1].replace(/\*/g, '');
    if (digits.length >= 4) return { cardTail: digits.slice(-4) };
  }
  return {};
}

/**
 * 解析金额：去掉 ¥/￥/逗号/空格，保留负号与括号负数 */
export function parseBillAmount(v) {
  let s = String(v == null ? '' : v).trim();
  if (!s) return null;

  s = s.replace(/[¥￥,，\s]/g, '');
  const neg = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');

  const digits = s.replace(/[^\d.]/g, '');
  // 去掉非数字后可能是空串（比如 'abc'），Number('') 会变成 0，
  // 那样「abc」就会被当成 0 元导入 —— 必须当作解析失败。
  if (!digits) return null;

  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** 解析账单日期：接受 2026-10-03 / 2026/10/03 / 20261003 / 带时间 */
export function parseBillDate(v) {
  const s = String(v || '').trim();
  if (!s) return null;

  // ① 6 位纯数字 = YYMMDD（261024 → 2026-10-24）。
  //    必须在通用正则之前处理：261024 走正则会变成 2610-02-04。
  if (/^\d{6}$/.test(s)) {
    const y = Number(s.slice(0, 2));
    const year = y >= 70 ? 1900 + y : 2000 + y;
    const mo = s.slice(2, 4);
    const d = s.slice(4, 6);
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) {
      return `${year}-${mo}-${d}`;
    }
    // 6 位既然当 YYMMDD 解释，越界就是无效日期
    return null;
  }

  // ② Excel 序列号。5 位整数 46296 是序列号；**带小数也一样** ——
  //    微信导出的「交易时间」就是 46317.443981481483（日期 + 当天时刻）。
  //    不先处理它，正则会把它读成 4629-07-29（实测踩过）。
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const iso = excelSerialToISO(Math.floor(Number(s)));
    if (iso) return iso;
  }

  const m = s.match(/(\d{4})[-/年.]?(\d{1,2})[-/月.]?(\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = String(m[2]).padStart(2, '0');
    const d = String(m[3]).padStart(2, '0');
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${y}-${mo}-${d}`;
  }

  const t = normalizeDate(s);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/**
 * 解析发生时间 HH:MM。
 * 两种来源：文本里的「10:39:20」，或 Excel 序列号的小数部分（0.44398… = 10:39）。
 * 同一天要按时间排，账单本身是最新在前，直接导入会把当天顺序弄反。
 */
export function parseBillTime(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const n = Number(s);
  if (/^\d{5}(\.\d+)?$/.test(s) && Number.isFinite(n)) {
    const secs = Math.round((n % 1) * 86400) % 86400;
    const hh = Math.floor(secs / 3600);
    const mm = Math.floor((secs % 3600) / 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  const m = /(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return '';
  const hh = Number(m[1]);
  if (hh > 23) return '';
  return String(hh).padStart(2, '0') + ':' + m[2];
}

/**
 * 把表头之后的行转成统一条目。
 *
 * @param {string[][]} rows
 * @param {{idx:number, map:object, preset:object}} hit
 * @returns {Array<{date:string, amount:number, dir:string, party:string,
 *                  item:string, method:string, tradeNo:string, note:string}>}
 */
export function billRowsToItems(rows, hit) {
  const out = [];
  if (!hit || hit.idx < 0) return out;

  const { map } = hit;
  const pick = (cells, key) => (map[key] == null ? '' : String(cells[map[key]] || '').trim());

  for (let i = hit.idx + 1; i < rows.length; i += 1) {
    const cells = rows[i] || [];
    if (!cells.some((c) => String(c || '').trim() !== '')) continue;

    const dateRaw = pick(cells, 'date');
    const date = parseBillDate(dateRaw);
    const amount = parseBillAmount(pick(cells, 'amount'));
    if (!date || amount == null) continue;

    // 发生时间：有的银行单独一列（招行），支付宝/微信塞在「交易时间」里；
    // 微信的「交易时间」整个是 Excel 序列号，时间藏在小数部分。
    const timeSrc = pick(cells, 'time') || dateRaw;
    const time = parseBillTime(timeSrc);

    out.push({
      date,
      time,
      amount,
      dir: pick(cells, 'dir'),
      category: pick(cells, 'category'),
      party: pick(cells, 'party'),
      item: pick(cells, 'item'),
      method: pick(cells, 'method'),
      tradeNo: pick(cells, 'tradeNo'),
      note: pick(cells, 'note'),
    });
  }

  return out;
}

/**
 * 判重指纹：优先交易单号，没有就退回「日期·金额·对方·备注」。
 */
export function billFingerprint(item) {
  if (item.tradeNo) return 'no:' + item.tradeNo;
  return ['fp', item.date, item.amount, item.party, item.note].join('|');
}
