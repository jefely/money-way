/**
 * 流水查询（纯函数）
 * 层：第一层 · 数据基座
 *
 * 查询页的三段表（A/B/C）共用这一份过滤逻辑，条件互相独立：
 *   日期起止 / 转出 / 转入 / 金额 / 备注
 *
 * 转出与转入按「账户显示名」做不区分大小写的包含匹配；
 * 显示名由调用方通过 labelOf(id) 传入，本文件不读 state、不碰 DOM。
 */

/**
 * @param {Array<{from_id:string,to_id:string,amount:number,date:string,note:string}>} transactions
 * @param {{dateFrom?:string,dateTo?:string,from?:string,to?:string,amount?:string|number,note?:string}} cond
 * @param {(id:string)=>string} labelOf 账户 ID → 显示名
 * @returns {Array} 命中的流水（保持原顺序）
 */
export function filterTransactions(transactions, cond, labelOf) {
  const c = cond || {};
  const label = typeof labelOf === 'function' ? labelOf : () => '';

  const dateFrom = String(c.dateFrom || '').trim();
  const dateTo = String(c.dateTo || '').trim();
  const from = String(c.from || '').trim().toLowerCase();
  const to = String(c.to || '').trim().toLowerCase();
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

    if (from && !String(label((t && t.from_id) || '')).toLowerCase().includes(from)) continue;
    if (to && !String(label((t && t.to_id) || '')).toLowerCase().includes(to)) continue;

    hits.push(t);
  }
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
