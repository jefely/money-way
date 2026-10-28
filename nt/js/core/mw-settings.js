// 界面：（无界面）环图参数 SCHEMA + 默认值
/**
 * 环图（路径页 Money Way）的界面参数
 * 层：第一层 · 数据基座（纯数据，零依赖，不碰 DOM）
 *
 * 为什么单独一个文件：core/settings.js 已经接近 300 行有效代码的上限，
 * 而环图这 30 项和「表格/外壳」那 43 项是两套完全不同的消费方 ——
 * 那边写 --nt-col-* 由 CSS 消费，这边写 --nt-mw-* 由 SVG 渲染器消费。
 * 这里只声明「有什么参数、默认多少、上下限多少」，怎么落到画面上由 ui/ 决定。
 *
 * ⚠️ **单位是「基准单位」，不是像素。**
 * 画布 6000 对应单文件版的 1800（见 ui/mw-svg-renderer.js 的 RATIO），
 * 所以 `环半径 = 640` 渲染出来是 640 × 3.33 ≈ 2133。
 * 这样面板上显示的数字就是 UI-PARAMS.md 里那些数 ——
 * 用户改 1，等于在单文件版上改 1，不需要心算比例。
 *
 * min/max 不是装饰：`环半径` 调到大于 760 时标签会被画布边缘切掉，
 * `环厚` 大于环半径时 rIn 变负、弧形路径会反向缠绕（图看着像散了）。
 * 上下限由 core/settings.js 的 normalize 强制，填错只会被钳住，不会把图调坏。
 */

export const MW_GROUPS = ['环图·几何', '环图·标签', '环图·线', '环图·规则'];

/**
 * 每项：key（面板/导出用的中文键）、group、def、min、max、cssVar、field。
 * field 是渲染器读的名字（英文），面板只认 key。
 *
 * 默认值全部来自 UI-PARAMS.md 的「当前线上那版」；改这里必须同步那份文档。
 */
export const MW_SCHEMA = [
  /* ---------- 环图·几何 ---------- */
  { key: '环半径', type: 'num', group: '环图·几何', def: 640, min: 200, max: 760, cssVar: '--nt-mw-rout', field: 'rOut' },
  { key: '环厚', type: 'num', group: '环图·几何', def: 44, min: 8, max: 200, cssVar: '--nt-mw-thick', field: 'thick' },
  { key: '扇区分界线宽', type: 'num', group: '环图·几何', def: 0.6, min: 0, max: 10, cssVar: '--nt-mw-sector-w', field: 'sectorW' },
  { key: '扇区分界线不透明度', type: 'num', group: '环图·几何', def: 0.28, min: 0, max: 1, cssVar: '--nt-mw-sector-op', field: 'sectorOp' },
  { key: '弧块描边宽', type: 'num', group: '环图·几何', def: 2.4, min: 0, max: 20, cssVar: '--nt-mw-ring-w', field: 'ringW' },
  { key: '弧块描边不透明度', type: 'num', group: '环图·几何', def: 0.75, min: 0, max: 1, cssVar: '--nt-mw-ring-op', field: 'ringOp' },

  /* ---------- 环图·标签 ---------- */
  { key: '字号下限', type: 'num', group: '环图·标签', def: 12, min: 4, max: 60, cssVar: '--nt-mw-fs-min', field: 'fsMin' },
  { key: '字号上限', type: 'num', group: '环图·标签', def: 27, min: 4, max: 120, cssVar: '--nt-mw-fs-max', field: 'fsMax' },
  { key: '拥挤判定倍数', type: 'num', group: '环图·标签', def: 1.5, min: 0.5, max: 10, cssVar: '--nt-mw-crowded-k', field: 'crowdedK' },
  { key: '拥挤字号下限', type: 'num', group: '环图·标签', def: 18, min: 4, max: 60, cssVar: '--nt-mw-fs-crowd', field: 'fsCrowd' },
  { key: '标签外移', type: 'num', group: '环图·标签', def: 8, min: 0, max: 200, cssVar: '--nt-mw-label-gap', field: 'labelGap' },
  { key: '锥形第一档', type: 'num', group: '环图·标签', def: 46, min: 0, max: 400, cssVar: '--nt-mw-cone-a', field: 'coneA' },
  { key: '锥形第二档', type: 'num', group: '环图·标签', def: 115, min: 0, max: 400, cssVar: '--nt-mw-cone-b', field: 'coneB' },
  { key: '锥形半宽', type: 'num', group: '环图·标签', def: 5, min: 0, max: 60, cssVar: '--nt-mw-cone-half-w', field: 'coneHalfW' },
  { key: '锥形不透明度', type: 'num', group: '环图·标签', def: 0.5, min: 0, max: 1, cssVar: '--nt-mw-cone-op', field: 'coneOp' },
  { key: '锥底文字偏移', type: 'num', group: '环图·标签', def: 10, min: 0, max: 200, cssVar: '--nt-mw-cone-text-gap', field: 'coneTextGap' },

  /* ---------- 环图·线 ---------- */
  { key: '默认线宽', type: 'num', group: '环图·线', def: 2.4, min: 0, max: 30, cssVar: '--nt-mw-w-mid', field: 'wMid' },
  { key: '全局透明度', type: 'num', group: '环图·线', def: 0.52, min: 0, max: 1, cssVar: '--nt-mw-op-global', field: 'opGlobal' },
  { key: '命中透明度', type: 'num', group: '环图·线', def: 0.95, min: 0, max: 1, cssVar: '--nt-mw-op-hit', field: 'opHit' },
  { key: '压暗透明度', type: 'num', group: '环图·线', def: 0.25, min: 0, max: 1, cssVar: '--nt-mw-op-dim', field: 'opDim' },
  { key: '命中带宽度', type: 'num', group: '环图·线', def: 14, min: 2, max: 80, cssVar: '--nt-mw-hit-band', field: 'hitBand' },
  { key: '遮罩不透明度', type: 'num', group: '环图·线', def: 0.55, min: 0, max: 1, cssVar: '--nt-mw-mask-op', field: 'maskOp' },
  { key: '圆心把手比例', type: 'num', group: '环图·线', def: 0.25, min: 0, max: 0.8, cssVar: '--nt-mw-grab-ratio', field: 'grabRatio' },

  /* ---------- 环图·规则 ---------- */
  { key: '分类间隙角', type: 'num', group: '环图·规则', def: 0.8, min: 0, max: 10, cssVar: '--nt-mw-gap-deg', field: 'gapDeg' },
  { key: '追踪深度', type: 'num', group: '环图·规则', def: 12, min: 1, max: 60, cssVar: '--nt-mw-trace-depth', field: 'traceDepth' },
  { key: '追踪非命中线宽', type: 'num', group: '环图·规则', def: 1.2, min: 0, max: 20, cssVar: '--nt-mw-trace-floor', field: 'traceFloor' },
  { key: '命中加权', type: 'num', group: '环图·规则', def: 1.35, min: 1, max: 5, cssVar: '--nt-mw-pick-boost', field: 'pickBoost' },
  { key: '命中收缩', type: 'num', group: '环图·规则', def: 0.45, min: 0, max: 1, cssVar: '--nt-mw-pick-shrink', field: 'pickShrink' },
  { key: '命中额外系数', type: 'num', group: '环图·规则', def: 0.35, min: 0, max: 3, cssVar: '--nt-mw-pick-extra', field: 'pickExtra' },
  { key: '基本模式线宽倍数', type: 'num', group: '环图·规则', def: 0.75, min: 0, max: 3, cssVar: '--nt-mw-base-k', field: 'baseK' },
];

/** 渲染器只认 field：{ rOut: 640, thick: 44, … } */
export const MW_DEFAULTS = MW_SCHEMA.reduce((acc, s) => {
  acc[s.field] = s.def;
  return acc;
}, {});

/** 画布边长（viewBox 单位）。它不是「风格参数」，改了只是整体缩放，所以不进面板。 */
export const MW_SIZE = 6000;
