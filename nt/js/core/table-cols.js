// 界面：（无界面）每张表各自的列与默认列宽
/**
 * 表列定义
 * 层：第一层 · 数据基座（纯数据，零依赖）
 *
 * 为什么单独一个文件：
 *   列宽原来是**一份**（按列名存），7 张表共用 —— 同一个 amount 在流水 / 查询 /
 *   固定 / 路径里是同一个宽度，调一张动四张。拆成每表一份之后，
 *   这张表本身就成了参数系统的一等公民，放在 core/settings.js 里会把那个文件顶过 300 行。
 *
 * 约定：
 *   · cols 的顺序 = 界面上从左到右的列顺序
 *   · 宽度里 0 表示自适应（query 用 auto，path 的 grid 用 1fr，见 autoValue）
 */

/** 每张表：显示名 + 列顺序 + 自适应列的写法 */
export const TABLE_COLS = {
  flow: {
    label: '流水记录',
    cols: ['seq', 'date', 'from', 'to', 'amount', 'note', 'fixed', 'action'],
  },
  cat: {
    label: '分类统计',
    cols: ['seq', 'cat', 'out', 'iin', 'balance', 'histOut', 'histIn', 'histBalance'],
  },
  sum: {
    label: '汇总表',
    cols: ['name', 'seq', 'type', 'cat', 'out', 'iin', 'balance', 'histOut', 'histIn', 'histBalance'],
  },
  query: {
    label: '流水查询',
    cols: ['seq', 'date', 'from', 'to', 'amount', 'note'],
    autoValue: 'auto',
  },
  path: {
    label: '路径追踪',
    cols: ['seq', 'date', 'from', 'to', 'amount', 'note'],
    autoValue: '1fr',
  },
  plan: {
    label: '固定开支',
    cols: ['seq', 'freq', 'day', 'from', 'to', 'amount', 'note', 'action'],
  },
  accounts: {
    label: '账户设置',
    cols: ['code', 'seq', 'type', 'cat', 'name', 'opening', 'billDay', 'repayDay', 'up', 'action'],
  },
};

/** 每张表的默认列宽（下标与 TABLE_COLS 一一对应；0 = 自适应） */
export const TABLE_DEFAULT_WIDTHS = {
  flow: '54,84,112,112,92,116,48,40',
  cat: '54,96,84,84,96,84,84,96',
  sum: '120,54,66,70,84,84,96,84,84,96',
  query: '26,58,62,62,56,0',
  path: '28,62,0,0,68,0',
  plan: '54,64,84,110,110,92,110,40',
  accounts: '64,44,66,70,110,80,56,56,40,40',
};

/**
 * 某张表的列宽 → 数值数组（长度固定 = 该表列数；0 表示自适应）
 *
 * 空串（缺位）和 0 是两件事：空 = 没配过，用该表默认；0 = 明确要自适应。
 */
export function parseTableWidths(text, table) {
  const t = TABLE_COLS[table];
  if (!t) return [];

  const def = String(TABLE_DEFAULT_WIDTHS[table] || '').split(',').map((x) => Number(x.trim()));
  const arr = String(text || '').split(',');

  return t.cols.map((_, i) => {
    const raw = String(arr[i] == null ? '' : arr[i]).trim();
    const fallback = Number.isFinite(def[i]) ? def[i] : 0;
    if (raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
  });
}

/** 参数键 → 「标签/列宽」，例如 flow → 流水记录/列宽 */
export function colWidthKey(table) {
  const t = TABLE_COLS[table];
  return (t ? t.label : table) + '/列宽';
}
