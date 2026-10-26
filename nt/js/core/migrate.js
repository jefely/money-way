/**
 * 数据迁移（幂等，可重复执行）
 * 层：第一层 · 数据基座
 *
 * v1（老结构）→ v2（ID 结构）：
 *   accounts[].cat  变成 type（资产类/负债类/…）
 *   accounts[].sub  变成 category
 *   accounts[].opening 变成一条期初流水（对手方 __OPENING__）
 *   transactions[].from/to（名字） 变成 from_id/to_id（ID）
 *
 * 关键：**名字只在这一刻被读一次**，之后流水永久只认 ID。
 * 所以用户以后随便改账户名，历史流水都不会断链。
 *
 * 注意：这里刻意避开可选链和复杂展开表达式 ——
 * 早先一版用 `?.` 与嵌套展开，浏览器在模块预解析阶段直接报
 * "Failed to fetch dynamically imported module"，连报错位置都不给。
 */

import {
  SCHEMA_VERSION,
  ACCOUNT_TYPE,
  OPENING_ACCOUNT,
  OPENING_ACCOUNT_ID,
  createAccount,
  createTransaction,
} from './schema.js';

const KNOWN_TYPES = [
  ACCOUNT_TYPE.ASSET,
  ACCOUNT_TYPE.LIABILITY,
  ACCOUNT_TYPE.EQUITY,
  ACCOUNT_TYPE.INCOME,
  ACCOUNT_TYPE.EXPENSE,
];

/** 老结构里的 cat 转成新 type；认不出的按资产类处理 */
function normalizeType(raw) {
  const v = String(raw || '');
  for (let i = 0; i < KNOWN_TYPES.length; i++) {
    if (KNOWN_TYPES[i] === v) return v;
  }
  return ACCOUNT_TYPE.ASSET;
}

/** 老账户对象 → 新结构 */
function upgradeAccount(raw) {
  const src = raw || {};
  return createAccount({
    id: src.id,
    name: src.name,
    type: normalizeType(src.cat || src.type),
    category: src.sub || src.category || '',
    isHidden: !!src.isHidden,
  });
}

/** 已经是新结构？（流水里没有旧的 from/to 名字字段就算） */
function isAlreadyV2(src) {
  if (Number(src.version) < SCHEMA_VERSION) return false;
  const txs = Array.isArray(src.transactions) ? src.transactions : [];
  for (let i = 0; i < txs.length; i++) {
    const t = txs[i];
    if (Object.prototype.hasOwnProperty.call(t, 'from')) return false;
    if (Object.prototype.hasOwnProperty.call(t, 'to')) return false;
  }
  return true;
}

/**
 * 迁移入口。
 * @param {object} raw 任意版本的存档
 * @returns {{state:object, migrated:boolean, from:number, to:number, stats:object}}
 */
export function migrate(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const from = Number(src.version) || 1;

  if (isAlreadyV2(src)) {
    return { state: src, migrated: false, from: from, to: SCHEMA_VERSION, stats: {} };
  }

  // ---- 1. 账户 ----
  const oldAccounts = Array.isArray(src.accounts) ? src.accounts : [];
  const accounts = [];
  for (let i = 0; i < oldAccounts.length; i++) {
    accounts.push(upgradeAccount(oldAccounts[i]));
  }
  if (!hasOpeningAccount(accounts)) {
    accounts.unshift(Object.assign({}, OPENING_ACCOUNT));
  }

  // ---- 2. 名字 / 简码 → ID（迁移期一次性映射） ----
  const byName = new Map();
  const byCode = new Map();
  for (let i = 0; i < accounts.length; i++) {
    const a = accounts[i];
    if (a.name) byName.set(a.name, a.id);
  }
  for (let i = 0; i < oldAccounts.length; i++) {
    const raw2 = oldAccounts[i];
    const acc = accounts[i + (hasOpeningAccount(accounts) && accounts[0].id === OPENING_ACCOUNT_ID ? 1 : 0)];
    if (raw2.code && acc) byCode.set(String(raw2.code).toUpperCase(), acc.id);
  }

  function resolve(nameOrCode) {
    const v = String(nameOrCode || '').trim();
    if (!v) return null;
    if (byName.has(v)) return byName.get(v);
    if (byCode.has(v.toUpperCase())) return byCode.get(v.toUpperCase());
    return null;
  }

  // ---- 3. 流水：名字转 ID ----
  const oldTxs = Array.isArray(src.transactions) ? src.transactions : [];
  const transactions = [];
  let chainBroken = 0;

  for (let i = 0; i < oldTxs.length; i++) {
    const t = oldTxs[i] || {};
    let fromId = t.from_id || resolve(t.from);
    let toId = t.to_id || resolve(t.to);
    if (t.from && !fromId) chainBroken += 1;
    if (t.to && !toId) chainBroken += 1;
    transactions.push(createTransaction({
      id: t.id,
      date: t.date,
      from_id: fromId,
      to_id: toId,
      amount: t.amount,
      note: t.note,
      seq: Number(t.seq) || (i + 1),
      opening: !!t.opening,
      inst: t.inst,
    }));
  }

  // ---- 4. 账户上的 opening → 期初流水 ----
  const opened = new Set();
  for (let i = 0; i < transactions.length; i++) {
    if (transactions[i].opening) opened.add(transactions[i].to_id);
  }

  let openingAdded = 0;
  for (let i = 0; i < oldAccounts.length; i++) {
    const rawAcc = oldAccounts[i];
    const amount = Number(rawAcc.opening) || 0;
    if (!amount) continue;
    const accId = byName.get(rawAcc.name);
    if (!accId || opened.has(accId)) continue;

    transactions.unshift(createTransaction({
      id: 'tx_opening_' + accId,
      date: String(src.openingDate || '2000-01-01'),
      from_id: OPENING_ACCOUNT_ID,
      to_id: accId,
      amount: amount,
      note: '期初',
      opening: true,
      seq: 0,
    }));
    opened.add(accId);
    openingAdded += 1;
  }

  const meta = src.meta && typeof src.meta === 'object' ? src.meta : {};
  const state = {
    version: SCHEMA_VERSION,
    accounts: accounts,
    transactions: transactions,
    meta: { lastSync: String(meta.lastSync || '') },
  };

  return {
    state: state,
    migrated: true,
    from: from,
    to: SCHEMA_VERSION,
    stats: {
      accounts: accounts.length,
      transactions: transactions.length,
      openingAdded: openingAdded,
      chainBroken: chainBroken,
    },
  };
}

function hasOpeningAccount(accounts) {
  for (let i = 0; i < accounts.length; i++) {
    if (accounts[i].id === OPENING_ACCOUNT_ID) return true;
  }
  return false;
}
