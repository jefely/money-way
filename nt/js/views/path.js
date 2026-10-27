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
import { buildChord } from '../graph/mw-path-calculator.js';
import { traceUpstream, traceByAccount } from '../graph/path-tracer.js';
import { SVG } from '../ui/mw-svg-renderer.js';
import { paintChart, paintList, paintStats, paintEmpty } from '../ui/path-view.js';

export function mountPath(section, ctx) {
  const chartBox = section.querySelector('#pw-chart');
  const listBox = section.querySelector('#pw-list');
  const statsBox = section.querySelector('#pw-stats');
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

  function hitsFor(f) {
    if (!f || !data || data.empty) return null;
    if (f.kind === 'acc') return new Set(traceByAccount(data.txs, f.id));
    if (f.kind === 'tx') {
      const tx = data.txs[f.id];
      if (!tx) return null;
      return new Set(traceUpstream(data.txs, tx.to_id).linkIndices);
    }
    return null;
  }

  /* ---------- 渲染 ---------- */

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

    paintChart(chartBox, data, hits, (acc) => {
      const same = focus && focus.kind === 'acc' && focus.id === acc;
      focus = same ? null : { kind: 'acc', id: acc };
      render();
    });

    paintList(listBox, data, hits, nameOf, (i) => {
      focus = { kind: 'tx', id: i };
      render();
    });

    paintStats(statsBox, data, hits);

    titleBox.textContent = focus && focus.kind === 'acc' ? nameOf(focus.id) : '全部流水';
    hintBox.textContent = hits
      ? `已高亮 ${hits.size} 条 · 点「清空」看全图`
      : '点弧块看它的来路与去向';

    ctx.setFooter(`路径追踪 · ${data.range.start} ~ ${data.range.end}`
      + ` · ${data.txs.length} 笔 · ${data.blocks.length} 块 · ${data.unitDeg.toFixed(3)}°/单位`);
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
