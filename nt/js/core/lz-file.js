// 数据：.lz 快照文件（跨设备同步码）的解析与还原（纯函数，Node 可跑）
/**
 * .lz 文件
 * 层：第一层 · core
 *
 * 格式与单文件版**完全一致**：
 *   LZ1:base64url(gzip(JSON))   浏览器支持压缩时
 *   LZ0:base64url(JSON)         不支持时的退路
 * 语义是「快照覆盖」：导入它 = 用文件里的数据替换本机（调用方负责二次确认）。
 *
 * 兼容两种 payload 形状：
 *   ① 本工程导出的：transactions 用 from_id / to_id，accounts 用 type / category
 *   ② 单文件版导出的：transactions 里可能是 from / to 名字，accounts 用 cat / sub
 * 所以字段一律「先认 id、再认名字」，账户类型「先认 type、再认 cat」。
 */

import { decodeSyncCode } from './sync-code.js';
import { createState, addAccount, addTransaction } from './state-store.js';
import { createScheduled, FREQ, normalizeMonth } from './schema.js';
import { OPENING_ACCOUNT_ID } from './schema.js';

const str = (v) => String(v == null ? '' : v).trim();
const num = (v) => {
  const n = Number(String(v == null ? '' : v).replace(/[¥,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** 文件文本 → payload（也接受直接贴的 LZ1:… 文本） */
export async function readLzText(text) {
  const raw = str(text);
  // LZ2 要先判：它不满足下面的 LZ[01]，否则会被报成「格式不对」而掩盖真正原因
  if (/^LZ2[:：]/i.test(raw)) {
    throw new Error('这是「LZ2」加密快照（在另一台设备设过密码），需要那边的密码才能解');
  }
  if (!/^LZ[01][:：]/i.test(raw)) {
    throw new Error('这不像 .lz 快照：内容应以 LZ1: 或 LZ0: 开头');
  }

  const json = await decodeSyncCode(raw);
  let payload = null;
  try {
    payload = JSON.parse(json);
  } catch (e) {
    throw new Error('快照内容不是 JSON：' + ((e && e.message) || e));
  }
  if (!payload || !Array.isArray(payload.transactions)) {
    throw new Error('快照里没有 transactions 数组，不是账本快照');
  }
  return payload;
}

/** 账户类型：先认 type（本工程），再认 cat（单文件版），最后兜底资产类 */
function typeOf(a) {
  const t = str(a.type) || str(a.cat);
  if (!t) return '资产类';
  return t.endsWith('类') ? t : t + '类';
}

/**
 * payload → state
 * @returns {{state:object, stats:object}}
 */
export function stateFromLzPayload(payload) {
  const p = payload || {};
  let state = createState();

  const idByName = new Map();
  const idByOldId = new Map();

  for (const a of p.accounts || []) {
    if (!a) continue;
    const name = str(a.name);
    if (!name) continue;

    const before = state.accounts.length;
    state = addAccount(state, {
      code: a.code || undefined,
      name,
      type: typeOf(a),
      category: str(a.category) || str(a.sub),
      billDay: a.billDay || undefined,
      repayDay: a.repayDay || undefined,
    });

    const acc = state.accounts[before];
    if (a.id) idByOldId.set(String(a.id), acc.id);
    idByName.set(name, acc.id);

    if (num(a.opening) > 0) {
      state = addTransaction(state, {
        date: '2000-01-01',
        from_id: OPENING_ACCOUNT_ID,
        to_id: acc.id,
        amount: Math.abs(num(a.opening)),
        note: '期初',
        opening: true,
        seq: 0,
      });
    }
  }

  const resolve = (id, name) => {
    if (id != null && idByOldId.has(String(id))) return idByOldId.get(String(id));
    if (name) return idByName.get(str(name)) || null;
    return null;
  };

  let loose = 0;
  let count = 0;

  for (const t of p.transactions || []) {
    if (!t) continue;
    const fromId = resolve(t.from_id, t.from);
    const toId = resolve(t.to_id, t.to);
    if (!fromId && !toId) { loose += 1; }

    const date = str(t.date);
    const amount = Math.abs(num(t.amount));
    if (!date || !amount) continue;

    state = addTransaction(state, {
      date,
      from_id: fromId,
      to_id: toId,
      amount,
      note: str(t.note),
    });
    count += 1;
  }

  // 计划流水。三种形状都要认：
  //   ① 本工程的 scheduled（带 isScheduled）
  //   ② 单文件版的 fixed  —— 固定收支，{freq:'month'|'day', day, from, to, amount, note}
  //   ③ 单文件版的 installments —— 分期矩阵，每条占两行、cells 是 { '2610': {p,i} }
  //
  // ②③ 是 2026-10-30 补的。在那之前只读 scheduled，而单文件版**根本不导出 scheduled** ——
  // 于是从单文件版导一份 .lz 过来，账户和流水都在、固定收支与分期全部静默消失，
  // 界面上连一句提示都没有（统计里 scheduled 数 = 0，看起来就像「本来就没有」）。
  const scheduled = [];
  let lostScheduled = 0;

  for (const s of p.scheduled || []) {
    if (!s || !s.isScheduled) continue;
    scheduled.push(createScheduled({
      freq: s.freq,
      day: s.day,
      billDay: s.billDay,
      from_id: idByOldId.get(String(s.from_id)) || null,
      to_id: idByOldId.get(String(s.to_id)) || null,
      amount: s.amount,
      note: s.note,
      inst: s.inst,
    }));
  }

  // ② 固定收支
  for (const f of p.fixed || []) {
    if (!f) continue;
    const fromId = resolve(null, f.from);
    const toId = resolve(null, f.to);
    const amount = Math.abs(num(f.amount));
    // 两端账户都认不出、或金额为 0 的规则搬过来也没有意义
    if ((!fromId && !toId) || !amount) { lostScheduled += 1; continue; }
    scheduled.push(createScheduled({
      freq: str(f.freq) === 'day' ? FREQ.DAILY : FREQ.MONTHLY,
      day: f.day || 1,
      from_id: fromId,
      to_id: toId,
      amount,
      note: f.note,
    }));
  }

  // ③ 分期：单文件版是「每期本金 / 利息手填的矩阵」，本工程是「本金 + 期数 + 利息 + 首月」。
  //    反推规则写在下面，**总额必须对上**（本金 = 各期 p 之和，利息 = 各期 i 之和）——
  //    单文件版允许每期不等额，搬过来只能按均额摊，这一点要在导入提示里说清楚。
  for (const it of p.installments || []) {
    if (!it) continue;
    const cells = it.cells || {};
    const months = Object.keys(cells)
      .filter((k) => cells[k] && (num(cells[k].p) || num(cells[k].i)))
      .sort();
    const toId = resolve(null, it.name);

    if (!months.length || !toId) { lostScheduled += 1; continue; }

    let principal = 0;
    let interest = 0;
    for (const ym of months) {
      principal += num(cells[ym].p);
      interest += num(cells[ym].i);
    }

    scheduled.push(createScheduled({
      freq: FREQ.MONTHLY,
      day: it.repayDay || 1,
      billDay: it.billDay,
      from_id: null,          // 单文件版的分期只记「哪张卡」，没有转出方
      to_id: toId,
      amount: principal || interest,
      note: str(it.note) || '分期',
      inst: {
        periods: months.length,
        firstMonth: normalizeMonth(months[0]),
        principal: round2(principal),
        interest: round2(interest),
      },
    }));
  }

  return {
    state: { ...state, scheduled },
    stats: {
      accounts: idByName.size,
      transactions: count,
      loose,
      scheduled: scheduled.length,
      lostScheduled,
    },
  };
}

/** 保留两位（.lz 里可能有 12.300000000000001 这种浮点尾巴） */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
