// 核心：导入 Excel / CSV / 账单（纯逻辑，Node 可跑）
/**
 * 导入解析
 * 层：第一层 · core
 *
 * 把「任意二维表」变成可导入的条目：
 *   · 先试三家账单（支付宝 / 微信 / 招行）的预设关键词
 *   · 认不出就走通用列名（日期 / 转出 / 转入 / 金额 / 备注）
 *
 * 只做纯计算，不碰文件、不碰 DOM。
 */

import { detectBill, findBillHeader, billRowsToItems, billFingerprint, parseBillDate, parseBillAmount } from './bill-parse.js';
import { BILL_PRESETS } from './bill-parse.js';

/** 通用表的列名关键词 */
const GENERIC = {
  date: ['日期', '时间', 'date'],
  from: ['转出', '转出账户', '付款', 'from'],
  to: ['转入', '转入账户', '收款', 'to'],
  amount: ['金额', 'amount'],
  note: ['备注', '说明', '摘要', 'note'],
};

/**
 * 按关键词给**一行**表头猜列映射。
 *
 * 抽出来是因为「手动指定列」那个界面也要同一个初值：
 * 认不出表头时先猜一遍，用户只需要改猜错的那几列，不用从零开始选。
 *
 * @param {string[]} cells 一行单元格
 * @returns {Record<string, number>} 角色 → 列号
 */
export function guessMapForRow(cells) {
  const map = {};
  const list = cells || [];

  for (const key of Object.keys(GENERIC)) {
    const kws = GENERIC[key];
    for (let ci = 0; ci < list.length; ci += 1) {
      if (map[key] != null) break;
      const cell = String(list[ci] || '');
      if (!cell) continue;
      if (kws.some((kw) => cell.toLowerCase().includes(kw.toLowerCase()))) {
        map[key] = ci;
      }
    }
  }

  return map;
}

/**
 * 认通用表头（日期 + 金额是必须的）。
 * @param {string[][]} rows
 */
export function findGenericHeader(rows) {
  let best = { idx: -1, score: 0, map: {} };
  const limit = Math.min(rows.length, 60);

  for (let i = 0; i < limit; i += 1) {
    const cells = rows[i] || [];
    if (cells.length < 2) continue;

    const map = guessMapForRow(cells);
    let score = Object.keys(map).length;

    if (map.date != null && map.amount != null) score += 2;
    if (score > best.score) best = { idx: i, score, map };
  }

  return best;
}

/**
 * 主入口：分析一张表，给出「这是什么 + 能导什么」。
 *
 * @param {string[][]} rows
 * @returns {{
 *   kind: 'bill'|'generic'|'unknown',
 *   presetName: string,
 *   headerIdx: number,
 *   map: object,
 *   items: Array,
 *   needAccount: boolean,
 *   note: string,
 * }}
 */
export function analyzeTable(rows) {
  const clean = (rows || []).filter(Array.isArray);

  // ① 先试三家账单
  const bill = detectBill(clean);
  if (bill.preset) {
    const items = billRowsToItems(clean, bill);
    if (items.length) {
      return {
        kind: 'bill',
        presetName: bill.preset.name,
        headerIdx: bill.idx,
        map: bill.map,
        items,
        needAccount: bill.preset.id !== 'cmb',   // 招行有卡号列，其余要人工选支付方式
        note: `识别为${bill.preset.name}账单，共 ${items.length} 笔`,
      };
    }
  }

  // ② 退回通用列名
  const g = findGenericHeader(clean);
  if (g.idx >= 0 && g.map.date != null && g.map.amount != null) {
    const items = genericRowsToItems(clean, g);
    if (items.length) {
      return {
        kind: 'generic',
        presetName: '',
        headerIdx: g.idx,
        map: g.map,
        items,
        needAccount: true,
        note: `按通用列名解析，共 ${items.length} 笔`,
      };
    }
  }

  return {
    kind: 'unknown',
    presetName: '',
    headerIdx: -1,
    map: {},
    items: [],
    needAccount: true,
    note: '没认出表头。需要至少一列日期 + 一列金额',
  };
}

/**
 * 通用表 → 条目。转出/转入是账户名，交给调用方去解析成账户 id。
 * @param {string[][]} rows
 * @param {{idx:number, map:object}} g
 */
export function genericRowsToItems(rows, g) {
  const out = [];
  const pick = (cells, key) => (g.map[key] == null ? '' : String(cells[g.map[key]] || '').trim());

  for (let i = g.idx + 1; i < rows.length; i += 1) {
    const cells = rows[i] || [];
    if (!cells.some((c) => String(c || '').trim() !== '')) continue;

    const date = parseBillDate(pick(cells, 'date'));
    const amount = parseBillAmount(pick(cells, 'amount'));
    if (!date || amount == null) continue;

    out.push({
      date,
      amount,
      from: pick(cells, 'from'),
      to: pick(cells, 'to'),
      note: pick(cells, 'note'),
      tradeNo: '',
      dir: '',
      party: '',
      item: '',
      method: '',
    });
  }

  return out;
}

/** 判重指纹（通用表用） */
export function genericFingerprint(item) {
  return ['g', item.date, item.amount, item.from, item.to, item.note].join('|');
}

/**
 * 已有的流水 → 指纹集合，用于导入时跳过重复。
 * @param {Array} transactions
 */
export function existingFingerprints(transactions) {
  const set = new Set();
  for (const t of transactions || []) {
    set.add(['g', t.date, Number(t.amount) || 0, '', '', t.note || ''].join('|'));
    set.add(['g', t.date, Number(t.amount) || 0, '', '', ''].join('|'));
  }
  return set;
}

export { BILL_PRESETS, billFingerprint };
