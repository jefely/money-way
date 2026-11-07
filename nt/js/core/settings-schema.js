// 界面：（无界面）界面参数 SCHEMA 与分组
/**
 * 界面参数的声明表（分组 / 屏幕 / 作用域 / 每一项的 key 与默认值）
 * 层：第一层 · 数据基座（纯数据，零依赖，不碰 DOM）
 *
 * 为什么要从 core/settings.js 拆出来：
 *   那边负责「怎么读、怎么归一化、怎么变 CSS 变量」，这里是「有哪些参数」。
 *   参数表本身快 300 行了（9 张表 × 5 项 + 环图 30 项），
 *   和解析逻辑挤在一个文件里必然顶破公约的行数上限。
 *
 * 主题：1=浅色 2=深色 3=备选1 4=备选2，每个主题一套默认值（见 settings.js 的 THEME_DEFAULTS）。
 * 每项：key、group、def、unit、cssVar / type / attr / options / values。
 */

import { MW_GROUPS, MW_SCHEMA } from './mw-settings.js';
import {
  TABLE_GROUPS, TABLE_SCREENS, TABLE_SIZE_SCHEMA, TABLE_DEFAULT_WIDTHS,
} from './table-cols.js';

/**
 * 每个参数分组 → 负责它的代码文件（2026-11 用户要求）。
 * 调试面板在分组标题右边用小字显示，方便「这个参数调的是哪个文件」。
 * 组级标注：一个组通常只改一处（CSS 变量表 / 渲染器 / 某个视图）。
 */
export const GROUP_FILE = {
  标签栏: 'css/theme.css',
  按钮区: 'css/shell.css',
  表格: 'css/theme.css',
  信息栏: 'css/shell.css',
  按钮尺寸: 'css/shell.css',
  列标行: 'css/shell.css',
  // 每张表一组：尺寸变量在 shell.css，列宽默认值在 core/table-cols.js
  流水记录: 'css/flow.css',
  '分类-费用': 'css/stats.css',
  '分类-收入': 'css/stats.css',
  '分类-资产': 'css/stats.css',
  '分类-负债': 'css/stats.css',
  '分类-权益': 'css/stats.css',
  '分类-成本': 'css/stats.css',
  分类查询: 'css/stats.css',
  '分类列表': 'css/stats.css',
  节点汇总: 'css/stats.css',
  // 六张分类表 + 节点表的第 1 列宽度与字号（节点表另有一个宽度参数）
  分类统计: 'css/stats.css',
  节点统计: 'css/stats.css',
  流水查询: 'css/query.css',
  路径追踪: 'css/path.css',
  固定开支: 'css/plan.css',
  账户设置: 'css/settings.css',
  // 环图：几何/标签/线都由 SVG 渲染器消费，追踪和分层在 graph/ 里算
  '环图·几何': 'ui/mw-svg-renderer.js',
  '环图·标签': 'ui/mw-svg-renderer.js',
  '环图·线': 'ui/mw-svg-renderer.js',
  '环图·追踪': 'graph/path-tracer.js',
  '环图·规则': 'graph/mw-layers.js',
};

export const GROUPS = [
  '标签栏', '按钮区', '表格', '信息栏', '按钮尺寸', '列标行',
  // 每张表一组（列标行高/字号 + 数据行高/字号 + 列宽）
  ...TABLE_GROUPS,
  // 七张统计小表共用的字号：它们不参与「每表一套尺寸」（noSize），
  // 但低分辨率手机上需要整体放大，所以单独给一组。
  '分类统计',
  '节点统计',
  // 环图那 30 项（路径页）单独四组：它们是「基准单位」，由 SVG 渲染器消费，
  // 和上面这些 --nt-col-* 的 CSS 消费方不是一回事。见 core/mw-settings.js。
  ...MW_GROUPS,
];

/** 调试面板的界面标签：与顶部 7 个 tab 一一对应 */
export const SCREENS = [
  { id: 'main', label: '主界面' },
  { id: 'flow', label: '流水' },
  { id: 'stats', label: '统计' },
  { id: 'query', label: '查询' },
  { id: 'path', label: '路径' },
  { id: 'plan', label: '固定' },
  { id: 'settings', label: '设置' },
];

/** 分组归属的界面标签：main=公共参数，flow=流水页参数 */
export const GROUP_SCREEN = {
  标签栏: 'main',
  按钮区: 'main',
  表格: 'main',
  信息栏: 'main',
  // 这三组原来归 'flow' 屏幕，打开面板要先切到「流水」才看得到，
  // 用户以为「布局功能没了」。它们在主界面也要调，改归 main。
  按钮尺寸: 'main',
  列标行: 'main',
  // 每张表各归自己的页：流水记录→流水、统计三块+汇总表→统计、…
  ...TABLE_SCREENS,
  // 统计小表共用的字号归「统计」屏（在统计页才看得出效果）
  分类统计: 'stats',
  节点统计: 'stats',
  // 环图参数只在路径页看得见效果，所以归「路径」屏，不和主界面挤在一起
  ...Object.fromEntries(MW_GROUPS.map((g) => [g, 'path'])),
};

/** 参数作用域：global=写全局(:root)；其余=写到对应标签页容器 [data-view] */
export const GROUP_SCOPE = {
  标签栏: 'global',
  按钮区: 'global',
  表格: 'global',
  信息栏: 'global',
  // 这三个原本是 'flow'（只作用于流水页）。但 7 个页面都有表头和按钮区，
  // 标成 flow 会让「列标行字号 / 按钮尺寸字号 / 数据区字号」在别的页面不起作用，
  // 面板上看着就是「怎么调都控制不到」。全部改 global。
  按钮尺寸: 'global',
  列标行: 'global',
  // 每表尺寸/列宽都是全局变量（--nt-row-h-flow 这种），靠 CSS 的
  // `.nt-table-flow .nt-cell` 这类选择器落到具体表上，所以作用域写 :root。
  ...Object.fromEntries(TABLE_GROUPS.map((g) => [g, 'global'])),
  // 统计小表的字号也写 :root：CSS 在 stats.css 里用 .nt-table-stat 消费，
  // 不依赖统计页容器是否已经渲染（切 tab 时变量已经在）。
  分类统计: 'global',
  节点统计: 'global',
  // 环图参数写在 :root 上：渲染器从 getComputedStyle(documentElement) 读，
  // 不依赖路径页容器是否存在（切 tab / 未解锁时读到的也是同一份值）。
  ...Object.fromEntries(MW_GROUPS.map((g) => [g, 'global'])),
};

/**
 * 列宽/对齐数组的列顺序（对应 colgroup 的 .nt-c-*）
 *
 * ⚠️ 顺序**只能在末尾追加**：用户拖过的列宽是以逗号数组存在存档里的，
 * 按下标对应这张表。往中间插一项 = 所有人的列宽整体错位。
 *
 * 2026-10 追加了 from/to/note/out/iin/fixed/histBalance/up：
 * 之前这些列不在表里，拖它们的手柄会被 onColResize 的 indexOf 判成 -1 直接返回
 * —— 表现就是「流水表的转出/转入/备注拖不动」。
 */
export const COL_KEYS = [
  'seq', 'date', 'type', 'cat', 'code', 'num', 'amount', 'action', 'state', 'freq',
  'day', 'name', 'balance', 'opening', 'histOut', 'histIn', 'periods', 'principal',
  // ↓ 2026-10 追加（不要往上面插）
  'from', 'to', 'note', 'out', 'iin', 'fixed', 'histBalance', 'up',
  // ↓ 2026-10 第二次追加：账户表的账单日/还款日 + 分期表的三列。
  //   shell.css 早就写好了这 5 条对齐规则，但 COL_KEYS 里没有对应的键，
  //   于是 toCssList 从不输出 --nt-th-align-billDay 这些变量 ——
  //   「账单日那一列的对齐调不动」就是这么来的（调了没反应）。
  'billDay', 'repayDay', 'interest', 'per', 'firstMonth',
];

// 顺序与 COL_KEYS 一一对应（末尾 5 项是 2026-10 第二次追加的列）
export const DEFAULT_COL_WIDTHS = '44,84,72,76,64,100,96,40,64,64,64,110,100,96,90,90,64,96,'
  + '112,112,116,84,84,48,96,40,56,56,84,64,84';
// 列标题对齐：**所有表头一律居中**（用户 2026-10-29 指定）。
// 以前 balance / histOut 两列是「右」；这里作为新默认全给「中」。
export const DEFAULT_COL_ALIGN = '中,中,中,中,中,中,中,中,中,中,中,中,中,中,中,中,中,中,'
  + '中,中,中,中,中,中,中,中,中,中,中,中,中';

/** 旧默认（balance 与 histOut 两列右对齐）—— 只用于迁移判断 */
export const OLD_COL_ALIGN = DEFAULT_COL_ALIGN.split(',')
  .map((x, i) => ((i === 12 || i === 14) ? '右' : x)).join(',');

export const SCHEMA = [
  /* ---------- 标签栏（公共） ---------- */
  { key: '标签栏行高', group: '标签栏', def: 40, unit: 'px', cssVar: '--nt-tabs-h' },
  { key: '标签栏字号', group: '标签栏', def: 13, unit: 'px', cssVar: '--nt-tab-font' },
  // 文字整体**向下**偏移（px，0~20）。默认 2px 是「看上去正好居中」的位置。
  // 不支持负数：实现用的是 padding-top，负 padding 不合法。
  { key: '标签栏文字偏移', group: '标签栏', def: 2, unit: 'px', cssVar: '--nt-tab-shift' },
  { key: '标签栏文字颜色', group: '标签栏', def: '#b9b2d0', cssVar: '--nt-tabs-color' },
  { key: '标签栏背景颜色', group: '标签栏', def: '#0e0b16', cssVar: '--nt-tabs-bg' },
  { key: '标签栏行背景色', group: '标签栏', def: '#0e0b16', cssVar: '--nt-tab-bg' },
  { key: '标签栏边框', group: '标签栏', type: 'enum', options: ['按钮框', '竖线', '直角框', '无边框'], values: ['solid', 'line', 'sharp', 'plain'], def: '按钮框', attr: 'data-tabs-border' },
  { key: '标签栏边框颜色', group: '标签栏', def: '#2a2438', cssVar: '--nt-tabs-border' },

  /* ---------- 按钮区（公共） ---------- */
  { key: '按钮区文字颜色', group: '按钮区', def: '#f2eeff', cssVar: '--nt-btn-text' },
  { key: '按钮区按钮样式', group: '按钮区', type: 'enum', options: ['无', '圆角框', '直角框', '竖线'], values: ['plain', 'solid', 'sharp', 'line'], def: '圆角框', attr: 'data-btn-style' },
  { key: '按钮区间距', group: '按钮区', def: 6, unit: 'px', cssVar: '--nt-btn-gap' },
  // 按钮行高度：工具条 / 查询面板头 / 分类查询头 / 路径侧栏头**统一**读这一个值
  // （2026-11 用户要求「所有按钮行用统计页那个高度」）。
  // 从「按钮尺寸」组挪过来：它改的是整行，不是按钮本身。
  // 高度 36 = 统计页那条（带「分类/汇总」胶囊）的真实高度：
  // 胶囊本身 34，把工具条撑到 36。统一成 36 后流水/设置页不再比它窄一截。
  { key: '按钮区高度', group: '按钮区', def: 36, min: 20, max: 80, unit: 'px', cssVar: '--nt-vbar-h' },
  // 工具条按钮的最小宽度：0 = 按内容（默认）。调大能让「添加/导入/重载」对齐成等宽。
  { key: '工具条按钮宽', group: '按钮区', def: 0, min: 0, max: 200, unit: 'px', cssVar: '--nt-btn-w' },
  { key: '按钮区背景颜色', group: '按钮区', def: '#0e0b16', cssVar: '--nt-vbar-bg' },
  { key: '按钮区行背景色', group: '按钮区', def: '#000000', cssVar: '--nt-btn-bg' },

  /* ---------- 表格（公共） ---------- */
  { key: '默认文字颜色', group: '表格', def: '#f2eeff', cssVar: '--nt-unit-text' },
  { key: '默认背景颜色', group: '表格', def: '#000000', cssVar: '--nt-unit-bg' },
  { key: '整行背景色', group: '表格', def: '#000000', cssVar: '--nt-unit-row-bg' },
  { key: '横向边框', group: '表格', type: 'enum', options: ['无', '虚线', '实线'], values: ['none', 'dashed', 'solid'], def: '实线', attr: 'data-border-h' },
  { key: '横向边框线粗', group: '表格', def: 1, unit: 'px', cssVar: '--nt-border-h-width' },
  { key: '横向边框颜色', group: '表格', def: '#2a2438', cssVar: '--nt-border-h-color' },
  { key: '纵向边框', group: '表格', type: 'enum', options: ['无', '虚线', '实线'], values: ['none', 'dashed', 'solid'], def: '实线', attr: 'data-border-v' },
  { key: '纵向边框线粗', group: '表格', def: 1, unit: 'px', cssVar: '--nt-border-v-width' },
  { key: '纵向边框颜色', group: '表格', def: '#2a2438', cssVar: '--nt-border-v-color' },
  // border-spacing：0 = 单元格紧贴（默认）。调大能看出「缝隙」，也方便排查边框错位。
  { key: '单元格间隙', group: '表格', def: 0, min: 0, max: 20, unit: 'px', cssVar: '--nt-cell-gap' },
  { key: '手柄颜色', group: '表格', def: '#8c82be', cssVar: '--nt-handle-color' },
  // 注：原「手柄位置」(--nt-handle-offset) 已删 —— 它没有任何 CSS 消费方。
  // 手柄必须完全落在列内（right:0），跨出去会让 closest('.nt-th') 拿到右边那列，
  // 表现就是「手柄时灵时不灵」（见 TABLE-INTERACTION.md）。这个值不该可调。

  /* ---------- 信息栏（公共） ---------- */
  { key: '信息栏行高', group: '信息栏', def: 28, unit: 'px', cssVar: '--nt-footer-h' },
  { key: '信息栏字号', group: '信息栏', def: 12, unit: 'px', cssVar: '--nt-footer-font' },
  { key: '信息栏文字颜色', group: '信息栏', def: '#b9b2d0', cssVar: '--nt-footer-color' },
  { key: '信息栏背景颜色', group: '信息栏', def: '#0e0b16', cssVar: '--nt-footer-bg' },

  /* ---------- 按钮尺寸（独立） ---------- */
  // 按钮本身的高度：工具条 / 查询面板头的按钮共用（2026-10-29 用户指定）
  { key: '按钮尺寸按钮高', group: '按钮尺寸', def: 26, min: 18, max: 60, unit: 'px', cssVar: '--nt-btn-h' },
  { key: '按钮尺寸字号', group: '按钮尺寸', def: 12, unit: 'px', cssVar: '--nt-vbar-font' },

  /* ---------- 列标行（全局只剩两件事） ----------
     行高与字号已经下放到每张表（见 TABLE_SIZE_SCHEMA）：
     统计表 10 列、流水表 8 列，同一个 32px 行高在两处观感不同。
     这里只留「对齐」和「手柄」—— 它们天生跨表一致。 */
  { key: '列标行对齐', group: '列标行', type: 'align', prefix: '--nt-th-align-', def: DEFAULT_COL_ALIGN },
  { key: '手柄宽度', group: '列标行', def: 14, unit: 'px', cssVar: '--nt-handle-w' },

  /* ---------- 每张表一套（每组 5 项） ----------
     列标行高/字号 + 数据行高/字号 + 列宽，全部由这张表自己决定。
     列宽 0 = 自适应（query 用 auto，统计三块表用 CSS 的百分比铺满）；
     拖动后整表切 .cols-custom 模式，见 ui/table-layout.js。
     想恢复默认列宽用面板底部的「恢复默认」。 */
  { key: '流水记录/列宽', group: '流水记录', type: 'cols', table: 'flow', def: TABLE_DEFAULT_WIDTHS.flow },
  // 统计页 6 大分类各一张表（2026-11）：每张表独立一套列宽
  { key: '分类列表/列宽', group: '分类列表', type: 'cols', table: 'catq', def: TABLE_DEFAULT_WIDTHS.catq },
  { key: '流水查询/列宽', group: '流水查询', type: 'cols', table: 'query', def: TABLE_DEFAULT_WIDTHS.query },
  { key: '路径追踪/列宽', group: '路径追踪', type: 'cols', table: 'path', def: TABLE_DEFAULT_WIDTHS.path },
  { key: '固定开支/列宽', group: '固定开支', type: 'cols', table: 'plan', def: TABLE_DEFAULT_WIDTHS.plan },
  { key: '账户设置/列宽', group: '账户设置', type: 'cols', table: 'accounts', def: TABLE_DEFAULT_WIDTHS.accounts },
  // 统计小表第 1 列（分类 / 节点）的宽度。**分类和节点各一个**（用户 2026-11）：
  // 节点名普遍比分类名长，共用一个默认值时不是分类列太宽、就是节点名被截断。
  // 同类的六张表共用自己那一个（不是各存一份再同步）。
  // 分类列宽默认 50：72 在手机上占掉太多横向空间，第一列只放「餐饮/交通」这种两字分类。
  // 只影响新存档；已有存档里存过的值不动，想改回默认用面板底部的「恢复默认」。
  { key: '分类统计/列宽', group: '分类统计', def: 50, unit: 'px', cssVar: '--nt-col-stat-cat', min: 40, max: 240 },
  { key: '节点统计/列宽', group: '节点统计', def: 108, unit: 'px', cssVar: '--nt-col-node-cat', min: 40, max: 300 },
  // 七张统计小表共用的字号：低分辨率手机上默认 14px 偏小，要能整体放大。
  // 它们不参与「每表一套尺寸」（TABLE_COLS 里 noSize），所以单独两项，
  // 走 toCssList 的通用分支就能写成 CSS 变量，不需要新类型。
  { key: '分类统计/列标字号', group: '分类统计', def: 12, unit: 'px', cssVar: '--nt-stat-head-font', min: 8, max: 24 },
  { key: '分类统计/数据字号', group: '分类统计', def: 14, unit: 'px', cssVar: '--nt-stat-font', min: 8, max: 28 },
  // 尺寸参数在 core/table-cols.js 里生成（8 表 × 4；路径表不参与）
  ...TABLE_SIZE_SCHEMA,

  /* ---------- 环图（路径页，四组） ----------
     30 项的声明在 core/mw-settings.js：面板、导出文本、存档都走同一份 SCHEMA，
     消费方是 ui/mw-params.js（读 --nt-mw-* → 数字），不是 CSS 规则。 */
  ...MW_SCHEMA,
];

/**
 * 改了默认值的项：老存档里如果**还留着旧默认**，就跟着新默认走。
 *
 * 为什么需要它：这些参数一律由 normalize 从存档读，存档里有值就不会用 def ——
 * 于是「把默认值改小」对已经打开过页面的人完全不生效，面板上还是旧数字。
 * 只在值**恰好等于旧默认**时才迁移，用户自己调过的其它值原样保留。
 */
export const LEGACY_DEFAULT = {
  环厚: { 80: 60 },        // v1.210：80 → 60
  追踪字号: { 52: 46 },    // v1.210：52 → 46
  // 2026-11：环外标签锥形，短尖 25、长尖 200（旧存档 46/115 迁到这两个值）
  锥形第一档: { 46: 25 },
  锥形第二档: { 115: 200 },
  // v1.244：命中区从 7 回到 14。透明手柄层已经去掉，命中区不再占列宽，
  // 14px 只让边缘更好按住，列标文字空间不受影响。
  手柄宽度: { 7: 14 },
};
