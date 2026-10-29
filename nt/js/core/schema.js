// 界面：（无界面）数据结构定义
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

/** 简码长度约束（1~5，不区分大小写，统一存大写） */
export const CODE_MIN_LEN = 1;
export const CODE_MAX_LEN = 5;

/** 简码归一化：去空白 → 转大写。空串返回空串，不做别的猜测。 */
export function normalizeCode(raw) {
  return String(raw == null ? '' : raw).replace(/\s+/g, '').toUpperCase();
}

/**
 * 简码是否合法：**1~5 位、任意字符**（用户 2026-10-29 指定 —— 中文、符号都行）。
 * 空白会被 normalizeCode 去掉，所以「只有空格」等于空串、判不合法。
 */
export function isValidCode(raw) {
  const c = normalizeCode(raw);
  return c.length >= CODE_MIN_LEN && c.length <= CODE_MAX_LEN;
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
  const rawType = String(patch.type == null ? '' : patch.type).trim();
  const acc = {
    id: patch.id || makeId('acc'),
    // 简码只是「输入用的马甲」，但必须唯一且非空（由 V7 校验把关）
    code: normalizeCode(patch.code),
    name: String(patch.name || '').trim(),
    // 类型允许用户自己填（用户 2026-10-30）；不填时按资产类
    type: rawType || ACCOUNT_TYPE.ASSET,
    category: String(patch.category || '').trim(),
    isHidden: !!patch.isHidden,
  };

  // 序号：允许跳号（如 …63、80、100）；没填就不写这个字段
  const seq = Number(patch.seq);
  if (Number.isFinite(seq) && seq > 0) acc.seq = Math.round(seq);

  // 账单日 / 还款日是可选属性：没填就不写这个字段。
  // 用 clampDay 兜底会把「没填」变成 1 号 —— 那是在替用户编数据。
  if (isDayGiven(patch.billDay)) acc.billDay = clampDay(patch.billDay);
  if (isDayGiven(patch.repayDay)) acc.repayDay = clampDay(patch.repayDay);

  return acc;
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

/* ---------- 计划流水（固定收支 + 分期，统一结构） ---------- */

/** 频率 */
export const FREQ = { DAILY: 'daily', MONTHLY: 'monthly' };

/**
 * 造一条「计划流水」。
 *
 * 固定收支与分期**共用这一个结构** —— 分期只是多带了一个 inst 字段：
 *   固定房租：{ freq:'monthly', day:25, from_id, to_id, amount:900 }
 *   分期还款：{ ...同上, inst:{ periods:12, firstMonth:'2026-08', principal:12000, interest:720 } }
 *
 * 它不产生真实流水，只是「规则」；未来的虚拟流水由 scheduler-engine 现算。
 */
export function createScheduled(patch = {}) {
  const amount = Number(String(patch.amount == null ? 0 : patch.amount).replace(/[¥,\s]/g, ''));
  const base = {
    id: patch.id || makeId('sched'),
    isScheduled: true,
    freq: patch.freq === FREQ.DAILY ? FREQ.DAILY : FREQ.MONTHLY,
    day: clampDay(patch.day),
    from_id: patch.from_id || null,
    to_id: patch.to_id || null,
    amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
    note: String(patch.note || ''),
  };

  // 账单日（信用卡的记账日）是**可选**的：没填就不写这个字段。
  // 不能用 clampDay 兜底 —— 它会把「没填」变成 1 号，那是在替用户编数据。
  if (isDayGiven(patch.billDay)) base.billDay = clampDay(patch.billDay);

  // 这笔规则是从哪条流水勾出来的（流水表「固定」列那个复选框）。
  // 有它就说明「这条规则有来源」，勾选框据此回显；取消勾选时按它删规则。
  if (patch.srcTxId) base.srcTxId = String(patch.srcTxId);

  if (patch.inst) {
    base.inst = {
      periods: Math.max(0, Math.floor(Number(patch.inst.periods) || 0)),
      firstMonth: normalizeMonth(patch.inst.firstMonth),
      principal: Math.max(0, Number(patch.inst.principal) || 0),
      interest: Math.max(0, Number(patch.inst.interest) || 0),
    };
  }
  return base;
}

/** 用户真的给了「几号」吗（空串 / null / 0 / 非数字都算没给） */
export function isDayGiven(raw) {
  if (raw == null) return false;
  const s = String(raw).trim();
  if (!s) return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

/** 把「几号」钳到 1~31 */
export function clampDay(raw) {
  const n = Math.floor(Number(raw) || 0);
  if (n < 1) return 1;
  if (n > 31) return 31;
  return n;
}

/** 月份归一化成 YYYY-MM；认不出返回空串 */
export function normalizeMonth(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) {
    const mm = Number(m[2]);
    if (mm >= 1 && mm <= 12) return `${m[1]}-${String(mm).padStart(2, '0')}`;
    return '';
  }
  // 支持 "202608" / "2608" 这种紧凑写法
  const d = s.replace(/[^0-9]/g, '');
  if (d.length === 6) return `${d.slice(0, 4)}-${d.slice(4, 6)}`;
  if (d.length === 4) {
    const yy = Number(d.slice(0, 2));
    const full = yy > 50 ? 1900 + yy : 2000 + yy;
    return `${full}-${d.slice(2, 4)}`;
  }
  return '';
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
