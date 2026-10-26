/**
 * 界面参数（调试 + 布局配置共用）
 * 层：第一层 · 数据基座（纯数据，零依赖，不碰 DOM）
 *
 * 布局约定：
 *   公共参数（按钮区/数据区/列标行 共用，global）：
 *     默认文字颜色、默认背景颜色、整行背景色、横向边框样式、纵向边框样式
 *   独立参数（每区域各一份）：
 *     默认行高、默认字号、默认列宽（逗号分隔数组）
 *
 * 每项：key、group、def、unit、cssVar / type / attr / options / values。
 * 加参数只改 SCHEMA 一处：面板、应用、导出都从它派生。
 */

export const GROUPS = ['公共', '按钮区', '列标行', '数据区', '列宽', '标签栏', '信息栏'];

/** 调试面板的界面标签 */
export const SCREENS = [
  { id: 'main', label: '主界面' },
  { id: 'flow', label: '流水' },
];

/** 分组归属的界面标签：main=公共参数，flow=流水页参数 */
export const GROUP_SCREEN = {
  公共: 'main',
  标签栏: 'main',
  信息栏: 'main',
  按钮区: 'flow',
  列标行: 'flow',
  数据区: 'flow',
  列宽: 'flow',
};

/** 参数作用域：global=写全局(:root)；其余=写到对应标签页容器 [data-view] */
export const GROUP_SCOPE = {
  公共: 'global',
  标签栏: 'global',
  信息栏: 'global',
  按钮区: 'flow',
  列标行: 'flow',
  数据区: 'flow',
  列宽: 'flow',
};

/** 列宽数组的列顺序（对应 colgroup 的 .nt-c-*） */
export const COL_KEYS = ['seq', 'date', 'type', 'cat', 'code', 'num', 'amount', 'action', 'state', 'freq', 'day'];

/** 默认列宽数组（逗号分隔，顺序同 COL_KEYS） */
export const DEFAULT_COL_WIDTHS = '44,84,72,76,64,100,96,40,64,64,64';

export const SCHEMA = [
  /* ---------- 公共（按钮区 / 数据区 / 列标行 共用） ---------- */
  { key: '默认文字颜色', group: '公共', def: '#f2eeff', cssVar: '--nt-unit-text' },
  { key: '默认背景颜色', group: '公共', def: '#000000', cssVar: '--nt-unit-bg' },
  { key: '整行背景色', group: '公共', def: '#0e0b16', cssVar: '--nt-unit-row-bg' },
  { key: '横向边框样式', group: '公共', type: 'enum', options: ['有', '无'], values: ['1px', '0'], def: '有', attr: 'data-border-h' },
  { key: '纵向边框样式', group: '公共', type: 'enum', options: ['有', '无'], values: ['0', '1px'], def: '无', attr: 'data-border-v' },

  /* ---------- 按钮区（独立） ---------- */
  { key: '按钮区行高', group: '按钮区', def: 30, unit: 'px', cssVar: '--nt-vbar-h' },
  { key: '按钮区字号', group: '按钮区', def: 12, unit: 'px', cssVar: '--nt-vbar-font' },

  /* ---------- 列标行（独立） ---------- */
  { key: '列标行行高', group: '列标行', def: 26, unit: 'px', cssVar: '--nt-th-h' },
  { key: '列标行字号', group: '列标行', def: 12, unit: 'px', cssVar: '--nt-th-font' },

  /* ---------- 数据区（独立） ---------- */
  { key: '数据区行高', group: '数据区', def: 32, unit: 'px', cssVar: '--nt-row-h' },
  { key: '数据区字号', group: '数据区', def: 14, unit: 'px', cssVar: '--nt-cell-font' },

  /* ---------- 列宽（独立，数组） ---------- */
  { key: '默认列宽', group: '列宽', type: 'array', def: DEFAULT_COL_WIDTHS },

  /* ---------- 标签栏（公共） ---------- */
  { key: '标签栏行高', group: '标签栏', def: 40, unit: 'px', cssVar: '--nt-tabs-h' },
  { key: '标签栏字号', group: '标签栏', def: 13, unit: 'px', cssVar: '--nt-tab-font' },
  { key: '标签栏文字颜色', group: '标签栏', def: '#b9b2d0', cssVar: '--nt-tabs-color' },
  { key: '标签栏背景颜色', group: '标签栏', def: '#0e0b16', cssVar: '--nt-tabs-bg' },
  { key: '标签栏行背景色', group: '标签栏', def: '#0e0b16', cssVar: '--nt-tab-bg' },
  { key: '标签栏边框', group: '标签栏', type: 'enum', options: ['按钮框', '竖线', '直角框', '无边框'], values: ['solid', 'line', 'sharp', 'plain'], def: '按钮框', attr: 'data-tabs-border' },
  { key: '标签栏边框颜色', group: '标签栏', def: '#2a2438', cssVar: '--nt-tabs-border' },

  /* ---------- 信息栏（公共） ---------- */
  { key: '信息栏行高', group: '信息栏', def: 28, unit: 'px', cssVar: '--nt-footer-h' },
  { key: '信息栏字号', group: '信息栏', def: 12, unit: 'px', cssVar: '--nt-footer-font' },
  { key: '信息栏文字颜色', group: '信息栏', def: '#b9b2d0', cssVar: '--nt-footer-color' },
  { key: '信息栏背景颜色', group: '信息栏', def: '#0e0b16', cssVar: '--nt-footer-bg' },
];

export const DEFAULTS = SCHEMA.reduce((acc, s) => {
  acc[s.key] = s.def;
  return acc;
}, {});

/**
 * 归一化：px 项转数字，数组项保留逗号串，其余保留字符串；非法值落回默认。
 * @param {object} raw
 * @returns {object} 完整设置
 */
export function normalize(raw) {
  const out = { ...DEFAULTS };
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

/** 设置 → CSS 变量列表（供 apply-settings 使用） */
export function toCssList(settings) {
  const s = normalize(settings);
  const out = [];
  for (const item of SCHEMA) {
    const v = s[item.key];
    if (item.type === 'array') {
      const widths = parseColWidths(v);
      COL_KEYS.forEach((c, i) => {
        out.push({ group: item.group, cssVar: '--nt-col-' + c, value: widths[i] + 'px' });
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
export function toText(settings) {
  const s = normalize(settings);
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
