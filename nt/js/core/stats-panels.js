// 界面：（无界面）统计口径：分类汇总 / 节点汇总共用的「六类 × 4 列」
/**
 * 统计口径（2026-11 用户《统计功能规划》）
 * 层：第一层 · 数据基座（纯函数，不碰 DOM / 存储 / 时钟）
 *
 * 两个视图只差第一列：
 *   分类汇总 → 统计分类名
 *   节点汇总 → 节点名
 * 四列数值完全一致，所以只有一套 calcStats，不做 12 张表 × 2 份公式。
 *
 * 六类的**列名**各不相同，但**数学只有三套**：
 *
 *   B 极（收入 / 负债 / 权益）  期初 = 历史转出 − 历史转入
 *                              本期增 = 本期转出   本期减 = 本期转入
 *   A 极（资产 / 成本）          期初 = 历史转入 − 历史转出
 *                              本期增 = 本期转入   本期减 = 本期转出
 *   费用（同 A 极，列名与第 1 列不同）
 *                              本期累计 = 到**本期结束**的累计净支出（转入 − 转出）
 *                              第 4 列 = 本期净出，不是期末余额
 *
 * 费用类跟其它 A 极只差两处：
 *   ① 第 1 列看的是「到本期结束」而不是「到本期开始前」。
 *      用户要的是「这类到今天一共花了多少」，不是「上期结束时花了多少」，
 *      所以它叫「本期累计」而不是「历史累计」。
 *      于是它正好等于资产类的「期末」：两者都是到本期结束的净额。
 *   ② 第 4 列只报本期净发生额，不把第 1 列并进去（所以没有期末）。
 *
 * 递推（滚动）：`本期累计 = 上期累计 + 本期净出`，所以下一期的本期累计会接着长。
 */

import { isDebitType } from './schema.js';
import { accountSummary } from './ledger-stats.js';

/** 六类从上到下的顺序（用户 2026-11 定）。分类汇总与节点汇总统一用这一套。 */
export const STAT_ORDER = ['收入类', '负债类', '权益类', '资产类', '费用类', '成本类'];

/**
 * 六类的「短名」：`收入类` → `收入`。
 * 小表的合计行显示的是短名（表头已经写明是类型），详情面板也用它来标识
 * 「我现在看的是整个这一类」（用户 2026-11：点类型名看该类型的全部流水）。
 */
export const TYPE_LABEL = {
  收入类: '收入', 负债类: '负债', 权益类: '权益',
  资产类: '资产', 费用类: '费用', 成本类: '成本',
};

/** 短名 → 类型全名；不是六类之一就返回空串 */
export function typeOfLabel(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  for (const [full, label] of Object.entries(TYPE_LABEL)) if (label === t) return full;
  return '';
}

/** 每类第 1 列的名称：分类视图用「分类」，节点视图用「节点」。 */
export const FIRST_COL = { category: '分类', node: '节点' };

/** 每类 4 列的表头（不含第 1 列） */
export const STAT_COLS = {
  收入类: ['期初累计', '本期收入', '本期退回', '期末累计'],
  负债类: ['期初余额', '本期新增', '本期偿还', '期末余额'],
  权益类: ['期初余额', '本期增加', '本期减少', '期末余额'],
  资产类: ['期初余额', '本期流入', '本期流出', '期末余额'],
  费用类: ['本期累计', '本期支出', '本期退回', '本期净出'],
  成本类: ['期初净值', '本期新增', '本期消耗', '期末净值'],
};

/** 四列的字段名（界面与合计都按这个顺序取） */
export const STAT_FIELDS = ['c1', 'c2', 'c3', 'c4'];

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** 全零的一份计数 */
function zeros() {
  return { c1: 0, c2: 0, c3: 0, c4: 0 };
}

function addInto(target, cell) {
  for (const k of STAT_FIELDS) target[k] = r2(target[k] + (cell[k] || 0));
  return target;
}

/** 有没有金额（全零的行不占位置） */
function hasValue(row) {
  return STAT_FIELDS.some((k) => Math.abs(Number(row[k]) || 0) >= 0.005);
}

/**
 * 一个账户（或一组账户的合计）在某一类下的 4 列数值。
 * @param {{periodIn?:number,periodOut?:number,historyIn?:number,historyOut?:number}} s accountSummary 的结果
 * @param {string} type 账户类型
 */
export function statCells(s, type) {
  const row = s || {};
  const periodIn = Number(row.periodIn) || 0;
  const periodOut = Number(row.periodOut) || 0;
  const historyIn = Number(row.historyIn) || 0;
  const historyOut = Number(row.historyOut) || 0;

  const debit = isDebitType(type);
  const begin = debit ? historyIn - historyOut : historyOut - historyIn;
  const add = debit ? periodIn : periodOut;
  const red = debit ? periodOut : periodIn;

  // 费用：第 1 列是「到本期结束」的累计净支出（= 资产的期末），
  // 第 4 列只报本期净发生额 —— 不把第 1 列并进去，所以费用没有期末。
  if (type === '费用类') {
    return {
      c1: r2((historyIn + periodIn) - (historyOut + periodOut)),
      c2: r2(periodIn),
      c3: r2(periodOut),
      c4: r2(periodIn - periodOut),
    };
  }

  return {
    c1: r2(begin),
    c2: r2(add),
    c3: r2(red),
    c4: r2(begin + add - red),
  };
}

/**
 * 把一个账户列表按「类型 → key」聚合成六类小表的数据。
 *
 * @param {Array} accounts
 * @param {Array} transactions
 * @param {{start?:string,end?:string}} range
 * @param {(acc:object)=>string} keyOf 第一列的取值（分类名 / 节点名）
 * @returns {Array<{type:string,total:object,rows:Array<{key:string,count:number}&object>}>}
 */
function groupBy(accounts, transactions, range, keyOf) {
  const byType = new Map();

  for (const acc of accounts || []) {
    if (!acc || acc.isHidden) continue;
    const type = String(acc.type || '').trim() || '其它';
    const s = accountSummary(acc, transactions, range);
    const cell = statCells(s, type);

    if (!byType.has(type)) {
      byType.set(type, { type, total: zeros(), map: new Map() });
    }
    const g = byType.get(type);
    addInto(g.total, cell);

    const key = String(keyOf(acc) || '').trim() || '未分类';
    if (!g.map.has(key)) g.map.set(key, { key, count: 0, ...zeros() });
    const row = g.map.get(key);
    row.count += 1;
    addInto(row, cell);
  }

  const out = [];
  const emit = (type, g) => {
    const rows = [...g.map.values()]
      .filter(hasValue)
      .sort((a, b) => (Math.abs(b.c4) - Math.abs(a.c4)) || a.key.localeCompare(b.key, 'zh'));
    // 整类都是 0 的不占一张表：统计只看「有金额」的，空壳留给别处
    if (!rows.length) return;
    out.push({ type, total: g.total, rows });
  };

  for (const type of STAT_ORDER) {
    const g = byType.get(type);
    if (g) { emit(type, g); byType.delete(type); }
  }
  // 兜底：六类之外的脏数据也别吞掉
  for (const g of byType.values()) emit(g.type, g);
  return out;
}

/** 分类汇总：第一列 = 统计分类 */
export function categoryStats(accounts, transactions, range) {
  return groupBy(accounts, transactions, range, (acc) => acc.category || '未分类');
}

/** 节点汇总：第一列 = 节点名称 */
export function nodeStats(accounts, transactions, range) {
  return groupBy(accounts, transactions, range, (acc) => acc.name || acc.code || '未命名');
}
