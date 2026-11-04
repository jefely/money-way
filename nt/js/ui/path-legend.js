// 界面：路径 tab → 图例
/**
 * 环网图图例。只列账户，不列每一笔弦，流水上万时也不会把页面撑爆。
 * 层：第五层 · UI
 */

import { typeColor } from '../graph/mw-layers.js';

export function legendRows(blocks, nodeColorOf) {
  const colorOf = nodeColorOf || (() => '');
  return (blocks || []).filter((b) => b && b.acc).map((b) => ({
    id: b.acc,
    name: b.label || b.acc,
    type: b.type || '',
    amount: b.amountText || '0',
    color: colorOf(b.acc),
  }));
}

export function paintLegend(host, model) {
  if (!host) return;
  const rows = legendRows(model && model.blocks, model && model.nodeColorOf);
  host.textContent = '';
  if (!rows.length) return;

  const seen = new Set();
  for (const row of rows) {
    if (!row.type || seen.has(row.type)) continue;
    seen.add(row.type);
    host.appendChild(swatch('span', typeColor(row.type), row.type, ''));
  }
  for (const row of rows) {
    const btn = swatch('button', row.color, row.name, row.amount);
    btn.addEventListener('click', () => {
      if (model && model.onPick) model.onPick(row.id);
    });
    host.appendChild(btn);
  }
}

function swatch(tag, color, name, amount) {
  const btn = document.createElement(tag);
  if (tag === 'button') btn.type = 'button';
  btn.className = 'pw-legend-row';
  const dot = document.createElement('i');
  dot.className = 'pw-legend-dot';
  dot.style.background = color || 'transparent';
  const label = document.createElement('span');
  label.textContent = name;
  btn.appendChild(dot);
  btn.appendChild(label);
  if (amount) {
    const num = document.createElement('b');
    num.textContent = amount;
    btn.appendChild(num);
  }
  return btn;
}
