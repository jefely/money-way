// 核心：脉络页的界面参数
/**
 * 脉络气泡的可调参数。布局页「脉络」一组，改完立刻重画。
 * 层：第一层 · core
 */

export const LV_GROUPS = ['脉络'];

export const LV_SCHEMA = [
  { key: '脉络背景', group: '脉络', type: 'enum', options: ['柔彩', '灯箱', '暗场', '纯色', '暮色', '薄荷'], values: ['pastel', 'light', 'darkfield', 'plain', 'dusk', 'mint'], def: '柔彩', cssVar: '--nt-lv-preset', field: 'preset' },
  { key: '脉络线宽', group: '脉络', def: 1.35, min: 0, max: 8, type: 'num', cssVar: '--nt-lv-stroke-w', field: 'strokeW' },
  { key: '脉络线颜色', group: '脉络', def: '#f4eef2', cssVar: '--nt-lv-stroke', field: 'stroke' },
  { key: '脉络线透明', group: '脉络', def: 0.9, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-stroke-a', field: 'strokeA' },
  { key: '脉络填充透明', group: '脉络', def: 0.05, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-fill-a', field: 'fillA' },
  { key: '脉络填充色', group: '脉络', type: 'enum', options: ['白色', '分类色', '线颜色'], values: ['white', 'lane', 'stroke'], def: '白色', cssVar: '--nt-lv-fill', field: 'fillMode' },
  { key: '脉络核大小', group: '脉络', def: 0.32, min: 0.05, max: 0.95, type: 'num', cssVar: '--nt-lv-core-r', field: 'coreR' },
  { key: '脉络核透明', group: '脉络', def: 0.42, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-core-a', field: 'coreA' },
  { key: '脉络核柔和', group: '脉络', def: 0.55, min: 0.05, max: 1, type: 'num', cssVar: '--nt-lv-core-soft', field: 'coreSoft' },
  { key: '脉络核浓淡', group: '脉络', def: 0.75, min: 0, max: 1.5, type: 'num', cssVar: '--nt-lv-core-ink', field: 'coreInk' },
  { key: '脉络字占比', group: '脉络', def: 0.32, min: 0.08, max: 0.8, type: 'num', cssVar: '--nt-lv-font-k', field: 'fontK' },
  { key: '脉络最小字号', group: '脉络', def: 8, min: 0, max: 48, type: 'num', cssVar: '--nt-lv-font-min', field: 'fontMin' },
  { key: '脉络最大字号', group: '脉络', def: 18, min: 6, max: 72, type: 'num', cssVar: '--nt-lv-font-max', field: 'fontMax' },
  { key: '脉络名称透明', group: '脉络', def: 1, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-name-a', field: 'nameA' },
  { key: '脉络金额透明', group: '脉络', def: 1, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-amt-a', field: 'amtA' },
  { key: '脉络字渐隐', group: '脉络', def: 18, min: 0, max: 80, type: 'num', cssVar: '--nt-lv-fade', field: 'fadePct' },
  { key: '脉络动画区', group: '脉络', def: 80, min: 40, max: 100, type: 'num', cssVar: '--nt-lv-zone', field: 'zone' },
  { key: '脉络每天像素', group: '脉络', def: 0, min: 0, max: 480, type: 'num', cssVar: '--nt-lv-ppd', field: 'ppd' },
  { key: '脉络窗口像素', group: '脉络', def: 880, min: 240, max: 2800, type: 'num', cssVar: '--nt-lv-window', field: 'windowPx' },
  { key: '脉络拖动灵敏', group: '脉络', def: 0.6, min: 0.15, max: 1.5, type: 'num', cssVar: '--nt-lv-scrub', field: 'scrub' },
  { key: '脉络同日间隔', group: '脉络', def: 0.65, min: 0, max: 4, type: 'num', cssVar: '--nt-lv-day-gap', field: 'dayGap' },
  { key: '脉络相斥', group: '脉络', def: 1, min: 0, max: 4, type: 'num', cssVar: '--nt-lv-repel', field: 'repel' },
  { key: '脉络间隙', group: '脉络', def: 4, min: 0, max: 48, type: 'num', cssVar: '--nt-lv-gap', field: 'gap' },
  { key: '脉络底渐变', group: '脉络', def: 1, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-bg', field: 'bg' },
  { key: '脉络底颗粒', group: '脉络', def: 0.04, min: 0, max: 0.4, type: 'num', cssVar: '--nt-lv-grain', field: 'grain' },
  { key: '脉络颗粒大小', group: '脉络', def: 1, min: 0.5, max: 6, type: 'num', cssVar: '--nt-lv-grain-size', field: 'grainSize' },
  { key: '脉络颗粒对比', group: '脉络', def: 0.55, min: 0.1, max: 2, type: 'num', cssVar: '--nt-lv-grain-contrast', field: 'grainContrast' },
  { key: '负债轴位置', group: '脉络', def: 35, min: 15, max: 48, type: 'num', cssVar: '--nt-lv-x-liab', field: 'xLiab' },
  { key: '资产轴位置', group: '脉络', def: 65, min: 52, max: 85, type: 'num', cssVar: '--nt-lv-x-asset', field: 'xAsset' },
  { key: '左缘内边', group: '脉络', def: 8, min: 2, max: 30, type: 'num', cssVar: '--nt-lv-inset-l', field: 'insetL' },
  { key: '右缘内边', group: '脉络', def: 8, min: 2, max: 30, type: 'num', cssVar: '--nt-lv-inset-r', field: 'insetR' },
  { key: '脉络轴线', group: '脉络', type: 'enum', options: ['关', '开'], values: ['0', '1'], def: '关', cssVar: '--nt-lv-guides', field: 'guides' },
  { key: '脉络颗粒着色', group: '脉络', type: 'enum', options: ['单色', '暖色', '冷色'], values: ['mono', 'warm', 'cool'], def: '单色', cssVar: '--nt-lv-grain-tint', field: 'grainTint' },
  { key: '脉络倍率1', group: '脉络', def: 1, min: 0.05, max: 8, type: 'num', cssVar: '--nt-lv-m1', field: 'm1' },
  { key: '脉络倍率10', group: '脉络', def: 1, min: 0.05, max: 8, type: 'num', cssVar: '--nt-lv-m10', field: 'm10' },
  { key: '脉络倍率100', group: '脉络', def: 1, min: 0.05, max: 8, type: 'num', cssVar: '--nt-lv-m100', field: 'm100' },
  { key: '脉络倍率1000', group: '脉络', def: 1, min: 0.05, max: 8, type: 'num', cssVar: '--nt-lv-m1000', field: 'm1000' },
  { key: '脉络倍率5000', group: '脉络', def: 1, min: 0.05, max: 8, type: 'num', cssVar: '--nt-lv-m5000', field: 'm5000' },
  { key: '脉络倍率1万', group: '脉络', def: 1, min: 0.05, max: 8, type: 'num', cssVar: '--nt-lv-m10000', field: 'm10000' },
  { key: '脉络倍率10万', group: '脉络', def: 1, min: 0.05, max: 8, type: 'num', cssVar: '--nt-lv-m100000', field: 'm100000' },
];

export const LV_DEFAULTS = LV_SCHEMA.reduce((acc, s) => {
  acc[s.field] = s.def;
  return acc;
}, {});
