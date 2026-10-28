// 界面：路径页左栏的流水查询表
/**
 * 路径页 · 左栏流水表
 * 层：第五层 · UI
 *
 * 照单文件版（personal/index.html line 9833+）的结构：
 *   冻结区（标题/统计/筛选行/列标行）+ 可滚动的流水行，用 grid 对齐。
 *
 * 这一栏是**流水记录表的查询模板**：五个条件框各自过滤，
 * 点任意一行 = 聚焦这一笔，图上按当前方向点亮它的来路（逆流）/ 去路（顺流）。
 */

/** 列宽（与 path.css 的 .pw-flow-grid 必须一致）：序 · 日期 · 转出 · 转入 · 金额 · 备注 */
export const COLS = '28px 62px 1fr 1fr 68px 1fr';

/** 路径表列 key（顺序 = 表头从左到右 = TABLE_COLS.path.cols） */
const PATH_COLS = ['seq', 'date', 'from', 'to', 'amount', 'note'];

/**
 * 给路径表头挂列宽拖动手柄。
 *
 * 这张表不是 <table>（是 div + grid），所以不能复用 table-layout 的那套；
 * 拖动直接改 :root 上的 --nt-col-path-<列>（grid 的 template 用 var 读），
 * 松手把新宽度写进「路径追踪/列宽」。
 */
export function mountPathColResize(headEl, ctx) {
  if (!headEl || headEl.dataset.resize === '1') return;
  headEl.dataset.resize = '1';

  const spans = [...headEl.children];
  spans.forEach((sp, i) => {
    const col = PATH_COLS[i];
    if (!col) return;

    const grip = document.createElement('span');
    grip.className = 'pw-col-handle';
    grip.setAttribute('aria-hidden', 'true');
    sp.appendChild(grip);

    grip.addEventListener('pointerdown', (ev) => startDrag(ev, sp, col, ctx));
  });
}

function startDrag(ev, sp, col, ctx) {
  if (ev.button !== 0 && ev.pointerType === 'mouse') return;
  ev.preventDefault();
  ev.stopPropagation();

  const grip = ev.currentTarget;
  const startX = ev.clientX;
  const startW = Math.round(sp.getBoundingClientRect().width);
  const root = document.documentElement;
  const varName = '--nt-col-path-' + col;

  let width = startW;
  let raf = 0;

  const flush = () => {
    raf = 0;
    root.style.setProperty(varName, width + 'px');
  };

  const onMove = (e) => {
    width = Math.max(24, Math.round(startW + (e.clientX - startX)));
    if (!raf) raf = requestAnimationFrame(flush);
  };

  const finish = () => {
    if (raf) { cancelAnimationFrame(raf); flush(); }
    grip.removeEventListener('pointermove', onMove);
    grip.removeEventListener('pointerup', finish);
    grip.removeEventListener('pointercancel', finish);
    try { grip.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    if (typeof ctx.saveTableColWidth === 'function') {
      ctx.saveTableColWidth('path', col, width);
    }
  };

  try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', finish);
  grip.addEventListener('pointercancel', finish);
}

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
 * @param {{txs:Array, hits:Set<string>|null, focusId:string|null,
 *          nameOf:(id:string)=>string, onPick:(i:number)=>void}} o
 *   hits / focusId 都按**流水 id** 传（不是下标）：
 *   图里的那批流水是筛选结果的一个子集，下标两边对不上。
 */
export function paintFlowRows(host, o) {
  if (!host) return 0;
  const { txs, hits, focusId, nameOf, onPick } = o;

  // 只清数据行：表头（.pw-frozen，含筛选行和列标行）现在住在 body 里，
  // 用 textContent='' 会把它们一起清掉 —— 表现就是「侧栏表头没了」。
  for (const n of [...host.querySelectorAll('.pw-flow-row, .pw-flow-empty')]) n.remove();

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
    const id = String((t && t.id) || '');
    seq += 1;

    const row = document.createElement('div');
    row.className = 'pw-flow-row';
    if (id && hits && hits.has(id)) row.classList.add('on');
    if (id && focusId && id === String(focusId)) row.classList.add('root');
    row.dataset.idx = String(i);
    row.setAttribute('role', 'button');
    row.tabIndex = 0;

    row.appendChild(cell('span', String(seq)));
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

/** 左栏宽度的本地记忆（界面偏好，不进加密账本） */
const SIDE_KEY = 'nt_pw_side_w';
const SIDE_MIN = 180;
const SIDE_DEF = 320;

/**
 * 上限不再写死 760px —— 用户反馈「拖到一定程度就拖不动」。
 * 现在按窗口宽度的 92% 兜底：手机上可以把侧栏拉到几乎整屏。
 */
function maxSideWidth() {
  const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200;
  return Math.max(320, Math.round(vw * 0.92));
}

function savedSideWidth() {
  try {
    const n = Number(localStorage.getItem(SIDE_KEY));
    return Number.isFinite(n) && n >= SIDE_MIN ? n : SIDE_DEF;
  } catch (e) {
    return SIDE_DEF;
  }
}

/** 把左栏宽度写到 :root 的 --nt-pw-side-w（.pw-main 的 grid 第一列读它） */
export function applySideWidth(w) {
  const n = Math.max(SIDE_MIN, Math.min(maxSideWidth(), Math.round(Number(w) || SIDE_DEF)));
  try {
    document.documentElement.style.setProperty('--nt-pw-side-w', n + 'px');
    localStorage.setItem(SIDE_KEY, String(n));
  } catch (e) { /* 忽略 */ }
  return n;
}

/**
 * 左栏右缘的拖条。
 * 之前左栏宽度是写死的 320px —— 表格稍宽一点就顶出屏幕，而且没法调。
 */
export function mountSideResizer() {
  const side = document.getElementById('pw-side');
  if (!side) return;
  if (side.querySelector('.pw-side-resizer')) return;

  /**
   * 初始状态必须和 --nt-pw-side-w 对齐。
   *
   * HTML 上 .pw-side 天生带 collapsed（默认收起），但栅格列宽默认是 320px ——
   * 于是第一次进路径页时：侧栏本身宽 0（看不见），栅格却仍占 320px，
   * 左边留一大块黑、图被挤到右下角变小。这里按 class 把列宽一起定下来。
   */
  setSideCollapsed(side.classList.contains('collapsed'));

  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'pw-side-resizer';
  bar.setAttribute('aria-label', '拖动调整左栏宽度');
  side.appendChild(bar);

  bar.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    ev.preventDefault();
    ev.stopPropagation();

    const startX = ev.clientX;
    const startW = side.getBoundingClientRect().width;

    const move = (e) => applySideWidth(startW + (e.clientX - startX));
    const finish = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', finish);
      bar.removeEventListener('pointercancel', finish);
      try { bar.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    };

    try { bar.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', finish);
    bar.addEventListener('pointercancel', finish);
  });
}

/**
 * 把左栏在「收起 / 展开」之间切换。
 * 收起时把 grid 第一列压到 0 —— 只给 .pw-side 设 width 是没用的，
 * 宽度由 grid 轨道决定，否则会留一条 320px 的空白。
 *
 * 三角的朝向与 aria 也在这里统一写：收起 = ▶（点了展开），展开 = ◀。
 * 点绘图区自动收起走的是同一个函数，所以两处状态不会分家。
 */
export function setSideCollapsed(collapsed) {
  const side = document.getElementById('pw-side');
  if (!side) return;
  side.classList.toggle('collapsed', !!collapsed);
  try {
    // 收起时整条栅格列压到 0 —— 不再留 22px 的竖条（用户要求）
    document.documentElement.style.setProperty(
      '--nt-pw-side-w', collapsed ? '0px' : savedSideWidth() + 'px',
    );
  } catch (e) { /* 忽略 */ }

  const tg = document.getElementById('pw-toggle');
  if (tg) {
    tg.textContent = collapsed ? '▶' : '◀';
    tg.setAttribute('aria-label', collapsed ? '展开左侧信息栏' : '收起左侧信息栏');
  }
}

/**
 * 上一次量到的标题行高度。
 *
 * 收起时 `.pw-side-head` 是 display:none，getBoundingClientRect 全 0 ——
 * 估算分支如果没有这个缓存，就只能用一个凭空的常数（原来是 20），
 * 和展开分支的 `hr.top + (hr.height - h)/2` 差 2px。
 * 用户看到的就是「三角按钮切换时上下跳」。
 * 缓存之后两条分支用同一个高度，收展位置完全一致。
 */
let lastHeadH = 36;

/**
 * 工具条（三角 + 方向 + Money Way）贴在左栏标题行上：**左起、上下居中**。
 *
 * 不能写死 `top` —— 手机上 tab 栏会因安全区 / 系统字号变高，固定值会比标题行低一截
 * （用户截图里工具条就比「清空」低了一行）。所以量 `.pw-side-head` 的实际位置；
 * 左栏收起时那一行是 display:none（高度 0），退回用「tab 栏底 + 上次量到的高度」。
 */
export function syncToolsTop() {
  const tools = document.querySelector('.pw-tools');
  const view = document.querySelector('.nt-view[data-view="path"]');
  if (!tools || !view || view.hidden) return;   // 路径页没显示时量不到，等 render 再量
  const h = tools.getBoundingClientRect().height || 22;
  const head = document.querySelector('.pw-side-head');
  const hr = head ? head.getBoundingClientRect() : null;
  const tabs = document.querySelector('.nt-tabs');
  const tr = tabs ? tabs.getBoundingClientRect() : null;

  let top = null;
  if (hr && hr.height > 0) {
    lastHeadH = hr.height;
    top = hr.top + (lastHeadH - h) / 2;
  } else if (tr) {
    // 收起：标题行不可见，用它应有的高度算中心 —— 和展开分支同一个公式
    top = tr.bottom + (lastHeadH - h) / 2;
  }
  if (top != null && Number.isFinite(top)) {
    document.documentElement.style.setProperty('--nt-pw-tools-top', Math.round(top) + 'px');
  }
}

export function bindSideToggle() {
  const side = document.getElementById('pw-side');
  if (!side) return;

  const rail = document.getElementById('pw-rail');
  if (rail) rail.addEventListener('click', () => setSideCollapsed(false));

  // 图区左上角的三角：展开 / 收起同一个动作
  const tg = document.getElementById('pw-toggle');
  if (tg) {
    tg.addEventListener('click', () => {
      setSideCollapsed(!side.classList.contains('collapsed'));
    });
  }
}
