// 界面：路径 tab → 追踪链诊断（页脚序号串 + ?debug=1 时的控制台明细）
/**
 * 追踪链诊断（UI 层，只读）。
 *
 * 页脚那串「序号 [-3,-1,0]」是给用户看的：**缺哪一层一眼可见**。
 * `?debug=1` 时再把每一笔的日期/两端/金额打到控制台，
 * 用来定位「某笔为什么没进链」——是没匹配上节点，还是根本没进 data.txs。
 */

/**
 * 页脚后缀：链上真实出现的序号，去重升序。
 * @param {Map<number,number>} steps 流水下标 → 序号
 */
export function traceSeqText(steps) {
  if (!steps || typeof steps.values !== 'function') return '';
  const seqs = [...new Set(steps.values())].sort((a, b) => a - b);
  return seqs.length ? ` · 序号 [${seqs.join(',')}]` : '';
}

/**
 * 把链的明细打到控制台（只在调用方确认 debug 打开时调用）。
 * @param {Array} txs 图的流水
 * @param {Map<number,number>} steps 流水下标 → 序号
 * @param {(id:string)=>string} nameOf 账户名
 */
export function logTraceChain(txs, steps, nameOf) {
  if (typeof console === 'undefined' || !console.table) return;
  const list = txs || [];
  const map = steps || new Map();
  const rows = list.map((t, i) => ({
    序号: map.has(i) ? map.get(i) : '',
    日期: t && t.date,
    转出: nameOf ? nameOf(t && t.from_id) : '',
    转入: nameOf ? nameOf(t && t.to_id) : '',
    金额: t && t.amount,
  })).filter((r) => r.序号 !== '');
  console.table(rows);
}
