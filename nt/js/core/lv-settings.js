// 核心：脉络页的界面参数
/**
 * 脉络气泡的可调参数。布局页单独一屏，改完立刻重画。
 * 层：第一层 · core
 */

export const LV_GROUPS = ['背景/颗粒', '泡泡外观', '中心渐变', '大小分档', '文字', '动画/时间轴', '物理'];

const g = (group, row) => ({ ...row, group });

export const LV_SCHEMA = [
  g('背景/颗粒', { key: '脉络背景', type: 'enum', options: ['柔彩', '灯箱', '暗场', '纯色', '暮色', '薄荷'], values: ['pastel', 'light', 'darkfield', 'plain', 'dusk', 'mint'], def: '柔彩', cssVar: '--nt-lv-preset', field: 'preset' }),
  g('背景/颗粒', { key: '脉络底渐变', def: 1, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-bg', field: 'bg' }),
  g('背景/颗粒', { key: '脉络底颗粒', def: 0.04, min: 0, max: 0.4, type: 'num', cssVar: '--nt-lv-grain', field: 'grain' }),
  g('背景/颗粒', { key: '脉络颗粒大小', def: 1, min: 0.5, max: 6, type: 'num', cssVar: '--nt-lv-grain-size', field: 'grainSize' }),
  g('背景/颗粒', { key: '脉络颗粒对比', def: 0.55, min: 0.1, max: 2, type: 'num', cssVar: '--nt-lv-grain-contrast', field: 'grainContrast' }),
  g('背景/颗粒', { key: '脉络颗粒着色', type: 'enum', options: ['单色', '暖色', '冷色'], values: ['mono', 'warm', 'cool'], def: '单色', cssVar: '--nt-lv-grain-tint', field: 'grainTint' }),
  g('泡泡外观', { key: '脉络线宽', def: 1.35, min: 0, max: 8, type: 'num', cssVar: '--nt-lv-stroke-w', field: 'strokeW' }),
  g('泡泡外观', { key: '脉络线颜色', def: '#f4eef2', cssVar: '--nt-lv-stroke', field: 'stroke' }),
  g('泡泡外观', { key: '脉络线透明', def: 0.9, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-stroke-a', field: 'strokeA' }),
  g('泡泡外观', { key: '脉络填充透明', def: 0.05, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-fill-a', field: 'fillA' }),
  g('泡泡外观', { key: '脉络填充色', type: 'enum', options: ['白色', '分类色', '线颜色'], values: ['white', 'lane', 'stroke'], def: '白色', cssVar: '--nt-lv-fill', field: 'fillMode' }),
  g('泡泡外观', { key: '脉络内发光', def: 0.1, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-in-glow', field: 'inGlow', hint: '只画在轮廓里面的光。0＝关闭。不会溢出边界，也不是中心渐变或填充。' }),
  g('泡泡外观', { key: '脉络内发光范围', def: 18, min: 2, max: 80, type: 'num', cssVar: '--nt-lv-in-glow-x', field: 'inGlowExt', hint: '从轮廓往里延伸，占半径的百分数。' }),
  g('泡泡外观', { key: '脉络外晕', def: 0.1, min: 0, max: 0.45, type: 'num', cssVar: '--nt-lv-out-glow', field: 'outGlow', hint: '只画在轮廓外面的淡晕。0＝关闭。和内发光分开。' }),
  g('泡泡外观', { key: '脉络外晕范围', def: 50, min: 0, max: 140, type: 'num', cssVar: '--nt-lv-out-glow-x', field: 'outGlowExt', hint: '从轮廓往外延伸，占半径的百分数。' }),
  g('中心渐变', { key: '脉络核大小', def: 0.32, min: 0.05, max: 0.95, type: 'num', cssVar: '--nt-lv-core-r', field: 'coreR' }),
  g('中心渐变', { key: '脉络核透明', def: 0.42, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-core-a', field: 'coreA' }),
  g('中心渐变', { key: '脉络核柔和', def: 0.55, min: 0.05, max: 1, type: 'num', cssVar: '--nt-lv-core-soft', field: 'coreSoft' }),
  g('中心渐变', { key: '脉络核浓淡', def: 0.75, min: 0, max: 1.5, type: 'num', cssVar: '--nt-lv-core-ink', field: 'coreInk' }),
  g('大小分档', { key: '脉络倍率1', def: 100, min: 10, max: 800, type: 'num', cssVar: '--nt-lv-m1', field: 'm1', hint: '百分数。100＝这一档的基准直径，200＝两倍。各档按金额过渡后再用最小/最大直径钳住，整屏缩放最后一起放大。' }),
  g('大小分档', { key: '脉络倍率10', def: 100, min: 10, max: 800, type: 'num', cssVar: '--nt-lv-m10', field: 'm10', hint: '10 元档，100＝基准。' }),
  g('大小分档', { key: '脉络倍率100', def: 100, min: 10, max: 800, type: 'num', cssVar: '--nt-lv-m100', field: 'm100', hint: '100 元档，100＝基准。' }),
  g('大小分档', { key: '脉络倍率1000', def: 100, min: 10, max: 800, type: 'num', cssVar: '--nt-lv-m1000', field: 'm1000', hint: '1000 元档，100＝基准。' }),
  g('大小分档', { key: '脉络倍率5000', def: 100, min: 10, max: 800, type: 'num', cssVar: '--nt-lv-m5000', field: 'm5000', hint: '5000 元档，100＝基准。' }),
  g('大小分档', { key: '脉络倍率1万', def: 100, min: 10, max: 800, type: 'num', cssVar: '--nt-lv-m10000', field: 'm10000', hint: '1 万档，100＝基准。' }),
  g('大小分档', { key: '脉络倍率10万', def: 100, min: 10, max: 800, type: 'num', cssVar: '--nt-lv-m100000', field: 'm100000', hint: '10 万档，100＝基准。' }),
  g('大小分档', { key: '脉络最小直径', def: 0, min: 0, max: 400, type: 'num', cssVar: '--nt-lv-dmin', field: 'dMin', hint: '1 倍缩放下的直径，单位 px。0＝不限制。金额为 0 的节点仍然不画。' }),
  g('大小分档', { key: '脉络最大直径', def: 480, min: 0, max: 2400, type: 'num', cssVar: '--nt-lv-dmax', field: 'dMax', hint: '1 倍缩放下的直径，单位 px。只有打开「限制最大直径」才生效。' }),
  g('大小分档', { key: '脉络限制最大直径', type: 'enum', options: ['关', '开'], values: ['0', '1'], def: '关', cssVar: '--nt-lv-dmax-on', field: 'dMaxOn' }),
  g('文字', { key: '脉络字号同步', type: 'enum', options: ['开', '关'], values: ['1', '0'], def: '开', cssVar: '--nt-lv-font-lock', field: 'fontLock', hint: '开：名称和金额用名称这套字号，超宽时一起缩小。关：两套字号各自生效。' }),
  g('文字', { key: '脉络名称占比', def: 0.32, min: 0.08, max: 0.8, type: 'num', cssVar: '--nt-lv-name-k', field: 'nameK', hint: '名称字号相对泡泡直径的比例。同步开启时金额也用它。' }),
  g('文字', { key: '脉络名称最小字号', def: 8, min: 0, max: 48, type: 'num', cssVar: '--nt-lv-name-min', field: 'nameMin', hint: '名称在屏幕上的最小字号，单位 px。' }),
  g('文字', { key: '脉络名称最大字号', def: 18, min: 6, max: 72, type: 'num', cssVar: '--nt-lv-name-max', field: 'nameMax', hint: '名称在屏幕上的最大字号，单位 px。' }),
  g('文字', { key: '脉络金额占比', def: 0.32, min: 0.08, max: 0.8, type: 'num', cssVar: '--nt-lv-amt-k', field: 'amtK', hint: '金额字号相对泡泡直径的比例。同步开启时不单独生效。' }),
  g('文字', { key: '脉络金额最小字号', def: 8, min: 0, max: 48, type: 'num', cssVar: '--nt-lv-amt-min', field: 'amtMin', hint: '金额在屏幕上的最小字号，单位 px。' }),
  g('文字', { key: '脉络金额最大字号', def: 18, min: 6, max: 72, type: 'num', cssVar: '--nt-lv-amt-max', field: 'amtMax', hint: '金额在屏幕上的最大字号，单位 px。' }),
  g('文字', { key: '脉络名称透明', def: 1, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-name-a', field: 'nameA' }),
  g('文字', { key: '脉络金额透明', def: 1, min: 0, max: 1, type: 'num', cssVar: '--nt-lv-amt-a', field: 'amtA' }),
  g('文字', { key: '脉络字渐隐', def: 18, min: 0, max: 80, type: 'num', cssVar: '--nt-lv-fade', field: 'fadePct' }),
  g('动画/时间轴', { key: '脉络动画区', def: 80, min: 40, max: 100, type: 'num', cssVar: '--nt-lv-zone', field: 'zone' }),
  g('动画/时间轴', { key: '脉络每天像素', def: 0, min: 0, max: 480, type: 'num', cssVar: '--nt-lv-ppd', field: 'ppd' }),
  g('动画/时间轴', { key: '脉络窗口像素', def: 880, min: 240, max: 2800, type: 'num', cssVar: '--nt-lv-window', field: 'windowPx' }),
  g('动画/时间轴', { key: '脉络拖动灵敏', def: 0.6, min: 0.15, max: 1.5, type: 'num', cssVar: '--nt-lv-scrub', field: 'scrub' }),
  g('动画/时间轴', { key: '脉络同日间隔', def: 0.65, min: 0, max: 4, type: 'num', cssVar: '--nt-lv-day-gap', field: 'dayGap' }),
  g('物理', { key: '脉络相斥', def: 1, min: 0, max: 4, type: 'num', cssVar: '--nt-lv-repel', field: 'repel' }),
  g('物理', { key: '脉络间隙', def: 4, min: 0, max: 48, type: 'num', cssVar: '--nt-lv-gap', field: 'gap' }),
  g('物理', { key: '左缘内边', def: 6, min: 0, max: 24, type: 'num', cssVar: '--nt-lv-inset-l', field: 'insetL' }),
  g('物理', { key: '右缘内边', def: 6, min: 0, max: 24, type: 'num', cssVar: '--nt-lv-inset-r', field: 'insetR' }),
  g('物理', { key: '脉络轴线', type: 'enum', options: ['关', '开'], values: ['0', '1'], def: '关', cssVar: '--nt-lv-guides', field: 'guides' }),
];

export const LV_DEFAULTS = LV_SCHEMA.reduce((acc, s) => {
  acc[s.field] = s.def;
  return acc;
}, {});
