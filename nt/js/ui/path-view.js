/**
 * 路径页视图（UI 层）
 *
 * 只做「把算好的数据摆到 DOM 上」，不含任何几何/金额计算。
 */

import { renderChart } from './mw-svg-renderer.js';
import { categoryColor, pointAt, OPACITY } from '../graph/mw-path-calculator.js';
import { money, shortDate } from '../core/format.js';

const el = (id) => document.getElementById(id);

/** 画图 + 绑事件 */
export function paintChart(host, data, hits, onPick) {
  const colorOf = (key) => categoryColor(data.colorIndex, key);
  host.innerHTML = renderChart({
    blocks: data.blocks,
    chords: data.chords.map((c) => ({
      ...c,
      opacity: !hits ? OPACITY.GLOBAL : (hits.has(c.txIdx) ? OPACITY.HIT : OPACITY.DIM),
    })),
    sectors: data.sectors,
    pointAt,
    colorOf,
  });

  host.classList.toggle('has-focus', !!hits);

  host.querySelectorAll('.mw-ring').forEach((node) => {
    node.addEventListener('click', () => {
      const acc = node.getAttribute('data-node');
      if (acc) onPick(acc);
    });
  });
}

/** 追踪列表 */
export function paintList(host, data, hits, nameOf, onPickTx) {
  host.textContent = '';
  const tpl = document.getElementById('tpl-pw-row');
  if (!tpl) return;

  const rows = data.txs
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => !hits || hits.has(i))
    .sort((a, b) => (String(b.t.date) < String(a.t.date) ? -1 : 1));

  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'pw-empty-row';
    li.textContent = '没有命中的流水';
    host.appendChild(li);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const { t, i } of rows.slice(0, 400)) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.tx = String(i);
    node.querySelector('.pw-cell-date').textContent = shortDate(t.date);
    node.querySelector('.pw-cell-from').textContent = nameOf(t.from_id);
    node.querySelector('.pw-cell-to').textContent = nameOf(t.to_id);
    node.querySelector('.pw-cell-amount').textContent = money(t.amount);
    frag.appendChild(node);
  }
  host.appendChild(frag);

  host.onclick = (ev) => {
    const row = ev.target.closest('.pw-row[data-tx]');
    if (!row) return;
    const i = Number(row.dataset.tx);
    if (!Number.isNaN(i)) onPickTx(i);
  };
}

/** 左上角统计 */
export function paintStats(host, data, hits) {
  host.textContent = '';
  const rows = [
    ['流水', String(hits ? hits.size : data.txs.length)],
    ['弧块', String(data.blocks.length)],
    ['单位角', data.unitDeg.toFixed(3) + '°'],
    ['单位弧长', data.unitArcLen.toFixed(2) + 'px'],
    ['折叠', String(data.sliced.folded)],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    host.appendChild(dt);
    host.appendChild(dd);
  }
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
  el('pw-list').textContent = '';
  el('pw-stats').textContent = '';
  el('pw-side-title').textContent = '暂无数据';
  el('pw-hint').textContent = '';
  el('pw-footer').textContent = '路径追踪 · 无数据 · ' + detail;
}
