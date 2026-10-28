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
import { matchAccount } from '../core/query-engine.js';
import { dateInRange } from '../core/date-query.js';
import { money } from '../core/format.js';
import { buildChord, styleOf } from '../graph/mw-path-calculator.js';
import { traceFromTx, traceByAccount } from '../graph/path-tracer.js';
import { SVG } from '../ui/mw-svg-renderer.js';
import { paintChart, paintEmpty } from '../ui/path-view.js';
import {
  bindFlowFilters, paintFlowRows, bindSideToggle, mountPathColResize, mountSideResizer,
  setSideCollapsed, syncToolsTop,
} from '../ui/path-flow-table.js';
import { mountChartGestures } from '../ui/chart-gestures.js';
import { saveTableColWidth } from '../ui/col-save.js';

export function mountPath(section, ctx) {
  const chartBox = section.querySelector('#pw-chart');
  const flowBody = section.querySelector('#pw-flow-body');
  const clearBtn = section.querySelector('#pw-clear');
  const dirBox = section.querySelector('#pw-dir');

  // 焦点只存「根」，不存算出来的链 —— 换方向 / 改筛选后重新算，两边永远一致。
  //   { kind:'acc',   id }    点弧块：这个账户的来路 / 去路
  //   { kind:'tx',    txId }  点线：只看这一根
  //   { kind:'trace', txId }  点侧栏条目：这一笔的整条链
  let focus = null;

  // 追踪方向：up = 逆流（谁把钱给它），down = 顺流（钱又流去哪）
  let dir = 'up';

  let data = null;

  /** 把方向画到那颗按钮上：**一个字** —— 「逆」= 逆流，「顺」= 顺流 */
  function paintDir() {
    if (!dirBox) return;
    const now = dir === 'down' ? '顺流' : '逆流';
    const next = dir === 'down' ? '逆流' : '顺流';
    dirBox.textContent = dir === 'down' ? '顺' : '逆';
    const tip = `追踪方向：${now}，点一下切到${next}`;
    dirBox.setAttribute('aria-label', tip);
    dirBox.setAttribute('aria-pressed', dir === 'down' ? 'true' : 'false');
    dirBox.title = tip;
  }

  // 工具条贴在左栏标题行上（左起、上下居中）：函数在 path-flow-table.js 里，
  // 它要在「切 tab / 收展侧栏 / 改窗口大小」后重新量一次标题行的实际位置。
  syncToolsTop();
  window.addEventListener('resize', syncToolsTop);

  // 展开 / 收起后标题行出现或消失，隔一拍再量一次
  const toggleBtn = section.querySelector('#pw-toggle');
  if (toggleBtn) toggleBtn.addEventListener('click', () => setTimeout(syncToolsTop, 0));

  /** 换方向：**只换画法**（颜色取哪一端、第 4 模式线宽取哪一端），链不动 */
  function setDir(next) {
    dir = next === 'down' ? 'down' : 'up';
    paintDir();
    render();
  }

  if (dirBox) dirBox.addEventListener('click', () => setDir(dir === 'up' ? 'down' : 'up'));
  paintDir();

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
   */
  function build(list) {
    const state = ctx.getState();
    const index = ctx.getIndex();
    const txsIn = list || [];

    if (!txsIn.length) {
      return { empty: true, range: { start: '', end: '' }, picked: 0, sliced: { folded: 0 } };
    }

    const range = rangeOf(txsIn);
    const sliced = fetchGraphData({
      transactions: txsIn,
      accounts: state.accounts,
      range,
      showInternal: true,
    });

    const txs = sliced.txs;
    if (!txs.length) return { empty: true, range, picked: 0, sliced };

    const accOf = (id) => index.byId.get(id) || null;
    const res = computeSlots(txs, { accOf, outerRadius: SVG.rOut });
    const { slots, blocks, sectors, unitArcLen, colorIndex, colorKeyOf, unitDeg } = res;

    const byTx = new Map();
    for (const sl of slots) {
      if (!byTx.has(sl.txIdx)) byTx.set(sl.txIdx, {});
      byTx.get(sl.txIdx)[sl.side] = sl;
    }

    const cx = SVG.size / 2;
    const cy = SVG.size / 2;
    // 线宽要按「离费用端几跳」分层（单文件版的做法）
    const depthOf = computeDepths(txs, accOf);
    const gctx = { byId: index.byId, colorKeyOf, colorIndex, depthOf };

    // 弧块文字要显示账户名
    // 每个账户在图里参与的金额合计（转出 + 转入），拼到标签后面
    const amtOf = new Map();
    for (const t of txs) {
      for (const id of [t.from_id, t.to_id]) {
        if (!id) continue;
        amtOf.set(id, (amtOf.get(id) || 0) + (Number(t.amount) || 0));
      }
    }
    for (const b of blocks) {
      b.label = nameOf(b.acc);
      const amt = amtOf.get(b.acc) || 0;
      // 取整 + 不要千位分隔符（只要 ¥ 和数字）
      b.amountText = amt
        ? money(Math.round(amt)).replace(/\.00$/, '').replace(/,/g, '')
        : '';
    }

    const chords = [];
    // 颜色取哪一端由「那套样式规则」决定：逆流看转入方，顺流看转出方
    const colorBy = styleOf(dir).colorBy;
    for (const [txIdx, pair] of byTx) {
      if (!pair.f || !pair.t || pair.f.empty || pair.t.empty) continue;
      chords.push(buildChord({
        txIdx,
        from_id: txs[txIdx].from_id,
        to_id: txs[txIdx].to_id,
        aFrom: pair.f.mid,
        aTo: pair.t.mid,
        cx,
        cy,
        rIn: SVG.rIn,
        ctx: gctx,
        unitArcLen,
        colorBy,
      }));
    }

    return {
      empty: false, txs, range, sliced, blocks, sectors, chords,
      colorIndex, unitArcLen, unitDeg,
    };
  }

  /* 左栏筛选条件：五个框各自过滤，命中才算进列表 */
  let filter = { date: '', from: '', to: '', amount: '', note: '' };

  /** 按当前筛选条件过滤 tx 下标 */
  function visibleIdx(txs) {
    const f = filter;
    const any = f.date || f.from || f.to || f.amount || f.note;
    if (!any) return txs.map((_, i) => i);

    const idx = ctx.getIndex();

    // 账户列要简码和全名都认（与流水查询页同一份规则：core/query-engine 的 matchAccount）
    const hitAcc = (id, q) => matchAccount(idx && idx.byId ? idx.byId.get(id) : null, q);

    const out = [];
    for (let i = 0; i < txs.length; i += 1) {
      const t = txs[i];
      if (f.date && !dateInRange(t.date, f.date)) continue;
      if (f.from && !hitAcc(t.from_id, f.from)) continue;
      if (f.to && !hitAcc(t.to_id, f.to)) continue;
      if (f.amount && !String(t.amount || '').includes(f.amount)) continue;
      if (f.note && !String(t.note || '').includes(f.note)) continue;
      out.push(i);
    }
    return out;
  }

  /** 当前焦点在图上命中的连线下标（data.txs 下标集）；null = 没有焦点 */
  function hitsFor(f) {
    if (!f || !data || data.empty) return null;
    const idxOf = (id) => data.txs.findIndex((t) => t && t.id === id);

    if (f.kind === 'acc') {
      // 点弧块：只取当前方向的那一侧，不递归。
      // 逆流 = 流入它的线（看来源）；顺流 = 从它流出的线（看去向）。
      // 颜色取当前方向的锚点端，也就是它自己 → 这一圈线全是它的颜色。
      return new Set(traceByAccount(data.txs, f.id, dir));
    }
    if (f.kind === 'tx') {
      // 模式 2（点单线）：**只点亮这一根**。
      // 早先这里用了 traceUpstream（整条上游链），所以一点就亮一片。
      const i = idxOf(f.txId);
      return i < 0 ? null : new Set([i]);
    }
    if (f.kind === 'trace') {
      // 模式 4（点侧栏条目）：支出倒推链，**两个方向看到的是同一批线**
      const i = idxOf(f.txId);
      return i < 0 ? null : new Set(traceFromTx(data.txs, i).linkIndices);
    }
    return null;
  }

  /* ---------- 渲染 ---------- */

  bindFlowFilters({
    setFilter: (key, value) => { filter[key] = value; render(); },
    onClear: () => {
      filter = { date: '', from: '', to: '', amount: '', note: '' };
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

  /* ---------- 点绘图区 → 左栏自动收回 ---------- */
  // 用 pointerdown/up 判「点」而不是 click：线/弧块上的 click 会 stopPropagation，
  // 挂在容器的 click 上收不到；而且拖动、双指、长按都不该算点击。
  //
  // 只记「最后一次按下的那一指」，不维护活动指针集合 ——
  // 手指移出绘图区再松开时这里收不到 pointerup，集合会漏项，
  // 之后每一次点击都被判成「多指」而失效。单变量下次按下自然覆盖，不会漏。
  let tap = null;
  chartBox.addEventListener('pointerdown', (ev) => {
    const leftButton = ev.pointerType !== 'mouse' || ev.button === 0;
    tap = leftButton
      ? { x: ev.clientX, y: ev.clientY, t: Date.now(), id: ev.pointerId }
      : null;
  });
  chartBox.addEventListener('pointerup', (ev) => {
    const t = tap;
    tap = null;
    if (!t || t.id !== ev.pointerId) return;
    if (Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > 8) return;   // 平移 / 旋转
    if (Date.now() - t.t > 700) return;                              // 长按起手
    setSideCollapsed(true);
    setTimeout(syncToolsTop, 0);   // 标题行收起来了 → 用估算值重新贴齐
  });
  chartBox.addEventListener('pointercancel', () => { tap = null; });

  function render() {
    syncToolsTop();
    // 先按左栏筛选框过滤，再拿结果去画图 —— 图的统计范围就是筛选结果
    const st0 = ctx.getState();
    const allTx = (st0.transactions || []).filter((t) => t && !t.opening);
    const idxList = visibleIdx(allTx);
    const shownTxs = idxList.map((i) => allTx[i]);

    data = build(shownTxs);

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
    // dir 只影响颜色（取哪一端）与 trace 模式的线宽（取哪一端）
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
    }, { mode: focus ? focus.kind : null, dir });

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
    // 方向放在最前面：它现在只表示「这条链按哪一端着色 / 取线宽」。
    const dirText = dir === 'down' ? '顺流' : '逆流';
    const focusName = focus && focus.kind === 'acc' ? ' · ' + nameOf(focus.id) : '';
    const emptyHint = emptyChain
      ? (focus && focus.kind === 'acc'
        ? (dir === 'down' ? ' · 没有从它流出的线' : ' · 没有流入它的线')
        : ' · 没有相连的线')
      : '';
    ctx.setFooter(`路径追踪 · ${dirText}${focusName}${emptyHint}`
      + ` · ${data.txs.length} 笔 · ${data.blocks.length} 块`
      + ` · ${data.unitDeg.toFixed(3)}°/单位 · ${data.unitArcLen.toFixed(2)}px/弧长`
      + (data.sliced.folded ? ` · 折叠 ${data.sliced.folded}` : '')
      + (hitIds ? ` · 已高亮 ${hitIds.size}` : ''));
  }

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

/**
 * 链路层级：费用类账户 = 0 级，反向沿「谁给它转过钱」逐级上溯。
 * 照单文件版的 computeDepth —— 线宽按这个层级取档（越靠近支出越粗）。
 * 一条路都通不到费用端的（孤立账户 / 纯收入）给最深层级 + 1。
 */
function computeDepths(txs, accOf) {
  const byTo = new Map();
  for (const x of txs) {
    if (!x.from_id || !x.to_id) continue;
    if (!byTo.has(x.to_id)) byTo.set(x.to_id, []);
    byTo.get(x.to_id).push(x.from_id);
  }

  const depth = new Map();
  const queue = [];

  for (const x of txs) {
    for (const id of [x.from_id, x.to_id]) {
      if (!id || depth.has(id)) continue;
      const a = accOf(id);
      if (a && a.type === '费用类') { depth.set(id, 0); queue.push(id); }
    }
  }

  let guard = 0;
  while (queue.length && guard < 5000) {
    guard += 1;
    const cur = queue.shift();
    for (const up of byTo.get(cur) || []) {
      if (up && !depth.has(up)) { depth.set(up, depth.get(cur) + 1); queue.push(up); }
    }
  }

  let maxD = 0;
  for (const v of depth.values()) if (v > maxD) maxD = v;
  for (const x of txs) {
    for (const id of [x.from_id, x.to_id]) {
      if (id && !depth.has(id)) depth.set(id, maxD + 1);
    }
  }
  return depth;
}
