// 界面：路径 tab
/**
 * 路径页视图（UI 层）
 *
 * 只做「把算好的数据摆到 DOM 上」，不含任何几何/金额计算。
 *
 * 线宽与透明度的**数值**全部来自环图参数（core/mw-settings.js 的 SCHEMA，
 * 运行时由 ui/mw-params.js 从 --nt-mw-* 读出）—— 这里只负责「哪一档乘哪个系数」。
 * 早先这些数是写死的常量，面板调不到，改一次要改代码 + 升版本。
 */

import { renderChart, RATIO } from './mw-svg-renderer.js';
import { MW_DEFAULTS } from '../core/mw-settings.js';
import { ribbonGeometry } from '../graph/mw-chord-shape.js';
import {
  categoryColor, pointAt, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH,
} from '../graph/mw-path-calculator.js';

const el = (id) => document.getElementById(id);

/**
 * 画图 + 绑事件。
 *
 * @param {HTMLElement} host #pw-chart
 * @param {object} data build() 的结果
 * @param {Set<number>|null} hits 命中连线（data.txs 下标）
 * @param {(kind:string, value:any)=>void} onPick
 * @param {{mode?:string|null, dir?:'up'|'down', params?:object}} view
 *   mode：null 基本 / 'acc' 色块 / 'tx' 单线 / 'trace' 追踪
 *   dir ：**本层不再使用**。方向现在只影响「选哪条链」（path.js 的 traceByAccount），
 *         线色固定取转出节点、线宽固定查 FIXED_WIDTH，都与方向无关。
 *   params：环图参数（基准单位）；缺省用 MW_DEFAULTS
 */
export function paintChart(host, data, hits, onPick, view) {
  const p = (view && view.params) || MW_DEFAULTS;
  const colorOf = (key) => categoryColor(data.colorIndex, key);
  const mode = (view && view.mode) || null;

  // 节点专属色：线色与内层弧块色都从这里来（v4.0 §4.2「温度计红泡」）
  const nodeColorOf = data.nodeColorOf || ((id) => colorOf(data.colorKeyOf ? data.colorKeyOf(id) : ''));

  // 追踪模式：漏斗（宽头 6 + 金额占比，细头 1.2）；
  // 其余模式（基本 / 单线 / 色块）：**只有两档线宽** —— 单位弧长的 40% 与 80%。
  const isTrace = mode === 'trace';
  const unitArc = Number(data.unitArcLen) || 0;
  const clampW = (v) => Math.min(MAX_STROKE_WIDTH, Math.max(MIN_STROKE_WIDTH, v));
  // 「默认线宽」在这里是**整体粗细倍率**：2.4 是 1 倍（旧存档里的值就是 2.4，
  // 所以升级后不会突然变粗细）。用户 2026-11 反馈它「调了没反应」—— 之前确实被比例制架空了。
  const wScale = (Number(p.wMid) || MW_DEFAULTS.wMid) / MW_DEFAULTS.wMid;
  const wDefault = clampW(unitArc * p.wDefault * wScale);
  const wHit = clampW(unitArc * p.wHit * wScale);
  let maxAmount = 0;
  for (const c of data.chords) maxAmount = Math.max(maxAmount, Number(c.amount) || 0);
  if (!(maxAmount > 0)) maxAmount = 1;

  const chords = data.chords.map((c) => {
    const hit = hits ? hits.has(c.txIdx) : false;
    // 线宽（2026-11 定稿）：除追踪模式外不再按类型、不再按跳数，就两个值
    //   默认（没命中 / 非命中）= 单位弧长 × 「默认线宽比例」（默认 30%）
    //   命中                      = 单位弧长 × 「命中线宽比例」（默认 60%）
    // 上限 14 / 下限 0.4 是原有护栏：3 笔时单位弧长上千，不钳会糊死整张图。
    let strokeWidth = wDefault;
    if (isTrace) {
      const ratio = Math.max(0, Math.min(1, (Number(c.amount) || 0) / maxAmount));
      strokeWidth = (hit ? (p.funnelWide + ratio * p.funnelWide) : p.traceFloor) * RATIO;
    } else if (hits && hit) {
      strokeWidth = wHit;
    }

    // 变宽线（漏斗）：**只在路径追踪的命中线上**启用。
    // 其余模式等宽 —— 一圈几百条全做成漏斗只会让图更花。
    // 「变细起点比例」控制前多少等宽（默认 0.7 = 后 30% 才收）。
    // 虚拟流水（虚线）例外：虚线只能靠 stroke-dasharray 表达，填充的 ribbon 做不出来。
    const ribbon = isTrace && hit && c.path && !c.dash
      ? ribbonGeometry(
        c.path.from, c.path.c1, c.path.c2, c.path.to,
        strokeWidth, p.funnelThin * RATIO, p.funnelTaper,
      )
      : null;

    return {
      ...c,
      // 线色**永远**等于转出节点的专属色（v4.0 §4.2）
      strokeColor: nodeColorOf(c.from_id),
      // 命中线要在遮罩**之上**（单线模式用它浮出来）
      above: mode === 'tx' && hit,
      ribbon,
      strokeWidth,
      opacity: !hits ? p.opGlobal : (hit ? p.opHit : p.opDim),
    };
  });

  // 追踪模式：每条命中线的转入端贴**两组**文字（2026-11 用户要的）：
  // 追踪文字：**一行**，`层数 金额`，全部落在内弧线内侧（2026-11 用户定）
  //   选中那笔的标记按位置换成 ◀ / ▶（左半边朝左、右半边朝右）
  //   同级兄弟（转入同一账户的其它记录）= 0
  //   向前（钱花到哪）= 1，向后（钱从哪来）= -1/-2/-3…
  // 颜色不在这里定：交给 CSS 的 .mw-amount，浅色主题自动换黑字。
  const steps = (view && view.traceSteps) || null;
  const focusTxId = (view && view.focusTxId) || '';
  const rootIdx = focusTxId ? data.txs.findIndex((t) => t && t.id === focusTxId) : -1;
  const labels = isTrace
    ? data.chords
      .filter((c) => hits && hits.has(c.txIdx) && Number.isFinite(c.aTo))
      .map((c) => {
        const n = steps && steps.has(c.txIdx) ? steps.get(c.txIdx) : null;
        const left = Math.cos(c.aTo) < 0;
        const isRoot = n === 0 && c.txIdx === rootIdx;
        const mark = isRoot ? (left ? '◀' : '▶') : (n == null ? '' : String(n));
        const amount = String(Math.round(Number(c.amount) || 0));
        return { a: c.aTo, text: mark ? `${mark} ${amount}` : amount, left };
      })
    : [];

  host.innerHTML = renderChart({
    blocks: data.blocks,
    chords,
    sectors: data.sectors,
    layers: data.layers,
    labels,
    nodeColorOf,
    pointAt,
    colorOf,
    params: p,
    // 遮罩只在单线模式出现：基本模式 0（不要黑遮罩），色块/追踪维持 0（不再全图压暗）
    maskOpacity: mode === 'tx' ? p.maskOp : 0,
  });

  host.classList.toggle('has-focus', !!hits);

  host.querySelectorAll('.mw-ring').forEach((node) => {
    node.addEventListener('click', () => {
      const acc = node.getAttribute('data-node');
      if (acc) onPick('acc', acc);
    });
  });

  // 线也能点：命中带和可见线都绑同一个回调
  host.querySelectorAll('.mw-hitarea, .mw-chord').forEach((node) => {
    node.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const idx = Number(node.getAttribute('data-tx'));
      if (Number.isFinite(idx)) onPick('tx', idx);
    });
  });
}

/** 空状态（把内部数字也显示出来，便于定位是哪一步变空的） */
export function paintEmpty(info) {
  const i = info || {};
  const detail = [
    `账本流水 ${i.totalTx != null ? i.totalTx : '?'} 笔`,
    `区间 ${i.range ? (i.range.start || '空') + ' ~ ' + (i.range.end || '空') : '?'}`,
    `切片后 ${i.picked != null ? i.picked : '?'} 笔`,
  ].join(' · ');
  el('pw-chart').innerHTML =
    '<div class="pw-empty">这段时间没有可画的流水<br>先在「流水」页记几笔'
    + '<br><small>' + detail + '</small></div>';
  // 左栏现在把表头（.pw-frozen，含筛选行与列标行）也包在 #pw-flow-body 里，
  // 只能清数据行 —— 清空整个容器会把表头一起删掉。
  const body = el('pw-flow-body');
  if (body) {
    for (const n of [...body.querySelectorAll('.pw-flow-row, .pw-flow-empty')]) n.remove();
  }
}
