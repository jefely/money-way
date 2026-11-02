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

export const MW_GROUPS = ['环图·几何', '环图·标签', '环图·线', '环图·追踪', '环图·规则'];

/**
 * 每项：key（面板/导出用的中文键）、group、def、min、max、cssVar、field。
 * field 是渲染器读的名字（英文），面板只认 key。
 *
 * 默认值全部来自 UI-PARAMS.md 的「当前线上那版」；改这里必须同步那份文档。
 */
export const MW_SCHEMA = [
  /* ---------- 环图·几何 ---------- */
  { key: '环半径', type: 'num', group: '环图·几何', def: 640, min: 200, max: 760, cssVar: '--nt-mw-rout', field: 'rOut' },
  { key: '环厚', type: 'num', group: '环图·几何', def: 80, min: 8, max: 200, cssVar: '--nt-mw-thick', field: 'thick' },
  // 外圈那条细线（六大类节点类型）的粗细，以及它与内圈节点环之间的空隙。
  // 两个都是**环厚的比例**：0.1 = 环厚的十分之一，0 = 贴死不留缝。
  { key: '外圈线厚比例', type: 'num', group: '环图·几何', def: 0.1, min: 0.01, max: 0.5, cssVar: '--nt-mw-type-w', field: 'typeWidth' },
  { key: '外圈线间距比例', type: 'num', group: '环图·几何', def: 0, min: 0, max: 0.3, cssVar: '--nt-mw-type-gap', field: 'typeGap' },
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
  // 除追踪模式外，线宽只有一个来源：**单位弧长 × 比例**。
  // 默认值 22%，命中（点中那一条 / 点中弧块那一圈）32% —— 用户 2026-11 定稿。
  { key: '默认线宽比例', type: 'num', group: '环图·线', def: 0.2, min: 0, max: 2, cssVar: '--nt-mw-w-default', field: 'wDefault' },
  { key: '命中线宽比例', type: 'num', group: '环图·线', def: 0.32, min: 0, max: 2, cssVar: '--nt-mw-w-hit', field: 'wHit' },
  { key: '全局透明度', type: 'num', group: '环图·线', def: 0.8, min: 0, max: 1, cssVar: '--nt-mw-op-global', field: 'opGlobal' },
  { key: '命中透明度', type: 'num', group: '环图·线', def: 0.9, min: 0, max: 1, cssVar: '--nt-mw-op-hit', field: 'opHit' },
  { key: '压暗透明度', type: 'num', group: '环图·线', def: 0.2, min: 0, max: 1, cssVar: '--nt-mw-op-dim', field: 'opDim' },
  { key: '命中带宽度', type: 'num', group: '环图·线', def: 14, min: 2, max: 80, cssVar: '--nt-mw-hit-band', field: 'hitBand' },
  { key: '遮罩不透明度', type: 'num', group: '环图·线', def: 0.55, min: 0, max: 1, cssVar: '--nt-mw-mask-op', field: 'maskOp' },
  { key: '圆心把手比例', type: 'num', group: '环图·线', def: 0.4, min: 0, max: 0.8, cssVar: '--nt-mw-grab-ratio', field: 'grabRatio' },
  // 漏斗线（只在**路径追踪**的命中线上启用，见 ui/path-view.js）：
  //   宽头 = 漏斗宽头 + 金额占比 × 漏斗宽头（最大的一笔拿到两倍宽头）
  //   细头 = 漏斗细头
  // 其余模式走「单位弧长 × 比例」两档线宽，两头同宽。
  { key: '漏斗宽头', type: 'num', group: '环图·追踪', def: 4, min: 0, max: 30, cssVar: '--nt-mw-funnel-wide', field: 'funnelWide' },
  { key: '漏斗细头', type: 'num', group: '环图·追踪', def: 1.2, min: 0, max: 30, cssVar: '--nt-mw-funnel-thin', field: 'funnelThin' },
  // 变细从这条线的百分之多少开始：0.5 = 前半段等宽、后半段一路收到细头；
  // 调到 1 就是全程等宽（不收尖），调到 0.2 就是从两成处开始慢慢收。
  // 2026-11 从 0.7 调到 0.5 —— 0.7 时只有最后三成收窄，短线上一眼看不出来。
  { key: '变细起点比例', type: 'num', group: '环图·追踪', def: 0.5, min: 0, max: 1, cssVar: '--nt-mw-funnel-taper', field: 'funnelTaper' },

  /* ---------- 环图·追踪（2026-11 从「线」「规则」里独立出来） ----------
     追踪模式有自己的一套视觉：漏斗、链深、非命中压暗。
     单独成组之后，面板上一个标签就能看全，不用在两组之间来回找。 */
  // 追踪深度：单侧最多追几跳。**0 = 不限**（靠已访问集合自然终止）。
  // 2026-11 默认从 12 提到 50 —— 12 跳在真实账本里常常把链截断在半路。
  { key: '追踪深度', type: 'num', group: '环图·追踪', def: 60, min: 0, max: 500, cssVar: '--nt-mw-trace-depth', field: 'traceDepth' },
  { key: '追踪非命中线宽', type: 'num', group: '环图·追踪', def: 1.2, min: 0, max: 20, cssVar: '--nt-mw-trace-floor', field: 'traceFloor' },

  /* ---------- 环图·规则 ---------- */
  { key: '分类间隙角', type: 'num', group: '环图·规则', def: 0.8, min: 0, max: 10, cssVar: '--nt-mw-gap-deg', field: 'gapDeg' },
  // 0 = 按流水笔数分弧段（每笔占 2 个单位）；1 = 按金额占比分弧段。
  // 两套模式都保留：笔数看的是「钱动了多少次」，金额看的是「钱有多少」。
  { key: '粒度模式（0笔数 1金额）', type: 'num', group: '环图·规则', def: 0, min: 0, max: 1, cssVar: '--nt-mw-unit-mode', field: 'unitMode' },
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
