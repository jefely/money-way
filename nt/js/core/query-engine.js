// 界面：（无界面）查询引擎
/**
 * 流水查询（纯函数）
 * 层：第一层 · 数据基座
 *
 * 查询页的三段表（A/B/C）共用这一份过滤逻辑，条件互相独立：
 *   日期起止 / 转出 / 转入 / 金额 / 备注
 *
 * 转出与转入按「账户显示名 **或简码**」做不区分大小写的匹配；
 * 账户由调用方通过 accOf(id) 传入（也可以继续传 labelOf(id)→字符串，那时只有全名可比）。
 * 本文件不读 state、不碰 DOM。
 */

/**
 * 一个账户是否命中账户列的查询串。
 *
 * 单文件版就是这么筛的：全名包含，或者简码（不区分大小写）相等/包含。
 * 只比全名的话，用户在「转出」里打简码（XJ、ZHC）永远筛出 0 行，
 * 看起来就是「筛选没实现」。
 *
 * @param {{name?:string, code?:string}|null} acc
 * @param {string} q
 */
export function matchAccount(acc, q) {
  const query = String(q == null ? '' : q).trim();
  if (!query) return true;
  if (!acc) return false;

  const name = String(acc.name || '');
  const code = String(acc.code || '').toUpperCase();
  const upper = query.toUpperCase();

  if (name.includes(query)) return true;
  if (!code) return false;
  return code === upper || code.includes(upper);
}

/**
 * 查询串 **精确** 命中哪个账户（名字全等，或简码全等、不区分大小写）。
 *
 * 只做精确匹配，不做片段：查询页的「转出 / 转入」输入框要用它把简码
 * 自动换成节点名字，片段匹配会让用户打「招」就被替换成「招行储」，
 * 反而没法再用短词做模糊搜索。
 *
 * @param {Array<{id:string,name?:string,code?:string}>} accounts
 * @param {string} q
 * @returns {object|null} 命中的账户，没有 / 不唯一都是 null
 */
export function exactAccount(accounts, q) {
  const s = String(q == null ? '' : q).trim();
  if (!s) return null;
  const upper = s.toUpperCase();

  const hits = (accounts || []).filter((a) => {
    if (!a) return false;
    if (String(a.name || '') === s) return true;
    const code = String(a.code || '').toUpperCase();
    return !!code && code === upper;
  });
  return hits.length === 1 ? hits[0] : null;
}

/**
 * @param {Array<{from_id:string,to_id:string,amount:number,date:string,note:string}>} transactions
 * @param {{dateFrom?:string,dateTo?:string,from?:string,to?:string,node?:string,amount?:string|number,note?:string}} cond
 * @param {(id:string)=>object|string} accOf 账户 ID → 账户对象（或旧的「显示名」字符串）
 * @returns {Array} 命中的流水（按日期升序；同日保持原顺序）
 */
export function filterTransactions(transactions, cond, accOf) {
  const c = cond || {};
  const lookup = typeof accOf === 'function' ? accOf : () => null;

  // 兼容两种调用：给账户对象就按 name+code 比，给字符串就只按名字比
  const accFor = (id) => {
    if (!id) return null;
    const r = lookup(id);
    if (r && typeof r === 'object') return r;
    return { name: String(r == null ? '' : r) };
  };

  const dateFrom = String(c.dateFrom || '').trim();
  const dateTo = String(c.dateTo || '').trim();
  const from = String(c.from || '').trim();
  const to = String(c.to || '').trim();
  // node = 「这个节点的转出 **或** 转入」：查询页在转出/转入填了同一节点时用它，
  // 否则两栏都是「与」，同一节点会筛出 0 行。
  const node = String(c.node || '').trim();
  const note = String(c.note || '').trim().toLowerCase();

  let amount = null;
  if (c.amount !== '' && c.amount != null) {
    const n = Number(String(c.amount).replace(/[¥,\s]/g, ''));
    if (Number.isFinite(n)) amount = n;
  }

  const hits = [];
  for (const t of transactions || []) {
    const d = String((t && t.date) || '');
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;

    const amt = Number((t && t.amount) || 0);
    if (amount != null && Math.abs(amt - amount) > 0.005) continue;

    if (note && !String((t && t.note) || '').toLowerCase().includes(note)) continue;

    if (from && !matchAccount(accFor(t && t.from_id), from)) continue;
    if (to && !matchAccount(accFor(t && t.to_id), to)) continue;

    if (node) {
      const a = accFor(t && t.from_id);
      const b = accFor(t && t.to_id);
      if (!matchAccount(a, node) && !matchAccount(b, node)) continue;
    }

    hits.push(t);
  }

  // 查询结果按时间顺序（早 → 晚）。流水原始顺序是录入顺序，
  // 同一个节点「转出 + 转入」合在一起看时，录入顺序看着是乱的。
  hits.sort((a, b) => String((a && a.date) || '').localeCompare(String((b && b.date) || '')));
  return hits;
}

/** 查询结果小计：笔数 + 合计金额。 */
export function queryTotals(list) {
  let count = 0;
  let sum = 0;
  for (const t of list || []) {
    sum += Number((t && t.amount) || 0);
    count += 1;
  }
  return { count, sum };
}
