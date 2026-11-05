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
    screen: 'flow',
    // 默认铺满容器（列宽按比例放大），拖过之后整表按 px 固定。
    // 这样：没调过的人看到的还是满屏表格；调过的人重开也还是自己那套宽度。
    fill: true,
    cols: ['seq', 'date', 'from', 'to', 'amount', 'note', 'fixed', 'action'],
  },
  // 统计页的「6 大分类」各一张表（2026-11）：费用 / 收入 / 资产 / 负债 / 权益 / 成本
  // 从上到下顺着排，有内容才列。每张表**各有一套列宽**（拖「资产」不影响「负债」）。
  //
  // fill = 参数等于默认值时走默认布局，拖过之后按 px（见 ui/apply-settings 的 syncColModes）。
  // noSize = 不参与每表行高/字号那 4 项参数（它们共用 .nt-table-stat 的尺寸）。
  // noLegacy = 不参与旧存档「默认列宽」的按列名迁移（会盖掉下面给的默认值）。
  fee: {
    label: '分类-费用',
    screen: 'stats',
    fill: true,
    noSize: true,
    noLegacy: true,
    cols: ['cat', 'gross', 'reverse', 'net'],
  },
  income: {
    label: '分类-收入',
    screen: 'stats',
    fill: true,
    noSize: true,
    noLegacy: true,
    cols: ['cat', 'gross', 'reverse', 'net'],
  },
  asset: {
    label: '分类-资产',
    screen: 'stats',
    fill: true,
    noSize: true,
    noLegacy: true,
    cols: ['cat', 'opening', 'increase', 'decrease', 'end'],
  },
  liability: {
    label: '分类-负债',
    screen: 'stats',
    fill: true,
    noSize: true,
    noLegacy: true,
    cols: ['cat', 'opening', 'increase', 'decrease', 'end'],
  },
  equity: {
    label: '分类-权益',
    screen: 'stats',
    fill: true,
    noSize: true,
    noLegacy: true,
    cols: ['cat', 'opening', 'increase', 'decrease', 'end'],
  },
  cost: {
    label: '分类-成本',
    screen: 'stats',
    fill: true,
    noSize: true,
    noLegacy: true,
    cols: ['cat', 'gross', 'reverse', 'net'],
  },
  catq: {
    label: '分类查询',
    screen: 'stats',
    growByWidth: true,
    cols: ['date', 'from', 'to', 'amount', 'note'],
  },
  sum: {
    label: '汇总表',
    screen: 'stats',
    // 2026-11：去掉「类型」列（类型变成分组标签），「当前余额」改「本期余额」，
    // 末尾补「期初余额」。
    cols: ['name', 'seq', 'cat', 'out', 'iin', 'balance', 'histOut', 'histIn', 'histBalance', 'opening'],
  },
  query: {
    label: '流水查询',
    screen: 'query',
    cols: ['seq', 'date', 'from', 'to', 'amount', 'note'],
    autoValue: 'auto',
  },
  path: {
    label: '路径追踪',
    screen: 'path',
    cols: ['seq', 'date', 'from', 'to', 'amount', 'note'],
    // 路径侧栏的列宽**必须是固定 px**：
    // 用 1fr / minmax 时 grid 的列宽和会被容器压到比内容窄，而数据行的长文本
    // 又会把滚动宽度撑大 —— 两者宽度不同，横滚到右边时表头整块移出视口
    //（用户看到「转入账户之后的标题行没颜色、备注也滑不出来」）。
    // noAuto：存档里遗留的 0（旧版 1fr）在 parseTableWidths 里落回该表默认值。
    noAuto: true,
  },
  plan: {
    label: '固定开支',
    screen: 'plan',
    cols: ['seq', 'freq', 'day', 'from', 'to', 'amount', 'note', 'action'],
  },
  accounts: {
    label: '账户设置',
    screen: 'settings',
    cols: ['code', 'seq', 'type', 'cat', 'name', 'opening', 'billDay', 'repayDay', 'up', 'action'],
  },
};

/**
 * 表名 → 界面屏。面板顶部 7 个 tab（主界面/流水/统计/查询/路径/固定/设置）
 * 和这 7 张表一一对应 —— 「每个功能表一页」就是靠这张映射成立的。
 * 表名与 screen 写在一起，改 label 时不会漏掉映射。
 */
export const TABLE_SCREENS = Object.fromEntries(
  Object.values(TABLE_COLS).map((t) => [t.label, t.screen]),
);

/**
 * 每张表的默认列宽（下标与 TABLE_COLS 一一对应；0 = 自适应）
 *
 * 这组值来自用户 2026-10 在 ?debug=1 面板里逐表调好、导出「当前参数」后确认的。
 * 改动前请先确认列数没变 —— 数组长度必须等于 TABLE_COLS[表].cols.length。
 */
export const TABLE_DEFAULT_WIDTHS = {
  // 备注从 116 加到 160（用户 2026-11：备注常被截断）
  flow: '44,84,112,112,96,160,40,40',
  // 6 大分类：没有序号列（手机放不下），列 = 分类 | 金额…；存量 5 列、流量 4 列
  fee: '62,102,111,111',
  income: '62,102,111,111',
  cost: '62,102,111,111',
  asset: '75,105,105,105,105',
  liability: '75,105,105,105,105',
  equity: '75,105,105,105,105',
  // 分类查询仍是 0 = 交给 CSS 百分比铺满
  catq: '0,0,0,0,0',
  // 节点名称 | 序号 | 分类 | 转出 | 转入 | 本期余额 | 历史转出 | 历史转入 | 历史结余 | 期初余额
  sum: '110,44,72,84,84,100,90,90,96,96',
  query: '44,0,0,0,0,0',
  path: '44,62,110,110,68,120',
  plan: '44,64,64,112,112,96,116,40',
  accounts: '64,44,72,76,110,96,56,56,40,40',
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
    // noAuto 的表（路径追踪）不接受 0 = 自适应：grid 的自适应列算出来的
    // 列宽和与数据行实际宽度对不上，横滚时表头和数据行会各走各的。
    if (n === 0 && t.noAuto) return fallback;
    return n;
  });
}

/** 参数键 → 「标签/列宽」，例如 flow → 流水记录/列宽 */
export function colWidthKey(table) {
  const t = TABLE_COLS[table];
  return (t ? t.label : table) + '/列宽';
}

/**
 * 每张表一套的「尺寸」参数：列标行与数据区的行高 / 字号。
 *
 * 为什么从全局拆出来：行高 32 在流水表里刚好，在统计表（10 列、字更密）
 * 和校验页（卡片）里就不合适。以前只有一份 `--nt-row-h`，调一张动七张。
 * 拆开之后「这张表长什么样」是它自己的事，和列宽是同一个层级的概念。
 *
 * def 与面板上的 4 个全局默认一致（26 / 12 / 32 / 14）——
 * 旧存档迁移靠这个对齐，见 core/settings.js 的 LEGACY_SIZE。
 */
export const TABLE_SIZE_FIELDS = [
  { field: 'thH', suffix: '列标行高', cssVar: '--nt-th-h-', def: 26, min: 12, max: 80 },
  { field: 'thFont', suffix: '列标字号', cssVar: '--nt-th-font-', def: 12, min: 6, max: 30 },
  { field: 'rowH', suffix: '数据行高', cssVar: '--nt-row-h-', def: 32, min: 16, max: 120 },
  { field: 'cellFont', suffix: '数据字号', cssVar: '--nt-cell-font-', def: 14, min: 6, max: 40 },
];

/**
 * 展开成 28 条 SCHEMA（7 张表 × 4 项）。
 * group 用表名，于是面板上「每个功能表一页」是自动成立的 ——
 * 只要把表名登记进 GROUPS / GROUP_SCREEN 就够了。
 */
/**
 * 参与「每表一套尺寸」的表。
 *
 * 路径追踪表被排除：它是 div + grid，行高/字号写死在 path.css 里，
 * 侧边栏本来就没有这两个旋钮。2026-10 试过把它接进来 —— 默认 32px 的
 * 数据行高把侧边栏每行从 ~24px 撑高，用户当场退回（「1.44 才对」）。
 * 它只有列宽（--nt-col-path-*）。
 */
const SIZE_TABLES = Object.keys(TABLE_COLS)
  .filter((t) => t !== 'path' && !TABLE_COLS[t].noSize);

export const TABLE_SIZE_SCHEMA = SIZE_TABLES.flatMap((table) =>
  TABLE_SIZE_FIELDS.map((f) => ({
    key: TABLE_COLS[table].label + '/' + f.suffix,
    type: 'tableSize',
    table,
    field: f.field,
    group: TABLE_COLS[table].label,
    def: f.def,
    min: f.min,
    max: f.max,
    cssVar: f.cssVar + table,
  })));

/** 面板上的 7 个表组（顺序 = TABLE_COLS 的顺序；路径追踪那组只有列宽一项） */
export const TABLE_GROUPS = Object.values(TABLE_COLS).map((t) => t.label);
