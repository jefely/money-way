// 数据：把「单文件版备份模板」的 4 张表读回 state（纯函数，Node 可跑）
/**
 * xlsx 模板 → state
 * 层：第一层 · core
 *
 * 与 xlsx-template.js 对称：那边 state → 4 张表，这边 4 张表 → state。
 *
 * 容错原则：认不出的行跳过并计数，不因为一行坏掉整份备份。
 * 账户名对不上的流水也保留（账户留空），导入后在流水表里补。
 */

import { parseBillDate } from './bill-parse.js';
import { normalizeMonth, isDayGiven, clampDay, OPENING_ACCOUNT_ID } from './schema.js';
import { createState, addAccount, addTransaction } from './state-store.js';
import { createScheduled } from './schema.js';
import { fullType } from './xlsx-template.js';

const str = (v) => String(v == null ? '' : v).trim();
const num = (v) => {
  const n = Number(String(v == null ? '' : v).replace(/[¥,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/* ---------- 各表解析 ---------- */

/** 设置表：账户行（第 5 列＝账户名称 非空），分区行 / 类型小计行自然被跳过 */
export function parseSettingsRows(rows) {
  const out = [];
  for (let i = 2; i < (rows || []).length; i += 1) {
    const r = rows[i] || [];
    const name = str(r[4]);
    if (!name) continue;                     // 标题 / 分区行 / 类型小计行

    out.push({
      code: str(r[0]).toUpperCase(),
      type: fullType(r[2]),
      category: str(r[3]),
      name,
      opening: num(r[5]),
      billDay: isDayGiven(r[6]) ? clampDay(r[6]) : 0,
      repayDay: isDayGiven(r[7]) ? clampDay(r[7]) : 0,
    });
  }
  return out;
}

/** 流水表：前两行是标题与表头 */
export function parseFlowRows(rows) {
  const out = [];
  let skipped = 0;

  for (let i = 2; i < (rows || []).length; i += 1) {
    const r = rows[i] || [];
    const date = parseBillDate(r[1]);
    const amount = num(r[4]);
    if (!date || !amount) { skipped += 1; continue; }

    out.push({
      date,
      from: str(r[2]),
      to: str(r[3]),
      amount: Math.abs(amount),
      note: str(r[5]),
    });
  }

  return { items: out, skipped };
}

/** 固定表：序 / 频率 / 日期 / 转出 / 转入 / 金额 / 备注 */
export function parseFixedRows(rows) {
  const out = [];
  for (let i = 2; i < (rows || []).length; i += 1) {
    const r = rows[i] || [];
    const amount = num(r[5]);
    if (!amount) continue;
    out.push({
      freq: str(r[1]).includes('天') ? 'daily' : 'monthly',
      day: clampDay(r[2] || 1),
      from: str(r[3]),
      to: str(r[4]),
      amount: Math.abs(amount),
      note: str(r[6]),
    });
  }
  return out;
}

/**
 * 分期表：每条占两行（本金行 + 利息行），月份列从第 5 列起。
 * 期数与首月从「有本金值的月份」推出来；利息 = 利息行同一批月份之和。
 */
export function parseInstRows(rows) {
  if (!rows || rows.length < 3) return [];

  const head = rows[1] || [];
  const months = [];
  for (let c = 4; c < head.length; c += 1) months.push(str(head[c]));

  const out = [];
  for (let i = 2; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const name = str(r[0]);
    if (!name) continue;                     // 利息行（跟着上一行一起处理）

    const next = rows[i + 1] || [];
    let periods = 0;
    let firstMonth = '';
    let interest = 0;

    for (let c = 0; c < months.length; c += 1) {
      const p = num(r[4 + c]);
      if (!p) continue;
      if (!periods) firstMonth = normalizeMonth(months[c]);
      periods += 1;
      interest += num(next[4 + c]);
    }

    out.push({
      name,
      principal: num(r[1]),
      billDay: isDayGiven(r[2]) ? clampDay(r[2]) : 0,
      repayDay: isDayGiven(r[3]) ? clampDay(r[3]) : 0,
      firstMonth,
      periods,
      interest,
    });

    i += 1;                                  // 跳过利息行
  }

  return out;
}

/* ---------- 组装成 state ---------- */

/**
 * @param {{accounts:Array, flow:object, fixed:Array, inst:Array}} parsed
 * @returns {{state:object, stats:object}}
 */
export function stateFromTemplate(parsed) {
  const p = parsed || {};
  let state = createState();
  const idByName = new Map();

  for (const a of p.accounts || []) {
    const before = state.accounts.length;
    state = addAccount(state, {
      code: a.code || undefined,
      name: a.name,
      type: a.type,
      category: a.category,
      billDay: a.billDay || undefined,
      repayDay: a.repayDay || undefined,
    });

    const acc = state.accounts[before];
    idByName.set(a.name, acc.id);

    // 期初 → 一条 opening 流水（本工程的口径：期初不是账户字段）
    if (a.opening > 0) {
      state = addTransaction(state, {
        date: '2000-01-01',
        from_id: OPENING_ACCOUNT_ID,
        to_id: acc.id,
        amount: Math.abs(a.opening),
        note: '期初',
        opening: true,
        seq: 0,
      });
    }
  }

  let bound = 0;
  let loose = 0;

  for (const t of (p.flow && p.flow.items) || []) {
    const fromId = idByName.get(t.from) || null;
    const toId = idByName.get(t.to) || null;
    if (!fromId && !toId) { loose += 1; }
    bound += 1;
    state = addTransaction(state, {
      date: t.date, from_id: fromId, to_id: toId, amount: t.amount, note: t.note,
    });
  }

  const scheduled = [];

  for (const f of p.fixed || []) {
    scheduled.push(createScheduled({
      freq: f.freq,
      day: f.day,
      from_id: idByName.get(f.from) || null,
      to_id: idByName.get(f.to) || null,
      amount: f.amount,
      note: f.note,
    }));
  }

  let instSkipped = 0;
  for (const x of p.inst || []) {
    const accId = idByName.get(x.name);
    if (!accId || !x.periods || !x.firstMonth) { instSkipped += 1; continue; }
    scheduled.push(createScheduled({
      to_id: accId,
      day: x.repayDay || 5,
      billDay: x.billDay || undefined,
      note: '分期',
      amount: (x.principal + x.interest) / x.periods,
      inst: {
        periods: x.periods,
        firstMonth: x.firstMonth,
        principal: x.principal,
        interest: x.interest,
      },
    }));
  }

  return {
    state: { ...state, scheduled },
    stats: {
      accounts: (p.accounts || []).length,
      transactions: (p.flow && p.flow.items) ? p.flow.items.length : 0,
      flowSkipped: (p.flow && p.flow.skipped) || 0,
      loose,
      fixed: (p.fixed || []).length,
      inst: (p.inst || []).length - instSkipped,
      instSkipped,
    },
  };
}
