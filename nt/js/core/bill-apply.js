// 界面：（无界面）账单导入落库：补账户 → 写流水 → 判重
/**
 * 账单导入落库（Bill Apply）
 * 层：第一层 · core
 *
 * `planBillImport()` 只给计划，这里把它变成真 state：
 *   ① 认不出的对方账户按建议**新建**（费用类 / 收入类 —— 六大核心元素里的两类）
 *   ② 每行写一笔流水；两端齐全才入账，缺一边就留空（按 U 区规则变草稿）
 *   ③ 判重：有单号用单号；没有（招行）用「日期·金额·两端」的多重集，
 *      同一天同一商户刷两笔是合法的，不能被吞掉
 *
 * 纯函数：返回新 state，不改入参。
 */

import { addAccount, addNote, addTransaction } from './state-store.js';
import { specialOf, stamp } from './keyword-engine.js';
import { collectNewAccounts, planBillImport } from './bill-plan.js';

const norm = (v) => String(v == null ? '' : v).trim();

/**
 * 商品说明里**不算特殊**的词：支付方式、收款场景。它们每笔都长一样，
 * 放进备注只会让每一行看起来都一样（用户 2026-11-08：备注要放最具辨识度的字段）。
 */
const GENERIC_ITEM = /收钱码|二维码|经营码|扫码|快捷支付|消费|付款|转账|收款/;

/** 太长的商品名不适合当备注：截一半会变成看不懂的碎片，索性只留时间 */
const SPECIAL_MAX = 10;

/** 时间 → 顺序键「HHMM」。兼容两种备注：旧格式 `19:08 …` 和新压缩串 `…2608081317…` */
function timeKeyOf(note) {
  const s = String(note == null ? '' : note);
  const colon = /(\d{2}):(\d{2})/.exec(s);
  if (colon) return colon[1] + colon[2];
  const stamp = /(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(s);
  return stamp ? stamp[4] + stamp[5] : '';
}

/** 从「10:39」或备注开头的「10:39 …」或压缩串里取分钟数 */
function minutesOf(v) {
  const key = timeKeyOf(v);
  if (!key) return null;
  const hh = Number(key.slice(0, 2));
  if (hh > 23) return null;
  return hh * 60 + Number(key.slice(2));
}

/**
 * 是不是「疑似重复」——**只标记，不拦**（用户 2026-11：
 * 「三个账单实际会有大量重复，支付宝往往是中介，真正转出账户不是它。
 *   这些重复记录通过时间排序连续在一起，标记成红色字体，由用户逐条删除，留下需要的。」）。
 *
 * 判定看三件事同时成立：
 *   ① 同一天、同金额
 *   ② 转出或转入有一端相同（同一张卡 / 同一个节点）
 *   ③ 两边都有时间时，相差不超过 2 小时（银行入账时间常晚于支付时间）
 *
 * 支付宝绑卡支付的那笔，转出方就是那张卡，所以和银行账单会撞上 ②。
 */
function isSuspect(row, existing) {
  const a = minutesOf(row.time);
  for (const t of existing || []) {
    if (!t || String(t.date || '') !== String(row.date)) continue;
    if (Math.abs((Number(t.amount) || 0) - row.amount) >= 0.005) continue;
    const sameFrom = row.fromId && t.from_id === row.fromId;
    const sameTo = row.toId && t.to_id === row.toId;
    if (!sameFrom && !sameTo) continue;
    // 时间是 00:00 等于「这笔没给时间」（招行整份账单都只有日期）——
    // 拿它去比会把所有银行记录都排除掉，所以只有两边都真有时间时才比。
    const b = minutesOf(t.note);
    if (a != null && a !== 0 && b != null && b !== 0 && Math.abs(a - b) > 120) continue;
    return true;
  }
  return false;
}

/**
 * 按「日期 + 发生时间」重排流水，让同一天的记录连续。
 * 期初流水排最前（它们是账本起点，不是某一天的消费）。
 */
export function sortByDate(state) {
  const list = (state && state.transactions) || [];
  const isOpening = (t) => !!t && (t.opening || Number(t.seq) === 0);
  const head = list.filter(isOpening);
  const rest = list.filter((t) => !isOpening(t));
  const key = (t) => {
    // 备注里可能是旧格式 `19:08 …`，也可能是压缩串 `…，2608081317，…`
    return String((t && t.date) || '') + ' ' + timeKeyOf(t && t.note);
  };
  rest.sort((x, y) => {
    const a = key(x);
    const b = key(y);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return {
    ...state,
    transactions: [...head, ...rest].map((t, i) => ({ ...t, seq: i + 1 })),
  };
}

/**
 * @param {object} state
 * @param {{items:Array, presetId?:string}} res  analyzeTable() 的结果
 * @param {{from?:string, to?:string, myAccountId?:string, rules?:Array,
 *          includeNeutral?:boolean, createMissing?:boolean}} opts
 * @returns {{state:object, plan:object, stats:object}}
 */
export function applyBillPlan(state, res, opts) {
  const o = opts || {};
  const plan = planBillImport((res && res.items) || [], {
    accounts: (state && state.accounts) || [],
    from: o.from,
    to: o.to,
    presetId: (res && res.presetId) || o.presetId,
    myAccountId: o.myAccountId,
    cardTail: (res && res.hints && res.hints.cardTail) || o.cardTail,
    rules: o.rules,
    aliases: o.aliases || (res && res.aliases),
    includeNeutral: o.includeNeutral,
  });

  let st = state;
  const byName = new Map();
  for (const a of st.accounts || []) byName.set(norm(a.name), a);

  // ① 补对方账户（按名字去重；已有的直接复用）
  const createMissing = o.createMissing !== false;
  let created = 0;
  if (createMissing) {
    for (const want of collectNewAccounts(plan)) {
      if (byName.has(want.name)) continue;
      const before = st.accounts.length;
      // 节点统计分类 = 账单的「交易分类」；节点会计类型 = 费用 / 收入（六大核心元素里的两个）
      st = addAccount(st, { name: want.name, type: want.type, category: want.category, fresh: true });
      const acc = st.accounts[before];
      if (acc) { byName.set(want.name, acc); created += 1; }
    }
  }

  // ①b 待归类关键字登记到备注区（用户 2026-11-08）：
  // 高频商户先以关键字身份存在，用户在备注区把它改成真实节点名后再合并。
  for (const kw of plan.keywords || []) {
    if ((st.notes || []).some((n) => norm(n.keyword) === kw)) continue;
    st = addNote(st, { keyword: kw });
  }

  // ② 导入前已有流水的快照 —— 只跟它比，同批内的多笔真实消费不互相标红
  const existing = (st.transactions || []).slice();
  const seenBill = new Set((st.transactions || []).map((t) => norm(t.billId)).filter(Boolean));

  let added = 0;
  let suspect = 0;
  let blank = 0;

  for (const row of plan.rows) {
    const resolve = (sug) => (sug && byName.has(sug.name) ? byName.get(sug.name).id : '');
    let fromId = row.fromId;
    let toId = row.toId;
    if (row.transfer) {
      // 资金流转：缺哪端就用哪端的建议（还款的另一端常常是一张要新建的信用卡）
      if (!fromId) fromId = resolve(row.fromSuggest);
      if (!toId) toId = resolve(row.toSuggest);
    } else {
      if (!fromId) fromId = row.dir === 'out' ? resolve(row.mySuggest) : resolve(row.otherSuggest);
      if (!toId) toId = row.dir === 'out' ? resolve(row.otherSuggest) : resolve(row.mySuggest);
    }
    if (!fromId || !toId) blank += 1;

    // 疑似重复：**只标红，不跳过** —— 删哪一条由用户在流水表里定
    let mark = false;
    if (row.billId && seenBill.has(row.billId)) mark = true;
    else if (isSuspect({ ...row, fromId, toId }, existing)) mark = true;
    if (row.billId) seenBill.add(row.billId);

    // 备注栏只放**列上没有的、能区分同组流水的那点信息**（用户 2026-11-08）：
    // 转出 / 转入两列已经写着节点名了，备注再写一遍就是废话。
    //   → `特殊字段，YYMMDDHHMM`；特殊字段与节点名重复/包含时整段省掉。
    const otherId = row.dir === 'in' ? fromId : toId;
    const otherAcc = (st.accounts || []).find((a) => a && a.id === otherId) || null;
    const nodeName = norm(otherAcc && otherAcc.name);
    const special = specialOf(row.itemText || '');
    const usable = special && special.length <= SPECIAL_MAX && !GENERIC_ITEM.test(special);
    const redundant = !usable || !nodeName
      || special === nodeName || nodeName.includes(special) || special.includes(nodeName);
    const noteHead = redundant ? '' : special;
    const noteText = [noteHead, stamp(row.date, row.time)].filter(Boolean).join('，');

    st = addTransaction(st, {
      date: row.date,
      from_id: fromId || null,
      to_id: toId || null,
      amount: row.amount,
      note: noteText || row.note,
      billId: row.billId || undefined,
      // 备注分类 / 备注关键字（六大核心元素的后两个）
      noteType: row.noteType || undefined,
      noteKeyword: row.noteKeyword || undefined,
      suspect: mark || undefined,
    });
    added += 1;
    if (mark) suspect += 1;
  }

  // ③ 按日期 + 时间重排：同一笔在两个账单里出现时，排在一起，一眼看得到
  st = sortByDate(st);

  return {
    state: st,
    plan,
    stats: {
      ...plan.stats,
      added,
      dup: suspect,
      blank,
      created,
    },
  };
}
