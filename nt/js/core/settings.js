/**
 * 界面参数（调试 + 布局配置共用）
 * 层：第一层 · 数据基座（纯数据，零依赖，不碰 DOM）
 *
 * 分组按项目术语：
 *   标签栏 / 按钮区 / 列标行 / 数据区 / 信息栏
 *
 * 每项：key（中文键，也是对话里用的键名）、group、def、unit、cssVar。
 * 加参数只改 SCHEMA 一处：面板、应用、导出都从它派生。
 */

export const GROUPS = ['标签栏', '按钮区', '列标行', '数据区', '信息栏'];

/** 调试面板的界面标签（第一个固定为「主界面」，以后可加「设置界面」等） */
export const SCREENS = [
  { id: 'main', label: '主界面' },
];

export const SCHEMA = [
  /* ---------- 标签栏 ---------- */
  { key: '标签栏行高', group: '标签栏', def: 40, unit: 'px', cssVar: '--nt-tabs-h' },
  { key: '标签栏字号', group: '标签栏', def: 13, unit: 'px', cssVar: '--nt-tab-font' },
  { key: '标签栏文字颜色', group: '标签栏', def: '#b9b2d0', cssVar: '--nt-tabs-color' },
  { key: '标签栏背景颜色', group: '标签栏', def: '#0e0b16', cssVar: '--nt-tabs-bg' },

  /* ---------- 按钮区 ---------- */
  { key: '按钮区行高', group: '按钮区', def: 30, unit: 'px', cssVar: '--nt-vbar-h' },
  { key: '按钮区字号', group: '按钮区', def: 12, unit: 'px', cssVar: '--nt-vbar-font' },
  { key: '按钮区文字颜色', group: '按钮区', def: '#f2eeff', cssVar: '--nt-vbar-color' },
  { key: '按钮区背景颜色', group: '按钮区', def: '#0e0b16', cssVar: '--nt-vbar-bg' },
  { key: '按钮边框', group: '按钮区', type: 'enum', options: ['按钮框', '竖线', '直角框'], values: ['solid', 'line', 'sharp'], def: '按钮框', attr: 'data-btn-style' },
  { key: '按钮边框颜色', group: '按钮区', def: '#2a2438', cssVar: '--nt-btn-border-color' },
  { key: '按钮底色', group: '按钮区', def: '#000000', cssVar: '--nt-btn-bg-color' },
  { key: '按钮高度', group: '按钮区', def: 26, unit: 'px', cssVar: '--nt-btn-h' },
  { key: '按钮宽度', group: '按钮区', def: 64, unit: 'px', cssVar: '--nt-btn-w' },
  { key: '按钮间距', group: '按钮区', def: 6, unit: 'px', cssVar: '--nt-btn-gap' },

  /* ---------- 列标行 ---------- */
  { key: '列标行行高', group: '列标行', def: 26, unit: 'px', cssVar: '--nt-th-h' },
  { key: '列标行字号', group: '列标行', def: 12, unit: 'px', cssVar: '--nt-th-font' },
  { key: '列标行文字颜色', group: '列标行', def: '#b9b2d0', cssVar: '--nt-th-color' },
  { key: '列标行背景颜色', group: '列标行', def: '#0e0b16', cssVar: '--nt-th-bg' },

  /* ---------- 数据区 ---------- */
  { key: '数据区行高', group: '数据区', def: 32, unit: 'px', cssVar: '--nt-row-h' },
  { key: '数据区字号', group: '数据区', def: 14, unit: 'px', cssVar: '--nt-cell-font' },
  { key: '数据区文字颜色', group: '数据区', def: '#f2eeff', cssVar: '--nt-cell-color' },
  { key: '数据区背景颜色', group: '数据区', def: '#000000', cssVar: '--nt-cell-bg' },

  /* ---------- 信息栏 ---------- */
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
 * 归一化：px 项转数字，颜色项保留字符串；非法值落回默认。
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

/** 设置 → CSS 变量列表（供 apply-settings 使用） */
export function toCssList(settings) {
  const s = normalize(settings);
  const out = [];
  for (const item of SCHEMA) {
    const v = s[item.key];
    if (item.type === 'enum') {
      let val;
      const idx = item.options ? item.options.indexOf(v) : -1;
      if (item.values && idx >= 0) val = item.values[idx];
      else if (v === '不显示') val = 'plain';   // 兼容旧值
      else if (v === '显示') val = 'solid';     // 兼容旧值
      else val = 'solid';
      out.push({ attr: item.attr, value: val });
    } else {
      out.push({ cssVar: item.cssVar, value: item.unit === 'px' ? v + 'px' : v });
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
