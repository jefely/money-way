// 界面：路径页左栏的流水查询表
/**
 * 路径页 · 左栏流水表
 * 层：第五层 · UI
 *
 * 照单文件版（personal/index.html line 9833+）的结构：
 *   冻结区（标题/统计/筛选行/列标行）+ 可滚动的流水行，用 grid 对齐。
 *
 * 这一栏是**流水记录表的查询模板**：五个条件框各自过滤，
 * 点任意一行 = 聚焦这一笔，图上点亮「它 + 它的上游」。
 */

/** 列宽（与 path.css 的 .pw-flow-grid 必须一致） */
export const COLS = '62px 1fr 1fr 68px 1fr';

/**
 * 绑定筛选框与行点击。
 * @param {{getFilter:()=>object, setFilter:(k:string,v:string)=>void,
 *          onClear:()=>void, onPick:(txIndex:number)=>void}} h
 */
export function bindFlowFilters(h) {
  for (const key of ['date', 'from', 'to', 'amount', 'note']) {
    const el = document.getElementById('pw-qf-' + key);
    if (!el) continue;
    el.addEventListener('input', () => h.setFilter(key, el.value));
  }
  const clear = document.getElementById('pw-clear');
  if (clear) clear.addEventListener('click', () => h.onClear());
}

/**
 * 渲染流水行。
 * @param {HTMLElement} host #pw-flow-body
 * @param {{txs:Array, hits:Set<number>|null, focusIndex:number|null,
 *          nameOf:(id:string)=>string, onPick:(i:number)=>void}} o
 */
export function paintFlowRows(host, o) {
  if (!host) return 0;
  const { txs, hits, focusIndex, nameOf, onPick } = o;

  host.textContent = '';

  if (!txs || !txs.length) {
    const p = document.createElement('div');
    p.className = 'pw-flow-empty';
    p.textContent = '没有命中的流水';
    host.appendChild(p);
    return 0;
  }

  const frag = document.createDocumentFragment();
  let seq = 0;

  for (let i = 0; i < txs.length; i += 1) {
    const t = txs[i];
    seq += 1;

    const row = document.createElement('div');
    row.className = 'pw-flow-row';
    if (hits && hits.has(i)) row.classList.add('on');
    if (focusIndex === i) row.classList.add('root');
    row.dataset.idx = String(i);
    row.setAttribute('role', 'button');
    row.tabIndex = 0;

    row.appendChild(cell('span', shortDay(t.date)));
    row.appendChild(cell('span', nameOf(t.from_id)));
    row.appendChild(cell('span', nameOf(t.to_id)));
    row.appendChild(cell('b', moneyShort(t.amount), 'pw-amt'));
    row.appendChild(cell('span', t.note || ''));

    row.addEventListener('click', () => onPick(i));
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(i); }
    });

    frag.appendChild(row);
  }

  host.appendChild(frag);
  return seq;
}

/** 日期：2026-08-30 → 260830 */
function shortDay(iso) {
  const s = String(iso || '').replace(/[^0-9]/g, '');
  if (s.length >= 8) return s.slice(2, 8);
  if (s.length >= 6) return s.slice(-6);
  return String(iso || '');
}

/** 金额：去掉 ¥ 和千分位，窄栏里放得下 */
function moneyShort(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const txt = abs >= 10000 ? (abs / 10000).toFixed(1) + '万' : abs.toFixed(abs % 1 ? 2 : 0);
  return (n < 0 ? '-' : '') + txt;
}

function cell(tag, text, cls) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.textContent = text == null ? '' : String(text);
  el.title = el.textContent;
  return el;
}

/**
 * 把左栏在「收起 / 展开」之间切换。
 * @param {boolean} collapsed
 */
export function setSideCollapsed(collapsed) {
  const side = document.getElementById('pw-side');
  if (!side) return;
  side.classList.toggle('collapsed', !!collapsed);
}

/** 绑定收起 / 展开 */
export function bindSideToggle() {
  const side = document.getElementById('pw-side');
  if (!side) return;

  const rail = document.getElementById('pw-rail');
  if (rail) rail.addEventListener('click', () => setSideCollapsed(false));

  const col = document.getElementById('pw-collapse');
  if (col) col.addEventListener('click', () => setSideCollapsed(true));
}
