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

export const GROUPS = ['标签栏', '按钮区', '表格', '信息栏', '按钮尺寸', '列标行', '数据区'];

/** 调试面板的界面标签 */
export const SCREENS = [
  { id: 'main', label: '主界面' },
  { id: 'flow', label: '流水' },
];

/** 分组归属的界面标签：main=公共参数，flow=流水页参数 */
export const GROUP_SCREEN = {
  标签栏: 'main',
  按钮区: 'main',
  表格: 'main',
  信息栏: 'main',
  按钮尺寸: 'flow',
  列标行: 'flow',
  数据区: 'flow',
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
  数据区: 'global',
};

/** 列宽/对齐数组的列顺序（对应 colgroup 的 .nt-c-*） */
export const COL_KEYS = ['seq', 'date', 'type', 'cat', 'code', 'num', 'amount', 'action', 'state', 'freq', 'day', 'name', 'balance', 'opening', 'histOut', 'histIn', 'periods', 'principal'];

// 顺序与 COL_KEYS 一一对应；后 7 个是账户/统计表用到的列
export const DEFAULT_COL_WIDTHS = '44,84,72,76,64,100,96,40,64,64,64,110,100,96,90,90,64,96';
export const DEFAULT_COL_ALIGN = '左,左,左,左,左,右,右,中,中,中,中,左,右,右,右,右,右,右';

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
  { key: '按钮区背景颜色', group: '按钮区', def: '#0e0b16', cssVar: '--nt-vbar-bg' },
  { key: '按钮区行背景色', group: '按钮区', def: '#000000', cssVar: '--nt-btn-bg' },

  /* ---------- 表格（公共） ---------- */
  { key: '默认文字颜色', group: '表格', def: '#f2eeff', cssVar: '--nt-unit-text' },
  { key: '默认背景颜色', group: '表格', def: '#000000', cssVar: '--nt-unit-bg' },
  { key: '整行背景色', group: '表格', def: '#0e0b16', cssVar: '--nt-unit-row-bg' },
  { key: '横向边框', group: '表格', type: 'enum', options: ['无', '虚线', '实线'], values: ['none', 'dashed', 'solid'], def: '实线', attr: 'data-border-h' },
  { key: '横向边框线粗', group: '表格', def: 1, unit: 'px', cssVar: '--nt-border-h-width' },
  { key: '横向边框颜色', group: '表格', def: '#2a2438', cssVar: '--nt-border-h-color' },
  { key: '纵向边框', group: '表格', type: 'enum', options: ['无', '虚线', '实线'], values: ['none', 'dashed', 'solid'], def: '无', attr: 'data-border-v' },
  { key: '纵向边框线粗', group: '表格', def: 1, unit: 'px', cssVar: '--nt-border-v-width' },
  { key: '纵向边框颜色', group: '表格', def: '#2a2438', cssVar: '--nt-border-v-color' },
  { key: '手柄位置', group: '表格', def: -3, unit: 'px', cssVar: '--nt-handle-offset' },
  { key: '手柄颜色', group: '表格', def: '#5f5878', cssVar: '--nt-handle-color' },

  /* ---------- 信息栏（公共） ---------- */
  { key: '信息栏行高', group: '信息栏', def: 28, unit: 'px', cssVar: '--nt-footer-h' },
  { key: '信息栏字号', group: '信息栏', def: 12, unit: 'px', cssVar: '--nt-footer-font' },
  { key: '信息栏文字颜色', group: '信息栏', def: '#b9b2d0', cssVar: '--nt-footer-color' },
  { key: '信息栏背景颜色', group: '信息栏', def: '#0e0b16', cssVar: '--nt-footer-bg' },

  /* ---------- 按钮尺寸（独立） ---------- */
  { key: '按钮尺寸行高', group: '按钮尺寸', def: 30, unit: 'px', cssVar: '--nt-vbar-h' },
  { key: '按钮尺寸字号', group: '按钮尺寸', def: 12, unit: 'px', cssVar: '--nt-vbar-font' },

  /* ---------- 列标行（独立） ---------- */
  { key: '列标行行高', group: '列标行', def: 26, unit: 'px', cssVar: '--nt-th-h' },
  { key: '列标行字号', group: '列标行', def: 12, unit: 'px', cssVar: '--nt-th-font' },
  { key: '列标行对齐', group: '列标行', type: 'align', prefix: '--nt-th-align-', def: DEFAULT_COL_ALIGN },
  { key: '手柄高度', group: '列标行', def: 26, unit: 'px', cssVar: '--nt-handle-h' },

  /* ---------- 数据区（独立） ----------
     列宽不在这里：表格 width:100% + min-width 由 CSS 决定，
     拖动后整表切 .cols-custom 模式，见 ui/table-layout.js。
     想恢复默认列宽用面板底部的「恢复默认」。 */
  { key: '数据区行高', group: '数据区', def: 32, unit: 'px', cssVar: '--nt-row-h' },
  { key: '数据区字号', group: '数据区', def: 14, unit: 'px', cssVar: '--nt-cell-font' },
];

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
    默认文字颜色: '#1b1430', 默认背景颜色: '#ffffff', 整行背景色: '#f8f7fd', 横向边框颜色: '#e6e2f5', 纵向边框颜色: '#e6e2f5',
    信息栏文字颜色: '#5f5878', 信息栏背景颜色: '#f8f7fd',
  },
  dark: {
    标签栏文字颜色: '#b9b2d0', 标签栏背景颜色: '#0e0b16', 标签栏行背景色: '#0e0b16', 标签栏边框颜色: '#2a2438',
    按钮区文字颜色: '#f2eeff', 按钮区背景颜色: '#0e0b16', 按钮区行背景色: '#000000',
    默认文字颜色: '#f2eeff', 默认背景颜色: '#000000', 整行背景色: '#0e0b16', 横向边框颜色: '#2a2438', 纵向边框颜色: '#2a2438',
    信息栏文字颜色: '#b9b2d0', 信息栏背景颜色: '#0e0b16',
  },
  alt1: {
    标签栏文字颜色: '#6b5f48', 标签栏背景颜色: '#f3ece0', 标签栏行背景色: '#f3ece0', 标签栏边框颜色: '#e5dcc9',
    按钮区文字颜色: '#2a2418', 按钮区背景颜色: '#f3ece0', 按钮区行背景色: '#fffdf8',
    默认文字颜色: '#2a2418', 默认背景颜色: '#fffdf8', 整行背景色: '#f3ece0', 横向边框颜色: '#e5dcc9', 纵向边框颜色: '#e5dcc9',
    信息栏文字颜色: '#6b5f48', 信息栏背景颜色: '#f3ece0',
  },
  alt2: {
    标签栏文字颜色: '#9ec4ae', 标签栏背景颜色: '#0f1f18', 标签栏行背景色: '#0f1f18', 标签栏边框颜色: '#1e3328',
    按钮区文字颜色: '#e0f2e8', 按钮区背景颜色: '#0f1f18', 按钮区行背景色: '#0a1410',
    默认文字颜色: '#e0f2e8', 默认背景颜色: '#0a1410', 整行背景色: '#0f1f18', 横向边框颜色: '#1e3328', 纵向边框颜色: '#1e3328',
    信息栏文字颜色: '#9ec4ae', 信息栏背景颜色: '#0f1f18',
  },
};

/** 每个主题一套完整默认值 */
export const THEME_DEFAULTS = THEME_IDS.reduce((acc, id) => {
  acc[id] = { ...BASE, ...THEME_COLORS[id] };
  return acc;
}, {});

/** 兼容旧代码：无主题时的默认（深色） */
export const DEFAULTS = THEME_DEFAULTS.dark;

/**
 * 归一化：px 项转数字，数组/对齐项保留逗号串，颜色项保留字符串；非法值落回该主题默认。
 * @param {object} raw
 * @param {string} [theme]
 * @returns {object} 完整设置
 */
export function normalize(raw, theme) {
  const base = THEME_DEFAULTS[theme] || THEME_DEFAULTS.dark;
  const out = { ...base };
  for (const s of SCHEMA) {
    const v = raw ? raw[s.key] : undefined;
    if (v == null || v === '') continue;
    if (s.unit === 'px') {
      const n = Number(String(v).replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(n)) out[s.key] = n;
    } else {
      out[s.key] = String(v).trim();
    }
  }
  return out;
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
    if (item.type === 'array') {
      const widths = parseColWidths(v);
      COL_KEYS.forEach((c, i) => {
        out.push({ group: item.group, cssVar: '--nt-col-' + c, value: widths[i] + 'px' });
      });
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
  {
    key: 'A',
    label: 'A 我的资产/日常支出',
    hint: '转入增加，转出减少',
    types: ['资产类', '费用类'],
  },
  {
    key: 'B',
    label: 'B 收入与本金/欠款与贷款',
    hint: '转出增加，转入减少',
    types: ['负债类', '权益类', '收入类'],
  },
];
