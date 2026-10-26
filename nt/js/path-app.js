// 界面：路径独立页（path.html）
/**
 * 路径追踪页（装配层）
 *
 * 只做四件事：取数据 → 调三层引擎 → 交给视图 → 处理点击。
 * **本文件不做任何几何/金额计算。**
 */

import { buildAccountIndex } from './core/account-index.js';
import { fetchGraphData } from './graph/mw-data-fetcher.js';
import { computeSlots } from './graph/mw-slot-calculator.js';
import { buildChord } from './graph/mw-path-calculator.js';
import { traceUpstream, traceByAccount } from './graph/path-tracer.js';
import { SVG } from './ui/mw-svg-renderer.js';
import { paintChart, paintList, paintStats, paintEmpty } from './ui/path-view.js';
import { initTheme, toggleTheme } from './ui/theme-manager.js';
import { showGate, hideGate } from './ui/gate.js';
import { loadTemplates } from './ui/render-transactions.js';
import { hasVault, unlockVault, createVault } from './browser/db.js';
import { migrate } from './core/migrate.js';
import { createState, addAccount } from './core/state-store.js';
import { ACCOUNT_TYPE } from './core/schema.js';

let state = createState();
let index = buildAccountIndex([]);
let focus = null;       // { kind:'acc'|'tx', id }
let data = null;        // 最近一次算好的图数据

const el = (id) => document.getElementById(id);
const nameOf = (id) => {
  const a = index.byId.get(id);
  return a ? a.name : '—';
};

/* ---------- 取数 + 算图 ---------- */

function rangeOfAll() {
  const dates = (state.transactions || []).map((t) => String(t.date || '')).filter(Boolean).sort();
  return dates.length
    ? { start: dates[0], end: dates[dates.length - 1] }
    : { start: '', end: '' };
}

function build() {
  index = buildAccountIndex(state.accounts);
  const accOf = (id) => index.byId.get(id) || null;

  const range = rangeOfAll();
  const sliced = fetchGraphData({
    transactions: state.transactions,
    accounts: state.accounts,
    range,
    showInternal: true,
    topN: 24,
  });

  const txs = sliced.txs;
  if (!txs.length) return { empty: true, range, picked: 0 };

  const res = computeSlots(txs, { accOf, outerRadius: SVG.rOut });
  const { slots, blocks, sectors, unitArcLen, colorIndex, colorKeyOf, unitDeg } = res;

  const byTx = new Map();
  for (const sl of slots) {
    if (!byTx.has(sl.txIdx)) byTx.set(sl.txIdx, {});
    byTx.get(sl.txIdx)[sl.side] = sl;
  }

  const cx = SVG.size / 2;
  const cy = SVG.size / 2;
  const ctx = { byId: index.byId, colorKeyOf, colorIndex };

  const chords = [];
  for (const [txIdx, pair] of byTx) {
    if (!pair.f || !pair.t || pair.f.empty || pair.t.empty) continue;
    chords.push(buildChord({
      txIdx,
      from_id: txs[txIdx].from_id,
      to_id: txs[txIdx].to_id,
      aFrom: pair.f.mid,
      aTo: pair.t.mid,
      cx, cy,
      rIn: SVG.rIn,
      ctx,
      unitArcLen,
    }));
  }

  return { empty: false, txs, range, sliced, blocks, sectors, chords, colorIndex, unitArcLen, unitDeg };
}

/* ---------- 高亮 ---------- */

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
      totalTx: (state.transactions || []).length,
      range: data.range,
      picked: data.picked,
    });
    return;
  }

  const hits = hitsFor(focus);

  paintChart(el('pw-chart'), data, hits, (acc) => {
    const same = focus && focus.kind === 'acc' && focus.id === acc;
    focus = same ? null : { kind: 'acc', id: acc };
    render();
  });

  paintList(el('pw-list'), data, hits, nameOf, (i) => {
    focus = { kind: 'tx', id: i };
    render();
  });

  paintStats(el('pw-stats'), data, hits);

  el('pw-side-title').textContent = focus && focus.kind === 'acc' ? nameOf(focus.id) : '全部流水';
  el('pw-hint').textContent = hits
    ? `已高亮 ${hits.size} 条 · 点「清空」看全图`
    : '点弧块看它的来路与去向';
  el('pw-footer').textContent = `路径追踪 · ${data.range.start} ~ ${data.range.end}`
    + ` · ${data.txs.length} 笔 · ${data.blocks.length} 块 · ${data.unitDeg.toFixed(3)}°/单位`;
}

function clearFocus() {
  focus = null;
  render();
}

/* ---------- 启动 ---------- */

/**
 * 首次使用的种子账户。
 * **必须与 js/app.js 的 seedState 完全一致**（相同的 id 与账户），
 * 否则两个页面各自建库时会对不上号。
 */
function seed() {
  let s = createState();
  s = addAccount(s, { id: 'acc_cash', code: 'XJ', name: '现金', type: ACCOUNT_TYPE.ASSET, category: '现金' });
  s = addAccount(s, { id: 'acc_bank', code: 'ZHC', name: '招行储', type: ACCOUNT_TYPE.ASSET, category: '储蓄' });
  s = addAccount(s, { id: 'acc_food', code: 'CY', name: '餐饮', type: ACCOUNT_TYPE.EXPENSE, category: '日常' });
  return s;
}

function enter() {
  hideGate();
  el('pw-app').hidden = false;
  render();
}

/** 把错误显示到页面上（静默失败最难查） */
function crash(where, e) {
  const msg = where + '：' + (e && (e.message || e));
  const pre = document.createElement('pre');
  pre.className = 'pw-crash';
  pre.textContent = msg;
  document.body.insertBefore(pre, document.body.firstChild);
  // eslint-disable-next-line no-console
  console.error(msg);
}

async function boot() {
  initTheme();
  await loadTemplates();

  el('pw-theme').addEventListener('click', () => toggleTheme());
  el('pw-clear').addEventListener('click', () => clearFocus());

  const exists = await hasVault();
  showGate(exists, {
    onUnlock: async (pw) => {
      const res = await unlockVault(pw);
      if (res.ok) {
        state = res.state && Array.isArray(res.state.transactions)
          ? migrate(res.state).state
          : seed();
        enter();
      }
      return res;
    },
    onSetup: async (pw) => {
      state = seed();
      try {
        await createVault(state, pw);
        enter();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: '设置失败：' + e.message };
      }
    },
  });
}

boot().catch((e) => crash('路径页启动失败', e));
