// 界面：（无界面）账单 → 导入计划：方向、账户、日期过滤、备注线索
/**
 * 账单导入计划（Bill Plan）
 * 层：第一层 · core
 *
 * 把 `analyzeTable()` 解析出来的单边记录，变成一组「可以落库的流水计划」：
 *   · 按起始 / 结束日期过滤（用户要「什么日期之前的不用再核对」）
 *   · 定方向：支出 / 收入 / 中性
 *   · 补两端账户：支付方式 → 我的账户；商户/分类 → 对方账户
 *   · 认不出的那一侧留空并给出建议，**不猜**（留空 = 按 U 区规则不入账）
 *
 * 纯函数：不读 state、不写 state、不建账户。建账户由调用方按 `suggest` 做。
 */

import {
  matchAccountText, matchMerchantAccount, matchPayAccount, suggestMyAccount, suggestOtherAccount,
} from './bill-match.js';
import { aliasGet } from './alias-table.js';
import { money } from './format.js';

const norm = (v) => String(v == null ? '' : v).trim();

/**
 * 方向归一化。
 *
 * 三家写法不一样，而且都有坑：
 *   · 支付宝/微信的「收/支」是中文，「不计收支」里含「支」—— 必须先排除，
 *     否则还款、退款全被算成支出（单文件版踩过这个坑）。
 *   · 微信的「中性交易」写的是 `/`。
 *   · 招行没有方向列，金额带负号：负=支出，正=收入。
 *
 * @returns {'out'|'in'|'neutral'}
 */
export function directionOf(item, presetId) {
  const d = norm(item && item.dir);
  const amt = Number(item && item.amount) || 0;
  if (/不计|其他|其它/.test(d)) return 'neutral';
  if (/支/.test(d)) return 'out';
  if (/收/.test(d)) return 'in';
  if (/借/.test(d)) return 'out';
  if (/贷/.test(d)) return 'in';
  if (!d || d === '/') {
    if (presetId === 'cmb') return amt < 0 ? 'out' : 'in';
    return 'neutral';
  }
  return 'neutral';
}

/**
 * 商户出现这么多次才算「关键字」（用户 2026-11-08）：
 * 只出现 1~2 次的商户不值得单独成节点，它只是一条普通备注；
 * 高频的才给它一个待归类的节点，等用户在备注区改名为真实节点。
 */
export const KEYWORD_MIN = 3;

/** 资金流转的备注关键字：还款 / 提现 / 退款 / 转账 */
export function neutralKeyword(item) {
  const cat = norm(item && item.category);
  const it = norm(item && item.item);
  const both = cat + ' ' + it;
  if (/信用|还款/.test(both)) return '还款';
  if (/存取|提现/.test(both)) return '提现';
  if (/退款/.test(both)) return '退款';
  return '转账';
}

/** 一行账单 → 流水计划（含六大核心元素） */
function planOne(item, ctx) {
  const { accounts, rules, myAccountId, presetId, cardTail } = ctx;
  const dir = directionOf(item, presetId);
  const amount = Math.abs(Number(item.amount) || 0);

  let my = matchPayAccount(accounts, item.method);
  // 招行整份账单没有支付方式列，只有表头里一个「账号：…7912」；
  // 先按尾号找账户，再退到用户选的卡。
  if (!my && cardTail) my = accounts.find((a) => a && norm(a.name).includes(cardTail)) || null;
  if (!my && myAccountId) my = accounts.find((a) => a && a.id === myAccountId) || null;
  const other = matchMerchantAccount(accounts, rules, item.party, item.item, item.category);

  const bits = [item.party, item.item, item.method]
    .map((x) => norm(x))
    .filter((x) => x && x !== '/');
  let note = bits.join('｜');
  if (item.note && item.note !== '/') note += (note ? '（' + item.note + '）' : item.note);
  if (item.time) note = item.time + ' ' + note;

  const myName = my ? norm(my.name) : '';
  const otherName = other ? norm(other.name) : '';
  const fromName = dir === 'out' ? myName : otherName;
  const toName = dir === 'out' ? otherName : myName;

  // 六大核心元素：转出节点 / 转入节点 / 节点统计分类 / 节点会计类型 /
  // 备注分类 / 备注关键字。前两个是 id，第三四个挂在节点上，后两个是流水字段。
  //
  // 对方节点叫什么（用户 2026-11-08）：**高频商户用商户名**（味丰源 → 待归类节点，
  // 用户在备注区改名后就能并进真实节点）；低频商户用交易分类（支付宝）或交易摘要（招行），
  // 商户名只进备注关键字 —— 否则 365 笔账单会凭空长出八十个节点。
  const p = norm(item.party);
  const hot = !!p && p !== '/' && ((ctx.freq && ctx.freq.get(p)) || 0) >= KEYWORD_MIN;
  const prefer = presetId === 'cmb' ? 'item' : (presetId === 'alipay' && !hot ? 'category' : '');
  const suggest = other
    ? null
    : suggestOtherAccount(item.party, item.item, item.category, dir, prefer);
  // 别名表命中时直接用那个规范名（味丰源 → 早餐）：
  // 用户已经确认过一次的归类，不该每次导入都从零猜。
  const aliasTarget = aliasGet(ctx.aliases, p);
  if (suggest && aliasTarget) suggest.name = aliasTarget;
  const mySuggest = my ? null : suggestMyAccount(item.method);

  return {
    date: item.date,
    time: item.time || '',
    amount,
    dir,
    fromId: dir === 'out' ? (my ? my.id : '') : (other ? other.id : ''),
    toId: dir === 'out' ? (other ? other.id : '') : (my ? my.id : ''),
    fromName,
    toName,
    myId: my ? my.id : '',
    mySuggest,
    otherId: other ? other.id : '',
    /** 节点会计类型：对方节点（费用 / 收入）；我的节点用已有账户的类型 */
    otherType: other ? norm(other.type) : (suggest ? suggest.type : ''),
    /** 节点统计分类 */
    otherCategory: other ? norm(other.category) : (suggest ? suggest.category : ''),
    otherSuggest: suggest,
    /** 备注分类 / 备注关键字 */
    noteType: norm(item.category),
    noteKeyword: norm(item.party),
    /** 高频商户且还没有同名节点 → 要在备注区登记成「待归类关键字」 */
    hotKeyword: hot && !other && !aliasTarget ? p : '',
    note: note.slice(0, 160),
    billId: norm(item.tradeNo),
  };
}

/**
 * 还款的对方通常是一张信用卡：账单里如果给了「信用卡(1234)」这类标记，
 * 就按尾号在节点列表里匹配（matchAccountText 会认 3 位以上数字）；
 * 匹配不到就建议建一个负债节点，名字用尾号 —— 用户之后可以改名。
 * @returns {{name:string, type:string, category:string}|null}
 */
export function creditCardSuggest(party, item) {
  const text = norm(party) + ' ' + norm(item);
  if (!/信用卡|还款|信用购|花呗|借呗|白条/.test(text)) return null;
  const tail = (text.match(/\d{4,}/) || [])[0] || '';
  if (tail) return { name: `信用卡(${tail})`, type: '负债类', category: '信用' };
  if (/信用卡/.test(text)) return { name: '信用卡', type: '负债类', category: '信用' };
  return null;
}

/**
 * 中性交易 → 一笔「账户间转账」（两端都必须是账本里**已有**的账户）。
 *
 * 账单里「不计收支」/`/` 的行不是收支，是三种资金流转：
 *   ① 还款（分类「信用借还」）：储蓄卡/余额宝 → 花呗/借呗/信用卡
 *   ② 退款（分类「退款」）：原费用节点 → 退回的那个账户（卡或花呗）
 *   ③ 搬钱 / 理财（「账户存取」「投资理财」）：余额宝 ⇄ 余额 ⇄ 银行卡（含提现、申赎）
 *
 * 方向靠账单自带的分类 + 商品说明里的动词判断。**认不出就不猜** ——
 * 宁可少导一笔，也不要凭空造一笔反向转账（那会把两个账户的余额同时弄错）。
 * 认出一端、另一端是「该新建的信用卡」时，返回 `toSuggest` 让调用方去建节点。
 *
 * @param {object} item analyzeTable().items 的一行
 * @param {{accounts:Array, rules?:Array}} ctx
 * @returns {{dir:'transfer', fromId:string, toId:string, fromName:string, toName:string,
 *            toSuggest?:object}|null}
 */
export function neutralPlan(item, ctx) {
  const o = ctx || {};
  const accounts = o.accounts || [];
  const cat = norm(item && item.category);
  const it = norm(item && item.item);
  const party = norm(item && item.party);
  const method = norm(item && item.method);

  const pay = matchPayAccount(accounts, method);
  const partyAcc = matchAccountText(accounts, party);
  const itemAcc = matchAccountText(accounts, it);

  const done = (from, to, sug) => {
    if (from && to && from.id !== to.id) {
      return {
        dir: 'transfer',
        fromId: from.id,
        toId: to.id,
        fromName: norm(from.name),
        toName: norm(to.name),
      };
    }
    if (from && sug) {
      return {
        dir: 'transfer',
        fromId: from.id,
        toId: '',
        fromName: norm(from.name),
        toName: sug.name,
        toSuggest: sug,
      };
    }
    return null;
  };

  // ① 还款：钱从卡/余额宝出去，花呗/借呗/信用卡的欠款减少
  if (/信用|还款/.test(cat) || /还款/.test(it)) {
    return done(pay, partyAcc, partyAcc ? null : creditCardSuggest(party, it));
  }

  // ② 退款：原费用节点 → 退回的账户（退到花呗时 method 就是「花呗」）
  if (/退款/.test(cat) || /^退款/.test(it)) {
    const from = matchMerchantAccount(accounts, o.rules, party, it, cat) || matchAccountText(accounts, party);
    return done(from, pay || partyAcc);
  }

  // ③ 提现：余额 → 银行（对方写的是银行全名，走支付方式那套别名）
  if (/存取/.test(cat) || /提现/.test(it)) return done(pay, matchPayAccount(accounts, party));

  // ④ 搬钱 / 理财：按商品说明里的动词定方向
  const target = partyAcc || itemAcc;
  if (/转出|赎回/.test(it)) return done(target, pay);
  if (/转入|收款到|理财/.test(it)) return done(pay, target);
  return null;
}

/**
 * 整张账单 → 导入计划。
 *
 * @param {Array} items   analyzeTable().items
 * @param {{
 *   accounts: Array, from?: string, to?: string, presetId?: string,
 *   myAccountId?: string, rules?: Array,
 * }} opts
 * @returns {{
 *   rows: Array,
 *   keywords: string[],
 *   stats: {
 *     total:number, kept:number, before:number, after:number,
 *     transfer:number, pending:number,
 *     myMatched:number, otherMatched:number, willCreate:number,
 *     minDate:string, maxDate:string, sumOut:number, sumIn:number,
 *   }
 * }}
 */
export function planBillImport(items, opts) {
  const o = opts || {};
  const list = items || [];

  // 商户频次：决定哪些商户值得单独成「待归类」节点（低频的只进备注）
  const freq = new Map();
  for (const it of list) {
    const p = norm(it && it.party);
    if (p && p !== '/') freq.set(p, (freq.get(p) || 0) + 1);
  }

  const ctx = {
    accounts: o.accounts || [],
    rules: o.rules || [],
    aliases: o.aliases || [],
    myAccountId: norm(o.myAccountId),
    presetId: norm(o.presetId),
    cardTail: norm(o.cardTail),
    freq,
  };
  const from = norm(o.from);
  const to = norm(o.to);

  const rows = [];
  const keywords = new Set();
  const stats = {
    total: 0, kept: 0, before: 0, after: 0, transfer: 0, pending: 0,
    myMatched: 0, otherMatched: 0, willCreate: 0,
    minDate: '', maxDate: '', sumOut: 0, sumIn: 0,
  };

  for (const it of list) {
    if (!it || !it.date) continue;
    stats.total += 1;
    if (from && it.date < from) { stats.before += 1; continue; }
    if (to && it.date > to) { stats.after += 1; continue; }

    let row = planOne(it, ctx);
    if (row.dir === 'neutral') {
      // 资金流转：**绝不跳过**（用户 2026-11-08）。两端都认得出 → 转账；
      // 只认出一端 → 照样落地，另一端留空（U 区规则会存成草稿，
      // 用户在流水表里补上另一端就转正）。
      const kw = neutralKeyword(it);
      keywords.add(kw);
      const t = neutralPlan(it, ctx);
      if (t) {
        row = {
          ...row,
          dir: 'transfer',
          transfer: true,
          fromId: t.fromId,
          toId: t.toId,
          fromName: t.fromName,
          toName: t.toName,
          toSuggest: t.toSuggest || null,
          noteKeyword: kw,
          hotKeyword: '',
          mySuggest: null,
          otherSuggest: null,
          pending: t.toId ? undefined : true,
        };
        if (t.toId) stats.transfer += 1;
        else stats.pending += 1;
      } else {
        const pay = matchPayAccount(ctx.accounts, it.method);
        row = {
          ...row,
          dir: 'transfer',
          transfer: true,
          pending: true,
          fromId: pay ? pay.id : '',
          toId: '',
          fromName: pay ? norm(pay.name) : '',
          toName: '',
          otherId: '',
          noteKeyword: kw,
          hotKeyword: '',
          mySuggest: null,
          otherSuggest: null,
        };
        stats.pending += 1;
      }
    }
    if (row.hotKeyword) keywords.add(row.hotKeyword);
    if (row.amount <= 0) continue;

    if (row.myId) stats.myMatched += 1;
    if (row.otherId) stats.otherMatched += 1;
    else if (!row.transfer) stats.willCreate += 1;
    // 资金流转不进「消费 / 收入」合计（它们是账户之间搬钱，不是花掉）
    if (!row.transfer) {
      if (row.dir === 'out') stats.sumOut += row.amount;
      else if (row.dir === 'in') stats.sumIn += row.amount;
    }

    if (!stats.minDate || row.date < stats.minDate) stats.minDate = row.date;
    if (!stats.maxDate || row.date > stats.maxDate) stats.maxDate = row.date;
    rows.push(row);
  }

  stats.kept = rows.length;
  stats.sumOut = Math.round(stats.sumOut * 100) / 100;
  stats.sumIn = Math.round(stats.sumIn * 100) / 100;
  return { rows, stats, keywords: [...keywords] };
}

/**
 * 计划里需要新建的对方账户（按「类型 + 名字」去重）。
 * 只列出要建什么，不建 —— 建账户由调用方用 `addAccount` 做，因为那要改 state。
 */
export function collectNewAccounts(plan) {
  const seen = new Map();
  const add = (sug) => {
    if (!sug || !sug.name) return;
    const key = sug.type + '|' + sug.name;
    if (seen.has(key)) return;
    seen.set(key, { name: sug.name, type: sug.type, category: sug.category || '' });
  };
  for (const row of plan.rows || []) {
    add(row.mySuggest);
    add(row.otherSuggest);
    add(row.fromSuggest);
    add(row.toSuggest);
  }
  return [...seen.values()];
}

/** 一行导入计划 → 预览里的一行文字（UI 与测试共用同一口径） */
export function previewLine(row) {
  const sign = row.transfer ? '⇄' : (row.dir === 'out' ? '-' : '+');
  const to = row.toName || (row.otherSuggest && row.otherSuggest.name) || '?';
  return `${row.date}  ${sign}${money(row.amount)}  ${row.fromName || '?'} → ${to}  ${row.note || ''}`.trim();
}
