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
 *
 * 「有哪些参数」的声明表在 core/settings-schema.js（那部分快 300 行了）；
 * 本文件负责读：归一化、旧值迁移、变 CSS 变量、导出/导入文本。
 */

import {
  TABLE_COLS, TABLE_DEFAULT_WIDTHS, parseTableWidths, colWidthKey,
} from './table-cols.js';
import {
  GROUPS, SCREENS, GROUP_SCREEN, GROUP_SCOPE, GROUP_FILE, COL_KEYS, DEFAULT_COL_WIDTHS,
  DEFAULT_COL_ALIGN, OLD_COL_ALIGN, SCHEMA, LEGACY_DEFAULT,
} from './settings-schema.js';

// 保持既有 import 不变：参数表与表列定义都从这里转出一次。
export {
  GROUPS, SCREENS, GROUP_SCREEN, GROUP_SCOPE, GROUP_FILE, SCHEMA,
  COL_KEYS, DEFAULT_COL_WIDTHS, DEFAULT_COL_ALIGN,
  TABLE_COLS, TABLE_DEFAULT_WIDTHS, parseTableWidths, colWidthKey,
};

/** 补到该表的列数：缺位用该表默认值（不能掉成 0/64，否则整列消失或变窄） */
function padTableWidths(text, table) {
  return parseTableWidths(text, table).join(',');
}

/** 主题 id 列表（与 theme-manager 的 VALID 一致） */
export const THEME_IDS = ['light', 'dark', 'alt1', 'alt2'];

/**
 * 每表尺寸的旧值来源：2026-10 之前这四个是**全局**参数。
 * 用户调过的值（比如数据区行高 40）要能跟着迁移到每张表上。
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
 * 旧存档的全局尺寸/列宽在这里迁移到每表一份（见 LEGACY_SIZE / legacyFor）。
 * @param {object} raw
 * @param {string} [theme]
 * @returns {object} 完整设置
 */
export function normalize(raw, theme) {
  const out = { ...(THEME_DEFAULTS[theme] || THEME_DEFAULTS.dark) };
  for (const s of SCHEMA) {
    let v = raw ? raw[s.key] : undefined;
    // 旧默认值迁移（见 settings-schema.js 的 LEGACY_DEFAULT）
    const mig = LEGACY_DEFAULT[s.key];
    if (mig && v != null && mig[String(v)] !== undefined) v = mig[String(v)];

    // 2026-11：按钮行高度从「按钮尺寸」组挪到「按钮区」组（改的是整行，不是按钮本身），
    // 旧键的值跟着走，否则老存档升级后按钮行会掉回 30。
    if (s.key === '按钮区高度' && (v == null || v === '')) {
      v = raw ? raw['按钮尺寸行高'] : undefined;
    }

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
      // 钳制：只有声明了 min/max 的项才生效（表格那些都没声明，行为不变）。
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
  // growByWidth / noLegacy 的表（统计三块）同理：它们的默认宽度是新给的，
  // 旧数组里抽出来的值会把这批默认盖掉。
  if (t.noAuto || t.growByWidth || t.noLegacy) return '';

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
        // growByWidth 的表：0 表示「还没自定义」，宽度由 CSS 的百分比铺满容器。
        // 这里输出**空值**（不是 auto）：apply-settings 收到空值会 removeProperty，
        // 把上一次拖出来、现在已被「恢复默认」清掉的旧变量摘掉。
        // 写 auto 会把 CSS 的 `var(--nt-col-…, 24%)` 兜底顶掉，表就不铺满了。
        if (widths[i] === 0 && t.growByWidth) {
          out.push({ group: item.group, cssVar: '--nt-col-' + item.table + '-' + c, value: '' });
          return;
        }
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
  { key: 'A', label: 'A 我的资产/成本/日常支出', hint: '转入增加，转出减少', types: ['资产类', '费用类', '成本类'] },
  { key: 'B', label: 'B 收入与本金/欠款与贷款', hint: '转出增加，转入减少', types: ['负债类', '权益类', '收入类'] },
  // 未分类账户：流水里有、设置表里没有的账户会被自动补成壳放在这里（类型/分类为空）
  { key: 'U', label: 'U 未分类节点', hint: '流水里有、设置表里没有的节点；补上名称和类型就会归到 A / B', types: [] },
];
