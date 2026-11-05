// 界面：路径 tab
/**
 * 路径视图（Money Way 环网图）
 * 层：第五层 · UI
 *
 * 引擎在 graph/（切片 → 槽位 → 路径），渲染在 ui/mw-svg-renderer.js，
 * 本文件只做装配：取 state → 调三层 → 交给 ui/path-view.js 画。
 *
 * **不需要再输密码**：主应用解锁时 state 已在内存里。
 */

import { fetchGraphData } from '../graph/mw-data-fetcher.js';
import { computeSlots } from '../graph/mw-slot-calculator.js';
import { visibleIdx, emptyFilter, commitNodeValue } from '../ui/path-filter.js';
import { money } from '../core/format.js';
import { buildChord } from '../graph/mw-path-calculator.js';
import { buildArcs, nodeColor } from '../graph/mw-layers.js';
import { traceFlowPath, traceByAccount, sideForType } from '../graph/path-tracer.js';
import { computeDepths } from '../graph/mw-depth.js';
import { chartSize } from '../ui/mw-svg-renderer.js';
import { readMwParams, onLayoutChange } from '../ui/mw-params.js';
import { paintChart, paintEmpty } from '../ui/path-view.js';
import {
  bindFlowFilters, paintFlowRows, bindSideToggle, mountPathColResize, mountSideResizer,
  setSideCollapsed, syncToolsTop,
} from '../ui/path-flow-table.js';
import { mountChartGestures } from '../ui/chart-gestures.js';
import { saveTableColWidth } from '../ui/col-save.js';
import { traceSeqText, logTraceChain } from '../ui/path-debug.js';

export function mountPath(section, ctx) {
  const chartBox = section.querySelector('#pw-chart');
  const flowBody = section.querySelector('#pw-flow-body');
  const clearBtn = section.querySelector('#pw-clear');

  // 焦点只存「根」，不存算出来的链 —— 改筛选后重新算，两边永远一致。
  //   { kind:'acc',   id }    点弧块：按类型决定看哪一侧（见 ACC_SIDE）
  //   { kind:'tx',    txId }  点线：只看这一根
  //   { kind:'trace', txId }  点侧栏条目：这一笔的整条链
  let focus = null;

  let data = null;

  // 工具条贴在左栏标题行上（左起、上下居中）：函数在 path-flow-table.js 里，
  // 它要在「切 tab / 收展侧栏 / 改窗口大小」后重新量一次标题行的实际位置。
  syncToolsTop();
  window.addEventListener('resize', syncToolsTop);

  // 展开 / 收起后标题行出现或消失，隔一拍再量一次
  const toggleBtn = section.querySelector('#pw-toggle');
  if (toggleBtn) toggleBtn.addEventListener('click', () => setTimeout(syncToolsTop, 0));

  if (clearBtn) {
    clearBtn.addEventListener('click', () => { focus = null; render(); });
  }

  const nameOf = (id) => {
    const a = ctx.getIndex().byId.get(id);
    return a ? a.name : '—';
  };

  /* ---------- 取数 + 算图 ---------- */

  /**
   * 取数 + 算图。
   * @param {Array} list 要画的流水 —— **就是左栏筛选后的结果**，
   *   不是全账本。用户要求「图的统计范围完全由左边筛选框决定」。
   * @param {object} p 环图参数（基准单位，见 ui/mw-params.js）
   */
  function build(list, p) {
    const state = ctx.getState();
    const index = ctx.getIndex();
    const txsIn = list || [];

    if (!txsIn.length) {
      return { empty: true, range: { start: '', end: '' }, picked: 0, sliced: { folded: 0 }, params: p };
    }

    const range = rangeOf(txsIn);
    const sliced = fetchGraphData({
      transactions: txsIn,
      accounts: state.accounts,
      range,
      showInternal: true,
    });

    const txs = sliced.txs;
    if (!txs.length) return { empty: true, range, picked: 0, sliced, params: p };

    const accOf = (id) => index.byId.get(id) || null;
    // 半径与环厚都来自面板：computeSlots 只要外半径，内半径给渲染器用
    const box = chartSize(p);
    const res = computeSlots(txs, {
      accOf, outerRadius: box.rOut, gapDeg: p.gapDeg, unitMode: p.unitMode,
    });
    const { slots, blocks, sectors, unitArcLen, colorIndex, colorKeyOf, unitDeg } = res;

    const byTx = new Map();
    for (const sl of slots) {
      if (!byTx.has(sl.txIdx)) byTx.set(sl.txIdx, {});
      byTx.get(sl.txIdx)[sl.side] = sl;
    }

    const cx = box.size / 2;
    const cy = box.size / 2;
    // 线宽要按「离费用端几跳」分层（单文件版的做法）
    const depthOf = computeDepths(txs, accOf);
    const gctx = { byId: index.byId, colorKeyOf, colorIndex, depthOf };

    // 弧块文字要显示账户名
    // 每个账户在图里的**净额**（转入 − 转出，取绝对值），与金额粒度的弧段口径一致：
    // 用户 2026-11 定「同分类按净额占比分」，标签就不能再显示收付合计，否则又是两张皮。
    const amtOf = new Map();
    for (const t of txs) {
      const amt = Number(t.amount) || 0;
      if (t.from_id) amtOf.set(t.from_id, (amtOf.get(t.from_id) || 0) - amt);
      if (t.to_id) amtOf.set(t.to_id, (amtOf.get(t.to_id) || 0) + amt);
    }
    for (const b of blocks) {
      b.label = nameOf(b.acc);
      const amt = Math.abs(amtOf.get(b.acc) || 0);
      // 取整 + 不要千位分隔符（只要 ¥ 和数字）
      b.amountText = amt
        ? money(Math.round(amt)).replace(/\.00$/, '').replace(/,/g, '')
        : '';
    }

    const chords = [];
    // 颜色不再分方向：线色永远取**转出节点**的专属色（path-view 里覆盖 strokeColor）。
    // colorBy 仍传 'from'，只是为了让 buildChord 的默认值与最终结果一致。
    for (const [txIdx, pair] of byTx) {
      if (!pair.f || !pair.t || pair.f.empty || pair.t.empty) continue;
      chords.push(buildChord({
        txIdx,
        from_id: txs[txIdx].from_id,
        to_id: txs[txIdx].to_id,
        amount: txs[txIdx].amount,
        aFrom: pair.f.mid,
        aTo: pair.t.mid,
        cx,
        cy,
        rIn: box.rIn,
        ctx: gctx,
        unitArcLen,
        colorBy: 'from',
      }));
    }

    // 三层套娃：外层类型 / 中层分类（角度是内层的聚合视图，不另算）
    const layers = buildArcs(slots);

    // 节点专属色：**按类型分组、按类型内总数均匀分布色相**。
    // 关键不再是「相邻拉开」，而是「同类型任意两个都拉开」——
    // 资产类内部有互转，隔得远的两个节点线也会交叉，颜色太近就分不清。
    const accIds = [...new Set(txs.flatMap((t) => [t.from_id, t.to_id]).filter(Boolean))]
      .sort((a, b) => (nameOf(a) < nameOf(b) ? -1 : nameOf(a) > nameOf(b) ? 1 : 0));
    const byType = new Map();
    for (const id of accIds) {
      const acc = ctx.getIndex().byId.get(id);
      const t = (acc && acc.type) || '其它';
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(id);
    }
    const nodeIdx = new Map();
    let typeSeq = 0;
    for (const ids of byType.values()) {
      ids.forEach((id, i) => nodeIdx.set(id, { i, n: ids.length, off: typeSeq * 37 }));
      typeSeq += 1;
    }

    return {
      empty: false, txs, range, sliced, blocks, sectors, chords, layers,
      colorIndex, unitArcLen, unitDeg, params: p,
      nodeColorOf: (id) => {
        const c = nodeIdx.get(id) || { i: 0, n: 1, off: 0 };
        return nodeColor(c.i, c.n, c.off);
      },
    };
  }

  /* 左栏筛选条件：五个框各自过滤，命中才算进列表（规则在 ui/path-filter.js） */
  let filter = emptyFilter();

  /** 按当前筛选条件过滤 tx 下标 */
  function visibleIdxOf(txs) {
    const idx = ctx.getIndex();
    return visibleIdx(txs, filter, idx && idx.byId, ctx.getState().accounts || []);
  }

  /** 当前焦点在图上命中的连线下标（data.txs 下标集）；null = 没有焦点 */
  let traceSteps = new Map();
  function hitsFor(f) {
    if (!f || !data || data.empty) return null;
    const idxOf = (id) => data.txs.findIndex((t) => t && t.id === id);

    if (f.kind === 'acc') {
      // 点弧块：**按类型**决定看哪一侧（sideForType），不再有方向开关。
      // 中转站（资产/负债/成本）两头都看，源头（收入/权益）只看转出，终点（费用）只看转入。
      const acc = ctx.getIndex().byId.get(f.id);
      const side = sideForType(acc && acc.type);
      return new Set(traceByAccount(data.txs, f.id, side));
    }
    if (f.kind === 'tx') {
      // 模式 2（点单线）：**只点亮这一根**。
      // 早先这里用了 traceUpstream（整条上游链），所以一点就亮一片。
      const i = idxOf(f.txId);
      return i < 0 ? null : new Set([i]);
    }
    if (f.kind === 'trace') {
      // 模式 4（点侧栏条目）：**资金路径**（2026-11）。
      // 「同一个节点」按 ID 判等，**同名账户也算同一个** —— 账本合并/迁移会留下
      // 名字一样但 ID 不同的账户，严格按 ID 匹配时追踪会在那里断掉，
      // 用户看到的就是「这笔明明转进同一个钱包却没被追到」。
      const i = idxOf(f.txId);
      if (i < 0) return null;
      const maxDepth = data.params ? data.params.traceDepth : undefined;
      // 名字为「—」表示账户表里根本没有它（断链），不能拿它当匹配依据，
      // 否则两个不存在的账户会被当成同一个节点。
      const nameOk = (id) => {
        const n = nameOf(id);
        return n && n !== '—' ? n : '';
      };
      const path = traceFlowPath(data.txs, i, {
        maxDepth,
        sameAccount: (a, b) => a === b || (!!nameOk(a) && nameOk(a) === nameOk(b)),
      });
      traceSteps = path.steps;
      return new Set(path.linkIndices);
    }
    return null;
  }

  /* ---------- 渲染 ---------- */

  bindFlowFilters({
    setFilter: (key, value) => { filter[key] = value; render(); },
    // 转出 / 转入：回车或失焦才走到这里 —— 先把简码换成节点名字，再筛
    commitNode: (key, el) => {
      el.value = commitNodeValue(ctx.getState().accounts || [], el.value);
      filter[key] = el.value;
      render();
    },
    onClear: () => {
      filter = emptyFilter();
      for (const k of ['date', 'from', 'to', 'amount', 'note']) {
        const el = document.getElementById('pw-qf-' + k);
        if (el) el.value = '';
      }
      focus = null;
      render();
    },
  });
  bindSideToggle();
  mountSideResizer();

  // 路径表是 div + grid，列宽拖动单独挂一套（拖动改 --nt-col-path-<列>，松手存进参数）
  mountPathColResize(document.getElementById('pw-flow-head'), {
    saveTableColWidth: (table, col, w) => saveTableColWidth(ctx, table, col, w),
  });

  /* ---------- 点侧栏以外 → 左栏自动收回 ---------- */
  // 用 pointerdown/up 判「点」而不是 click：图上的线/弧块会 stopPropagation click，
  // 挂在容器的 click 上收不到；而且拖动、双指、长按都不该算点击。
  //
  // 监听挂在**整个路径视图**上（用户 2026-10-29：点侧栏以外的任何地方都收），
  // 但排除侧栏内部和左上角的收展按钮 —— 点「展开」时不能被这里立刻又收起。
  //
  // 只记「最后一次按下的那一指」，不维护活动指针集合 ——
  // 手指移出视图再松开时这里收不到 pointerup，集合会漏项，
  // 之后每一次点击都被判成「多指」而失效。单变量下次按下自然覆盖，不会漏。
  let tap = null;
  section.addEventListener('pointerdown', (ev) => {
    const leftButton = ev.pointerType !== 'mouse' || ev.button === 0;
    tap = leftButton
      ? { x: ev.clientX, y: ev.clientY, t: Date.now(), id: ev.pointerId }
      : null;
  });
  section.addEventListener('pointerup', (ev) => {
    const t = tap;
    tap = null;
    if (!t || t.id !== ev.pointerId) return;
    if (Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > 8) return;   // 平移 / 旋转
    if (Date.now() - t.t > 700) return;                              // 长按起手
    const el = ev.target;
    if (el && el.closest && (el.closest('#pw-side') || el.closest('#pw-toggle'))) return;
    setSideCollapsed(true);
    setTimeout(syncToolsTop, 0);   // 标题行收起来了 → 用估算值重新贴齐
  });
  section.addEventListener('pointercancel', () => { tap = null; });

  function render() {
    syncToolsTop();
    // 环图参数：半径/环厚/字号/线宽/透明度都在这里，改一项面板就重排一次
    const p = readMwParams();
    // 先按左栏筛选框过滤，再拿结果去画图 —— 图的统计范围就是筛选结果
    const st0 = ctx.getState();
    const allTx = (st0.transactions || []).filter((t) => t && !t.opening);
    const idxList = visibleIdxOf(allTx);
    const shownTxs = idxList.map((i) => allTx[i]);

    data = build(shownTxs, p);

    if (data.empty) {
      paintEmpty({
        totalTx: allTx.length,
        range: data.range,
        picked: shownTxs.length,
      });
      ctx.setFooter(shownTxs.length
        ? '路径追踪 · 这批流水画不出图'
        : '路径追踪 · 按当前筛选没有流水');
      return;
    }

    // 根流水被筛掉了：焦点跟着消失（否则会留下「高亮 0 条」的假状态）
    if (focus && focus.txId && !data.txs.some((t) => t && t.id === focus.txId)) {
      focus = null;
    }

    const hits = hitsFor(focus);

    // 链是空的（收入类账户没有上游）时**不压暗整张图**：
    // 一进页面全图变暗会像「图坏了」，改用页脚说明。
    const emptyChain = !!hits && hits.size === 0;

    // 图吃「下标集」，左栏吃「流水 id 集」——这是两套不同的索引：
    // hits 是 data.txs（图的那批）的下标，左栏列的是筛选后的流水。
    // 混着用会让高亮永远错行，看起来就是「数据表和图形链接不上」。
    const hitIds = hits && !emptyChain
      ? new Set([...hits].map((i) => (data.txs[i] || {}).id).filter(Boolean))
      : null;

    // 四种模式的线宽在 paintChart 里各自独立：
    //   mode=null 基本模式 / 'acc' 点色块 / 'tx' 点单线 / 'trace' 侧栏追踪
    // 方向开关已取消（2026-11）：线色永远取转出节点，点弧块看哪一侧由类型决定。
    paintChart(chartBox, data, emptyChain ? null : hits, (kind, value) => {
      if (kind === 'acc') {
        const same = focus && focus.kind === 'acc' && focus.id === value;
        focus = same ? null : { kind: 'acc', id: value };
      } else {
        // 点线：value 是 data.txs 的下标，焦点只记这笔的 id
        const tx = data.txs[value] || {};
        if (!tx.id) return;
        const same = focus && focus.kind === 'tx' && focus.txId === tx.id;
        focus = same ? null : { kind: 'tx', txId: tx.id };
      }
      render();
    }, {
      // focusTxId：让渲染层知道哪一笔是「选中」的 —— 它在环上标 ▶，和同级的 0 区分开
      mode: focus ? focus.kind : null, params: p, traceSteps,
      focusType: focus && focus.kind === 'acc' ? (ctx.getIndex().byId.get(focus.id) || {}).type || '' : '',
      focusTxId: focus && focus.txId ? focus.txId : '',
    });

    // 手势要在 paintChart **之后**挂：svg 是 paintChart 里才创建的。
    //
    // 而且每次重绘（点弧块、改筛选条件）都会重建 <svg>，新元素没有 transform ——
    // 之前只在第一次挂手势，所以点一下图就「跳回 1 倍」看起来像点击导致缩放。
    // 这里每次重绘后都把当前视图状态重新套上去。
    let gestures = chartBox.__gestures || null;
    if (!gestures) {
      const svgEl = chartBox.querySelector('svg');
      if (svgEl) gestures = mountChartGestures(chartBox, svgEl);
    }
    if (gestures && typeof gestures.apply === 'function') gestures.apply();

    // 左栏：流水查询表 —— 与图用同一份筛选结果（allTx/idxList/shownTxs 在 render 开头算好）
    paintFlowRows(flowBody, {
      txs: shownTxs,
      hits: hitIds,
      focusId: focus && focus.txId ? focus.txId : null,
      nameOf,
      onPick: (shownIdx) => {
        const tx = shownTxs[shownIdx];
        if (!tx || !tx.id) return;
        // 侧栏条目 → 追踪模式（第 4 种）：方向由左上角那颗按钮决定
        const same = focus && focus.kind === 'trace' && focus.txId === tx.id;
        focus = same ? null : { kind: 'trace', txId: tx.id };
        render();
      },
    });

    // 图的参数压成一行放页脚（和其它页一样在屏幕底部），左栏不再占一块高度给统计。
    // 方向开关已取消：点弧块看哪一侧由类型决定，页脚把这件事说清楚即可。
    const focusName = focus && focus.kind === 'acc' ? ' · ' + nameOf(focus.id) : '';
    const emptyHint = emptyChain
      ? (focus && focus.kind === 'acc' ? ' · 这个节点没有相连的线' : ' · 没有相连的线')
      : '';
    ctx.setFooter(`路径追踪${focusName}${emptyHint}`
      + ` · ${data.txs.length} 笔 · ${data.blocks.length} 块`
      + ` · ${data.unitDeg.toFixed(3)}°/单位 · ${data.unitArcLen.toFixed(2)}px/弧长`
      + (data.sliced.folded ? ` · 折叠 ${data.sliced.folded}` : '')
      + (hitIds ? ` · 已高亮 ${hitIds.size}` : '')
      + (focus && focus.kind === 'trace' ? traceSeqText(traceSteps) : ''));

    if (typeof location !== 'undefined' && String(location.search).includes('debug=1')
        && focus && focus.kind === 'trace') {
      logTraceChain(data.txs, traceSteps, nameOf);
    }
  }

  // 界面参数面板改了环图参数 → 立刻重排这张图（订阅里已先让参数缓存失效）。
  // 7 个视图都是常驻的，隐藏时不重画：不可见时 syncToolsTop 也量不到标题行位置。
  onLayoutChange(() => {
    if (section.hidden) return;
    render();
  });

  return { render };
}

/** 一批流水的日期区间（图的范围 = 这批流水的范围，不再看全账本） */
function rangeOf(list) {
  const dates = (list || [])
    .map((t) => String((t && t.date) || ''))
    .filter(Boolean)
    .sort();
  return dates.length
    ? { start: dates[0], end: dates[dates.length - 1] }
    : { start: '', end: '' };
}
