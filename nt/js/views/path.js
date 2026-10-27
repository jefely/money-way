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
import { buildChord } from '../graph/mw-path-calculator.js';
import { traceUpstream, traceByAccount } from '../graph/path-tracer.js';
import { SVG } from '../ui/mw-svg-renderer.js';
import { paintChart, paintList, paintEmpty } from '../ui/path-view.js';
import {
  bindFlowFilters, paintFlowRows, bindSideToggle, mountPathColResize, mountSideResizer,
} from '../ui/path-flow-table.js';
import { mountChartGestures } from '../ui/chart-gestures.js';
import { saveTableColWidth } from '../ui/col-save.js';

export function mountPath(section, ctx) {
  const chartBox = section.querySelector('#pw-chart');
  const flowBody = section.querySelector('#pw-flow-body');
  const titleBox = section.querySelector('#pw-side-title');
  const hintBox = section.querySelector('#pw-hint');
  const clearBtn = section.querySelector('#pw-clear');

  let focus = null;      // { kind:'acc'|'tx', id }
  let data = null;

  if (clearBtn) {
    clearBtn.addEventListener('click', () => { focus = null; render(); });
  }

  const nameOf = (id) => {
    const a = ctx.getIndex().byId.get(id);
    return a ? a.name : '—';
  };

  /* ---------- 取数 + 算图 ---------- */

  function build() {
    const state = ctx.getState();
    const index = ctx.getIndex();

    const range = rangeOfAll(state);
    const sliced = fetchGraphData({
      transactions: state.transactions,
      accounts: state.accounts,
      range,
      showInternal: true,
      topN: 24,
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
    const gctx = { byId: index.byId, colorKeyOf, colorIndex };

    const chords = [];
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

  function hitsFor(f) {
    if (!f || !data || data.empty) return null;
    if (f.kind === 'acc') return new Set(traceByAccount(data.txs, f.id));
    if (f.kind === 'tx') {
      // f.id 现在指向「全部流水」的下标，不是 data.txs（图上子集）的下标，
      // 所以不能再用 data.txs[f.id] 取值 —— 用点选时记下的 to_id。
      const toId = f.to_id || (data.txs[f.id] && data.txs[f.id].to_id);
      if (!toId) return null;
      return new Set(traceUpstream(data.txs, toId).linkIndices);
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

  function render() {
    data = build();

    if (data.empty) {
      paintEmpty({
        totalTx: (ctx.getState().transactions || []).length,
        range: data.range,
      });
      ctx.setFooter('路径追踪 · 这段时间没有可画的流水');
      return;
    }

    const hits = hitsFor(focus);

    // 图吃「下标集」，左栏吃「流水 id 集」——这是两套不同的索引：
    // hits 是 data.txs（图的那批）的下标，左栏列的是全量流水。
    // 之前把下标直接喂给左栏，高亮永远是错行，看起来就是「数据表和图形链接不上」。
    const hitIds = hits
      ? new Set([...hits].map((i) => (data.txs[i] || {}).id).filter(Boolean))
      : null;

    paintChart(chartBox, data, hits, (acc) => {
      const same = focus && focus.kind === 'acc' && focus.id === acc;
      focus = same ? null : { kind: 'acc', id: acc };
      render();
    });

    // 手势要在 paintChart **之后**挂：svg 是 paintChart 里才创建的。
    // 没拿到就留到下次重绘再试（所以不在 dataset 上提前打标）。
    if (chartBox && !chartBox.dataset.gestures) {
      const svgEl = chartBox.querySelector('svg');
      if (svgEl) {
        chartBox.dataset.gestures = '1';
        mountChartGestures(chartBox, svgEl);
      }
    }

    // 左栏：流水查询表 —— 列**全部**流水，不只是图上画出来的那几笔。
    // 期初流水不列：图上不画它（它是背景板，不是资金流动），
    // 列出来就成了一串「000101 期初余额 → 某账户」永远高亮不到的行。
    const allTx = (ctx.getState().transactions || []).filter((t) => t && !t.opening);
    const idxList = visibleIdx(allTx);
    const shownTxs = idxList.map((i) => allTx[i]);

    paintFlowRows(flowBody, {
      txs: shownTxs,
      hits: hitIds,
      focusIndex: focus && focus.kind === 'tx' ? idxList.indexOf(focus.id) : null,
      nameOf,
      onPick: (shownIdx) => {
        const realIdx = idxList[shownIdx];
        const tx = allTx[realIdx];
        // 图上按「转出账户」的上游追踪；这里把 to_id 交给 hitsFor 一致处理
        const same = focus && focus.kind === 'tx' && focus.id === realIdx;
        focus = same ? null : { kind: 'tx', id: realIdx, to_id: tx && tx.to_id };
        render();
      },
    });

    titleBox.textContent = focus && focus.kind === 'acc' ? nameOf(focus.id) : '路径追踪';
    hintBox.textContent = hits
      ? `已高亮 ${hits.size} 条 · 点「清空」看全图`
      : '点弧块看它的来路与去向';

    // 图的参数压成一行放页脚（和其它页一样在屏幕底部），左栏不再占一块高度给统计
    ctx.setFooter(`路径追踪 · ${data.txs.length} 笔 · ${data.blocks.length} 块`
      + ` · ${data.unitDeg.toFixed(3)}°/单位 · ${data.unitArcLen.toFixed(2)}px/弧长`
      + ` · 折叠 ${data.sliced.folded}`
      + (hits ? ` · 已高亮 ${hits.size}` : ''));
  }

  return { render };
}

function rangeOfAll(state) {
  const dates = (state.transactions || [])
    .map((t) => String(t.date || ''))
    .filter(Boolean)
    .sort();
  return dates.length
    ? { start: dates[0], end: dates[dates.length - 1] }
    : { start: '', end: '' };
}
