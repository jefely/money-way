// 数据：按「单文件版备份模板」组装 / 解析 4 张表（纯函数，Node 可跑）
/**
 * xlsx 模板
 * 层：第一层 · core
 *
 * 用户的备份文件是 4 张表：
 *   流水（序 日期 转出 转入 金额 备注）
 *   设置（简码 序 类型 分类 名称 期初 账单日 还款日，带 A/B 分区与类型小计行）
 *   分期（账户名称 分期金额 账单日 还款日 + 一串月份列，每条占两行：本金 / 利息）
 *   固定（序 频率 日期 转出 转入 金额 备注）
 *
 * 这里只做「state ⇄ 二维数组」的映射，不碰 ZIP、不碰 DOM。
 */

import { openingOf } from './ledger-stats.js';
import { ZONES } from './settings.js';
import { computeInstallment, addMonths, monthsBetween } from './installment-engine.js';

/** sheet 名（与模板一致，顺序也一致） */
export const SHEET_NAMES = ['流水', '设置', '分期', '固定'];

/** 本工程的类型名 ⇄ 模板里的短名 */
const TYPE_SHORT = {
  资产类: '资产', 负债类: '负债', 收入类: '收入', 权益类: '权益', 费用类: '费用',
};
const SHORT_TYPE = {
  资产: '资产类', 负债: '负债类', 收入: '收入类', 权益: '权益类', 费用: '费用类',
};

/** 类型短名（未知类型原样返回，导入时能认回来） */
export function shortType(type) {
  return TYPE_SHORT[type] || String(type || '').replace(/类$/, '');
}

/** 短名 → 本工程类型名 */
export function fullType(short) {
  const s = String(short || '').trim();
  return SHORT_TYPE[s] || (s ? s + (s.endsWith('类') ? '' : '类') : '');
}

/** ISO 日期 → 2026-08-01（模板里是文本日期，Excel 里也认） */
function isoDate(v) {
  const s = String(v || '').replace(/[^0-9]/g, '');
  if (s.length >= 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return String(v || '');
}

/* ============================================================
   一、state → 4 张表
   ============================================================ */

/** 流水（期初行不写：期初在「设置」表里是账户的一列，写两遍导入时会翻倍） */
export function buildFlowSheet(state, nameOf) {
  const rows = [
    ['流水记录'],
    ['序', '日期', '转出账户', '转入账户', '金额', '备注'],
  ];

  let seq = 0;
  for (const t of (state.transactions || [])) {
    if (!t || t.opening) continue;
    seq += 1;
    rows.push([
      seq,
      isoDate(t.date),
      nameOf(t.from_id),
      nameOf(t.to_id),
      Number(t.amount) || 0,
      t.note || '',
    ]);
  }

  return rows;
}

/** 模板里两个分区的文字（与备份文件一致，不改 ZONES 本身） */
const ZONE_TEXT = {
  A: { label: 'A 资产/支出', hint: '转入增加，转出减少' },
  B: { label: 'B 收入与本金/欠款与贷款', hint: '转出增加，转入减少' },
};

/**
 * 设置：标题 → 表头 → A 区（区行 + 每个有账户的类型：类型行含期初合计，再账户行）→ B 区。
 * 顺序跟模板一致：类型行在它那批账户前面，期初合计写在类型行第 6 列。
 */
export function buildSettingsSheet(state) {
  const rows = [
    ['账户设置'],
    ['简码', '序', '类型', '分类', '账户名称', '期初', '账单日', '还款日'],
  ];

  const accounts = (state.accounts || []).filter((a) => a && !a.isHidden);
  let seq = 0;

  for (const zone of ZONES) {
    const text = ZONE_TEXT[zone.key] || { label: zone.label, hint: zone.hint };
    rows.push([text.label, '', '', '', '', '', '', ' ' + text.hint]);

    for (const type of zone.types) {
      const list = accounts.filter((a) => a.type === type);
      if (!list.length) continue;

      const openingSum = list.reduce((n, a) => n + (openingOf(state, a.id) || 0), 0);
      rows.push([shortType(type), '', '', '', '', openingSum || 0, '', '']);

      for (const a of list) {
        seq += 1;
        rows.push([
          a.code || '',
          seq,
          shortType(a.type),
          a.category || '',
          a.name || '',
          openingOf(state, a.id) || 0,
          a.billDay || '',
          a.repayDay || '',
        ]);
      }
    }
  }

  return rows;
}

/** 分期：每条两行（本金 / 利息），月份列从最早首月到最晚还清月 */
export function buildInstSheet(state, nowMonth) {
  const list = (state.scheduled || []).filter((s) => s && s.isScheduled && s.inst);
  const span = monthSpan(list, nowMonth);

  const rows = [
    ['分期统计'],
    ['账户名称', '分期金额', '账单日', '还款日'].concat(span),
  ];

  const nameOf = (id) => {
    const a = (state.accounts || []).find((x) => x && x.id === id);
    return a ? a.name : '';
  };

  for (const row of list) {
    const head = [
      nameOf(row.to_id) || nameOf(row.from_id),
      Number(row.inst.principal) || 0,
      row.billDay || '',
      row.day || '',
    ];

    const principalLine = head.slice();
    const interestLine = ['', '', '', ''];

    for (const m of span) {
      const st = computeInstallment(row, m);
      const due = st && Number.isFinite(st.perPeriod) && st.perPeriod > 0;
      principalLine.push(due ? round2(st.principalPer) : '');
      interestLine.push(due ? round2(st.interestPer) : '');
    }

    rows.push(principalLine);
    rows.push(interestLine);
  }

  return rows;
}

/** 固定收支 */
export function buildFixedSheet(state, nameOf) {
  const rows = [
    ['固定收支'],
    ['序', '频率', '日期', '转出账户', '转入账户', '金额', '备注'],
  ];

  const list = (state.scheduled || []).filter((s) => s && s.isScheduled && !s.inst);
  list.forEach((s, i) => {
    rows.push([
      i + 1,
      s.freq === 'daily' ? '每天' : '每月',
      s.day || '',
      nameOf(s.from_id),
      nameOf(s.to_id),
      Number(s.amount) || 0,
      s.note || '',
    ]);
  });

  return rows;
}

/** 4 张表（顺序与模板一致） */
export function buildTemplateSheets(state, opts) {
  const o = opts || {};
  const nameOf = o.nameOf || (() => '');
  const nowMonth = o.nowMonth || todayMonth();

  return [
    { name: '流水', rows: buildFlowSheet(state, nameOf) },
    { name: '设置', rows: buildSettingsSheet(state) },
    { name: '分期', rows: buildInstSheet(state, nowMonth) },
    { name: '固定', rows: buildFixedSheet(state, nameOf) },
  ];
}

/* ============================================================
   二、4 张表 → 数据（导入用）
   ============================================================ */

/**
 * 从 sheet 数组里取 4 张表。
 * @param {{name:string, rows:Array<Array<any>>}[]} sheets
 */
export function pickTemplateSheets(sheets) {
  const byName = new Map();
  for (const s of sheets || []) byName.set(String(s.name || '').trim(), s.rows || []);
  return {
    flow: byName.get('流水') || null,
    settings: byName.get('设置') || null,
    inst: byName.get('分期') || null,
    fixed: byName.get('固定') || null,
    isTemplate: byName.has('设置') && byName.has('流水'),
  };
}

/* ---------- 小工具 ---------- */

function round2(n) {
  const v = Number(n) || 0;
  return Math.round(v * 100) / 100;
}

function todayMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function monthSpan(list, nowMonth) {
  let first = nowMonth;
  let last = nowMonth;

  for (const row of list) {
    const fm = row.inst && row.inst.firstMonth;
    if (fm && fm < first) first = fm;
    const st = computeInstallment(row, nowMonth);
    if (st.lastMonth && st.lastMonth > last) last = st.lastMonth;
  }

  const out = [];
  const n = monthsBetween(first, last);
  const count = Number.isFinite(n) ? Math.min(n, 36) : 0;
  for (let i = 0; i <= count; i += 1) out.push(addMonths(first, i));
  return out;
}
