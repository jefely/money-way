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
  },
];

/** 需要识别的字段顺序 */
const FIELDS = ['category', 'date', 'dir', 'amount', 'party', 'item', 'method', 'tradeNo', 'note'];

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

    // 有日期和金额最像表头
    if (map.date != null && map.amount != null) score += 2;

    if (score > best.score) best = { idx: i, score, map };
  }

  return best;
}

/**
 * 试遍所有 preset，挑得分最高的。
 *
 * @param {string[][]} rows
 * @returns {{preset:object|null, idx:number, map:object, score:number}}
 */
export function detectBill(rows) {
  let best = { preset: null, idx: -1, map: {}, score: 0 };

  for (const p of BILL_PRESETS) {
    const r = findBillHeader(rows, p);
    // 至少要有日期 + 金额才算认出来
    if (r.idx >= 0 && r.map.date != null && r.map.amount != null && r.score > best.score) {
      best = { preset: p, idx: r.idx, map: r.map, score: r.score };
    }
  }

  return best;
}

/** 解析金额：去掉 ¥/￥/逗号/空格，保留负号与括号负数 */
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

    const date = parseBillDate(pick(cells, 'date'));
    const amount = parseBillAmount(pick(cells, 'amount'));
    if (!date || amount == null) continue;

    out.push({
      date,
      amount,
      dir: pick(cells, 'dir'),
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
