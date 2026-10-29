// 界面：（无界面）界面参数 SCHEMA + 主题默认值
/**
 * 界面参数（调试 + 布局配置共用）
 * 层：第一层 · 数据基座（纯数据，零依赖，不碰 DOM）
 *
 * 布局约定：
 *   公共（global，主界面）：标签栏 / 按钮区 / 表格 / 信息栏
 *   流水独立（flow）：按钮尺寸 / 列标行 / 数据区 / 列宽
 *
 * 主题：1=浅色 2=深色 3=备选1 4=备选2，每个主题一套默认值（THEME_DEFAULTS）。
 * 每项：key、group、def、unit、cssVar / type / attr / options / values。
 */

import { MW_GROUPS, MW_SCHEMA } from './mw-settings.js';
import { TABLE_GROUPS, TABLE_SCREENS, TABLE_SIZE_SCHEMA } from './table-cols.js';

export const GROUPS = [
  '标签栏', '按钮区', '表格', '信息栏', '按钮尺寸', '列标行',
  // 7 张表各一组（列标行高/字号 + 数据行高/字号 + 列宽）
  ...TABLE_GROUPS,
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
  // 7 张表各归自己的页：流水记录→流水、分类统计+汇总表→统计、…
  ...TABLE_SCREENS,
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
// 顺序与 COL_KEYS 一一对应（末尾 5 项是 2026-10 第二次追加的列）。
export const DEFAULT_COL_ALIGN = '中,中,中,中,中,中,中,中,中,中,中,中,中,中,中,中,中,中,'
  + '中,中,中,中,中,中,中,中,中,中,中,中,中';

// 旧默认（balance 与 histOut 两列右对齐）—— 只用于下面的迁移判断
const OLD_COL_ALIGN = DEFAULT_COL_ALIGN.split(',').map((x, i) => ((i === 12 || i === 14) ? '右' : x)).join(',');

/* ============================================================
   每张表各自的列与默认列宽
   ------------------------------------------------------------
   数据与解析都在 core/table-cols.js（这里只转发，保持既有 import 不变）。
   ============================================================ */

import {
  TABLE_COLS, TABLE_DEFAULT_WIDTHS, parseTableWidths, colWidthKey,
} from './table-cols.js';

export { TABLE_COLS, TABLE_DEFAULT_WIDTHS, parseTableWidths, colWidthKey };

/** 补到该表的列数：缺位用该表默认值（不能掉成 0/64，否则整列消失或变窄） */
function padTableWidths(text, table) {
  return parseTableWidths(text, table).join(',');
}

/** 主题 id 列表（与 theme-manager 的 VALID 一致） */
export const THEME_IDS = ['light', 'dark', 'alt1', 'alt2'];

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
  // 按钮区高度：工具条 min-height（各页共用这一个键）
  { key: '按钮尺寸行高', group: '按钮尺寸', def: 30, unit: 'px', cssVar: '--nt-vbar-h' },
  // 按钮本身的高度：工具条 / 查询面板头的按钮共用（2026-10-29 用户指定）
  { key: '按钮尺寸按钮高', group: '按钮尺寸', def: 26, min: 18, max: 60, unit: 'px', cssVar: '--nt-btn-h' },
  { key: '按钮尺寸字号', group: '按钮尺寸', def: 12, unit: 'px', cssVar: '--nt-vbar-font' },

  /* ---------- 列标行（全局只剩两件事） ----------
     行高与字号已经下放到每张表（见 TABLE_SIZE_SCHEMA）：
     统计表 10 列、流水表 8 列，同一个 32px 行高在两处观感不同。
     这里只留「对齐」和「手柄」—— 它们天生跨表一致。 */
  { key: '列标行对齐', group: '列标行', type: 'align', prefix: '--nt-th-align-', def: DEFAULT_COL_ALIGN },
  { key: '手柄宽度', group: '列标行', def: 14, unit: 'px', cssVar: '--nt-handle-w' },

  /* ---------- 每张表一套（7 组，每组 5 项） ----------
     列标行高/字号 + 数据行高/字号 + 列宽，全部由这张表自己决定。
     列宽 0 = 自适应（query 用 auto，path 的 grid 用 1fr）；
     拖动后整表切 .cols-custom 模式，见 ui/table-layout.js。
     想恢复默认列宽用面板底部的「恢复默认」。 */
  { key: '流水记录/列宽', group: '流水记录', type: 'cols', table: 'flow', def: TABLE_DEFAULT_WIDTHS.flow },
  { key: '分类统计/列宽', group: '分类统计', type: 'cols', table: 'cat', def: TABLE_DEFAULT_WIDTHS.cat },
  { key: '汇总表/列宽', group: '汇总表', type: 'cols', table: 'sum', def: TABLE_DEFAULT_WIDTHS.sum },
  { key: '流水查询/列宽', group: '流水查询', type: 'cols', table: 'query', def: TABLE_DEFAULT_WIDTHS.query },
  { key: '路径追踪/列宽', group: '路径追踪', type: 'cols', table: 'path', def: TABLE_DEFAULT_WIDTHS.path },
  { key: '固定开支/列宽', group: '固定开支', type: 'cols', table: 'plan', def: TABLE_DEFAULT_WIDTHS.plan },
  { key: '账户设置/列宽', group: '账户设置', type: 'cols', table: 'accounts', def: TABLE_DEFAULT_WIDTHS.accounts },
  // 28 项尺寸参数在 core/table-cols.js 里生成（7 表 × 4）
  ...TABLE_SIZE_SCHEMA,

  /* ---------- 环图（路径页，四组） ----------
     30 项的声明在 core/mw-settings.js：面板、导出文本、存档都走同一份 SCHEMA，
     消费方是 ui/mw-params.js（读 --nt-mw-* → 数字），不是 CSS 规则。 */
  ...MW_SCHEMA,
];

/**
 * 每表尺寸的旧值来源：2026-10 之前这四个是**全局**参数。
 * 用户调过的值（比如数据区行高 40）要能跟着迁移到 7 张表上。
 */
const LEGACY_SIZE = {
  thH: '列标行行高',
  thFont: '列标行字号',
  rowH: '数据区行高',
  cellFont: '数据区字号',
};

/** 尺寸/枚举类共用的默认值（四主题一致） */
const BASE = SCHEMA.reduce((acc, s) => {
  acc[s.key] = s.def;
  return acc;
}, {});

/** 颜色类默认值：每个主题一套 */
const THEME_COLORS = {
  light: {
    标签栏文字颜色: '#5f5878', 标签栏背景颜色: '#f8f7fd', 标签栏行背景色: '#f8f7fd', 标签栏边框颜色: '#e6e2f5',
    按钮区文字颜色: '#1b1430', 按钮区背景颜色: '#f8f7fd', 按钮区行背景色: '#ffffff',
    默认文字颜色: '#1b1430', 默认背景颜色: '#ffffff', 整行背景色: '#ffffff', 横向边框颜色: '#e6e2f5', 纵向边框颜色: '#e6e2f5',
    信息栏文字颜色: '#5f5878', 信息栏背景颜色: '#f8f7fd',
  },
  dark: {
    标签栏文字颜色: '#b9b2d0', 标签栏背景颜色: '#0e0b16', 标签栏行背景色: '#0e0b16', 标签栏边框颜色: '#2a2438',
    按钮区文字颜色: '#f2eeff', 按钮区背景颜色: '#0e0b16', 按钮区行背景色: '#000000',
    默认文字颜色: '#f2eeff', 默认背景颜色: '#000000', 整行背景色: '#000000', 横向边框颜色: '#2a2438', 纵向边框颜色: '#2a2438',
    信息栏文字颜色: '#b9b2d0', 信息栏背景颜色: '#0e0b16',
  },
  alt1: {
    标签栏文字颜色: '#6b5f48', 标签栏背景颜色: '#f3ece0', 标签栏行背景色: '#f3ece0', 标签栏边框颜色: '#e5dcc9',
    按钮区文字颜色: '#2a2418', 按钮区背景颜色: '#f3ece0', 按钮区行背景色: '#fffdf8',
    默认文字颜色: '#2a2418', 默认背景颜色: '#fffdf8', 整行背景色: '#fffdf8', 横向边框颜色: '#e5dcc9', 纵向边框颜色: '#e5dcc9',
    信息栏文字颜色: '#6b5f48', 信息栏背景颜色: '#f3ece0',
  },
  alt2: {
    标签栏文字颜色: '#9ec4ae', 标签栏背景颜色: '#0f1f18', 标签栏行背景色: '#0f1f18', 标签栏边框颜色: '#1e3328',
    按钮区文字颜色: '#e0f2e8', 按钮区背景颜色: '#0f1f18', 按钮区行背景色: '#0a1410',
    默认文字颜色: '#e0f2e8', 默认背景颜色: '#0a1410', 整行背景色: '#0a1410', 横向边框颜色: '#1e3328', 纵向边框颜色: '#1e3328',
    信息栏文字颜色: '#9ec4ae', 信息栏背景颜色: '#0f1f18',
  },
};

/** 每个主题一套完整默认值 */
export const THEME_DEFAULTS = THEME_IDS.reduce((acc, id) => {
  acc[id] = { ...BASE, ...THEME_COLORS[id] };
  return acc;
}, {});

/**
 * 归一化：px 项转数字，数组/对齐项保留逗号串，颜色项保留字符串；非法值落回该主题默认。
 * @param {object} raw
 * @param {string} [theme]
 * @returns {object} 完整设置
 */
export function normalize(raw, theme) {
  const out = { ...(THEME_DEFAULTS[theme] || THEME_DEFAULTS.dark) };
  for (const s of SCHEMA) {
    const v = raw ? raw[s.key] : undefined;

    // 列宽：每表一份。旧存档没有这些键时，从旧的那一份「默认列宽」里按列名抽初值。
    if (s.type === 'cols') {
      out[s.key] = padTableWidths(
        (v != null && v !== '') ? v : legacyFor(s.table, raw),
        s.table,
      );
      continue;
    }

    // 每表尺寸：旧存档只有一份全局值（数据区行高 / 列标行字号…），
    // 升级后每表一份 —— 缺位时把旧值抄过来，而不是掉回默认，
    // 否则用户调过的行高会一夜之间全变。
    if (s.type === 'tableSize') {
      const legacy = raw ? raw[LEGACY_SIZE[s.field]] : undefined;
      const n = toNum((v == null || v === '') ? legacy : v);
      out[s.key] = n == null ? s.def : clampNum(n, s.min, s.max);
      continue;
    }

    if (v == null || v === '') continue;
    if (s.unit === 'px' || s.type === 'num') {
      // 'abc' 剥掉非数字字符后是空串，而 Number('') === 0 ——
      // 直接转换会把「填错了」变成「填了 0」，环图上线宽会突然消失。
      // 空 / 只有符号 / 只有小数点，一律当作没填，保留该主题默认值。
      const n = toNum(v);
      if (n == null) continue;
      // 钳制：只有声明了 min/max 的项才生效（表格那 43 项都没声明，行为不变）。
      // 环图参数必须有界 —— 环半径调过头会把标签切到画布外面，环厚超过半径会让 rIn 变负。
      out[s.key] = clampNum(n, s.min, s.max);
    } else if (s.type === 'array' || s.type === 'align') {
      // 列宽/对齐是「按 COL_KEYS 的下标」存的逗号数组。
      // 旧存档里只有 18 项（COL_KEYS 后来追加了 8 个新列），
      // 直接交给 parseColWidths 会把缺的那几列补成 64、parseAligns 补成「左」——
      // 表现就是「升级后流水表的转出/转入/备注变窄、新列表头不居中」。
      // 所以缺位要补**该主题的默认值**，不是常量兜底。
      out[s.key] = padColList(String(v).trim(), s.type);

      // 2026-10-29 用户指定「所有表的表头全部居中」。
      // 旧默认里 balance / histOut 两列是「右」；老存档如果原封不动还是那份默认，
      // 这里迁移成全中 —— 否则改默认对已经存过设置的用户不生效。
      // 自己改过对齐的（不等于旧默认）原样保留，不覆盖他的选择。
      if (s.type === 'align' && out[s.key] === OLD_COL_ALIGN) out[s.key] = DEFAULT_COL_ALIGN;
    } else {
      out[s.key] = String(v).trim();
    }
  }
  return out;
}

/** 数值钳制：没声明 min/max 就是恒等函数 */
function clampNum(n, lo, hi) {
  let v = n;
  if (typeof lo === 'number' && v < lo) v = lo;
  if (typeof hi === 'number' && v > hi) v = hi;
  return v;
}

/**
 * '12' / '12px' / ' 12 ' → 12；空 / '-' / 'abc' → null。
 * 关键：null 与 0 是两件事 —— 填错不能变成「填了 0」。
 */
function toNum(v) {
  if (v == null || v === '') return null;
  const digits = String(v).replace(/[^0-9.-]/g, '');
  if (!digits || digits === '-' || digits === '.') return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** 把列宽/对齐数组补到 COL_KEYS.length：缺的位用默认值，多的截掉 */
function padColList(text, kind) {
  const arr = String(text || '').split(',').map((x) => x.trim());
  const defWidths = parseColWidths(DEFAULT_COL_WIDTHS);
  const defAligns = parseAligns(DEFAULT_COL_ALIGN);

  return COL_KEYS.map((_, i) => {
    if (kind === 'align') {
      const v = arr[i];
      return (v === '中' || v === '右' || v === '左') ? v : defAligns[i];
    }
    const n = Number(arr[i]);
    return (Number.isFinite(n) && n > 0) ? String(n) : String(defWidths[i]);
  }).join(',');
}

/**
 * 旧存档只有**一份**「默认列宽」（长度 = COL_KEYS）。
 * 升级后每张表要各自一份，这里按列名把旧值抽成该表的初值。
 * @returns {string} 该表的逗号数组（'' = 没有旧值，走该表默认）
 */
function legacyFor(table, raw) {
  const text = raw && raw['默认列宽'];
  if (text == null || text === '') return '';

  const legacy = padColList(String(text), 'array').split(',').map(Number);
  const t = TABLE_COLS[table];
  if (!t) return '';

  // noAuto 的表（路径追踪）不参与旧「默认列宽」迁移：
  // 它现在是固定 px 语义，从旧的按列名数组里抽出来的宽度（112 / 96 …）
  // 既不是新的默认值，也不是用户拖出来的值 —— 直接用该表默认。
  if (t.noAuto) return '';

  const def = String(TABLE_DEFAULT_WIDTHS[table] || '').split(',').map((x) => Number(x.trim()));

  return t.cols.map((c, i) => {
    // 自适应列（该表默认 0）不参与迁移 —— 把别表的固定宽度搬过来会让它不再自适应
    if (def[i] === 0) return 0;
    const j = COL_KEYS.indexOf(c);
    return (j >= 0 && Number.isFinite(legacy[j])) ? legacy[j] : '';
  }).join(',');
}

/** 列宽数组 → 数值数组（长度固定为 COL_KEYS.length，缺省补 64） */
export function parseColWidths(text) {
  const arr = String(text || '').split(',').map((x) => Number(x.trim()));
  return COL_KEYS.map((_, i) => (Number.isFinite(arr[i]) && arr[i] > 0 ? arr[i] : 64));
}

/** 对齐数组 → 归一化字符串数组（左/中/右） */
export function parseAligns(text) {
  const arr = String(text || '').split(',').map((x) => x.trim());
  return COL_KEYS.map((_, i) => (arr[i] === '中' ? '中' : arr[i] === '右' ? '右' : '左'));
}

/** 设置 → CSS 变量列表（供 apply-settings 使用） */
export function toCssList(settings, theme) {
  const s = normalize(settings, theme);
  const out = [];
  for (const item of SCHEMA) {
    const v = s[item.key];

    // 每张表一套列宽：变量名 --nt-col-<表>-<列>
    if (item.type === 'cols') {
      const t = TABLE_COLS[item.table];
      const widths = parseTableWidths(v, item.table);
      const auto = t.autoValue || 'auto';
      t.cols.forEach((c, i) => {
        out.push({
          group: item.group,
          cssVar: '--nt-col-' + item.table + '-' + c,
          value: widths[i] === 0 ? auto : widths[i] + 'px',
        });
      });
      continue;
    }

    if (item.type === 'array') {
      const widths = parseColWidths(v);
      COL_KEYS.forEach((c, i) => {
        out.push({ group: item.group, cssVar: '--nt-col-' + c, value: widths[i] + 'px' });
      });
    } else if (item.type === 'tableSize') {
      // 每表尺寸：变量名自带表名（--nt-row-h-flow），CSS 用表类名消费
      out.push({ group: item.group, cssVar: item.cssVar, value: v + 'px' });
    } else if (item.type === 'align') {
      const aligns = parseAligns(v);
      const prefix = item.prefix || '--nt-align-';
      COL_KEYS.forEach((c, i) => {
        out.push({ group: item.group, cssVar: prefix + c, value: aligns[i] === '中' ? 'center' : aligns[i] === '右' ? 'right' : 'left' });
      });
    } else if (item.type === 'enum') {
      let val;
      const idx = item.options ? item.options.indexOf(v) : -1;
      if (item.values && idx >= 0) val = item.values[idx];
      else if (v === '不显示') val = 'plain';
      else if (v === '显示') val = 'solid';
      else val = 'solid';
      out.push({ group: item.group, attr: item.attr, value: val });
    } else {
      out.push({ group: item.group, cssVar: item.cssVar, value: item.unit === 'px' ? v + 'px' : v });
    }
  }
  return out;
}

/** 设置 → 纯文本（键=值，中文逗号分隔），供导出/对话粘贴 */
export function toText(settings, theme) {
  const s = normalize(settings, theme);
  const parts = [];
  let lastGroup = '';
  for (const item of SCHEMA) {
    if (item.group !== lastGroup) {
      if (parts.length) parts.push('');
      lastGroup = item.group;
    }
    parts.push(`${item.key}=${s[item.key]}`);
  }
  return parts.join('，').replace(/，\n/g, '\n');
}

/** 解析纯文本（键=值，中文逗号或换行分隔）→ 部分设置 */
export function parseText(text) {
  const out = {};
  const re = /([^=，,\n]+?)\s*=\s*([^，,\n]+)/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

/* ============================================================
   设置页账户表的 A/B 两大区域
   ------------------------------------------------------------
   A 角色 = 正向账户（转入增加）；B 角色 = 反向账户（转出增加）。
   分区是为了让用户在**界面层面**就不可能填错极性。
   ============================================================ */

export const ZONES = [
  { key: 'A', label: 'A 我的资产/日常支出', hint: '转入增加，转出减少', types: ['资产类', '费用类'] },
  { key: 'B', label: 'B 收入与本金/欠款与贷款', hint: '转出增加，转入减少', types: ['负债类', '权益类', '收入类'] },
  // 未分类账户：流水里有、设置表里没有的账户会被自动补成壳放在这里（类型/分类为空）
  { key: 'U', label: 'U 未分类账户', hint: '流水里有、设置表里没有的账户；补上名称和类型就会归到 A / B', types: [] },
];
