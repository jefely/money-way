/**
 * 数据结构定义（Schema）
 * 层：第一层 · 数据基座
 *
 * 三条铁律（本文件是它们唯一的定义处）：
 *   ① **底层存 ID** —— 流水只存 from_id / to_id，绝不存账户名
 *   ② **视图看名字** —— 显示时用 ID 去账户表映射出 name
 *   ③ **计算靠类型** —— 加减法只由 account.type 决定
 *
 * 纯定义 + 纯函数：不碰 DOM / 存储，Node 可测。
 */

/** 五种账户类型 */
export const ACCOUNT_TYPE = {
  ASSET: '资产类',
  LIABILITY: '负债类',
  EQUITY: '权益类',
  INCOME: '收入类',
  EXPENSE: '费用类',
};

export const ALL_ACCOUNT_TYPES = [
  ACCOUNT_TYPE.ASSET,
  ACCOUNT_TYPE.LIABILITY,
  ACCOUNT_TYPE.EQUITY,
  ACCOUNT_TYPE.INCOME,
  ACCOUNT_TYPE.EXPENSE,
];

/** 借增贷减的类型：资产类、费用类。其余相反。 */
export const DEBIT_TYPES = [ACCOUNT_TYPE.ASSET, ACCOUNT_TYPE.EXPENSE];

export function isDebitType(type) {
  return DEBIT_TYPES.includes(type);
}

/** 期初虚拟账户：用权益类承接「账本开始时的状态」 */
export const OPENING_ACCOUNT_ID = '__OPENING__';
export const OPENING_ACCOUNT = {
  id: OPENING_ACCOUNT_ID,
  code: '__OP__',
  name: '期初余额',
  type: ACCOUNT_TYPE.EQUITY,
  category: '',
  isHidden: true,
};

/** 简码长度约束（2~5，不区分大小写，统一存大写） */
export const CODE_MIN_LEN = 2;
export const CODE_MAX_LEN = 5;

/** 简码归一化：去空白 → 转大写。空串返回空串，不做别的猜测。 */
export function normalizeCode(raw) {
  return String(raw == null ? '' : raw).replace(/\s+/g, '').toUpperCase();
}

/** 简码是否合法（长度 2~5，只允许字母数字与 _ -） */
export function isValidCode(raw) {
  const c = normalizeCode(raw);
  if (c.length < CODE_MIN_LEN || c.length > CODE_MAX_LEN) return false;
  return /^[A-Z0-9_-]+$/.test(c);
}

/** 数据结构版本（迁移用） */
export const SCHEMA_VERSION = 2;

/* ---------- 工厂：只补默认值，不做业务判断 ---------- */

let _seqCounter = 0;

/** 生成唯一 ID（不依赖 crypto.randomUUID，Node/浏览器通用） */
export function makeId(prefix) {
  _seqCounter = (_seqCounter + 1) % 100000;
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${t}${r}${_seqCounter.toString(36)}`;
}

/**
 * 造一个账户。
 * @param {{id?:string,code?:string,name?:string,type?:string,category?:string,isHidden?:boolean}} patch
 */
export function createAccount(patch = {}) {
  return {
    id: patch.id || makeId('acc'),
    // 简码只是「输入用的马甲」，但必须唯一且非空（由 V7 校验把关）
    code: normalizeCode(patch.code),
    name: String(patch.name || '').trim(),
    type: ALL_ACCOUNT_TYPES.includes(patch.type) ? patch.type : ACCOUNT_TYPE.ASSET,
    category: String(patch.category || '').trim(),
    isHidden: !!patch.isHidden,
  };
}

/**
 * 造一笔流水。
 * 金额永远是正数（加减由账户类型决定，不是由符号决定）。
 * @param {{id?:string,date?:string,from_id?:string,to_id?:string,amount?:number|string,note?:string,seq?:number,opening?:boolean,inst?:object}} patch
 */
export function createTransaction(patch = {}) {
  const amount = Number(String(patch.amount == null ? 0 : patch.amount).replace(/[¥,\s]/g, ''));
  return {
    id: patch.id || makeId('tx'),
    date: String(patch.date || ''),
    from_id: patch.from_id || null,
    to_id: patch.to_id || null,
    amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
    note: String(patch.note || ''),
    seq: Number(patch.seq) || 0,
    ...(patch.inst ? { inst: patch.inst } : {}),
    ...(patch.opening ? { opening: true } : {}),
  };
}

/* ---------- 轻量校验（结构层，不涉及业务规则） ---------- */

export function isAccountShape(a) {
  return !!a && typeof a.id === 'string' && typeof a.name === 'string' && typeof a.type === 'string';
}

export function isTransactionShape(t) {
  return !!t && typeof t.id === 'string' && typeof t.date === 'string' && typeof t.amount === 'number';
}

/** 账户 ID → 账户对象（用 Map，O(1)） */
export function indexAccounts(accounts) {
  const map = new Map();
  for (const a of accounts || []) map.set(a.id, a);
  return map;
}

/** 按名字找账户（只用于「用户输入名字 → 解析成 ID」这一处） */
export function findAccountByName(accounts, name) {
  const n = String(name || '').trim();
  if (!n) return null;
  for (const a of accounts || []) {
    if (a.name === n) return a;
  }
  return null;
}
