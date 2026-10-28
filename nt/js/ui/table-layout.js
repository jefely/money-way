// 界面：表格冻结列 + 列宽拖动
/**
 * 表格布局
 * 层：第五层 · UI
 *
 * ============================================================
 * 照单文件版（personal/index.html）的两套模式
 * ============================================================
 *
 *   模式 A · CSS 定宽（默认）
 *     表宽 width:max-content = 各列 `<th>` 上的 --nt-col-* 之和
 *     冻结列：CSS 的 sticky（首列 left:0 / 表头 top:0）负责
 *
 *   模式 B · 自定义（拖过一次之后）
 *     整表切到 .cols-custom（width:max-content + min-width:0），
 *     每列宽度固化到 th 的 style 上，之后只改目标列；
 *     表宽由 max-content 自动跟随，**JS 不再写 table.style.width**
 *     —— 两种模式泾渭分明，不会「一边百分比一边固定 px」打架
 *
 * 上一版把「算列宽、算表宽、管 colgroup」全搬进 JS，
 * 每加一个功能（拖动、参数、动态表头）就多一个出错点，最后必然乱。
 * ============================================================
 */

/** 每张表冻结几列（键 = 表类名）。必须和 CSS 里的 sticky 声明一致。 */
const FROZEN_COUNT = {
  'nt-table-flow': 1,       // 序
  'nt-table-stats': 2,      // 序 + 第二列
  'nt-table-plan': 1,       // 序
  'nt-table-inst': 1,       // 账户名称
  'nt-table-accounts': 1,   // 简码（只此一列）
  'nt-table-query': 0,      // 不冻结
};

/**
 * 冻结偏移由 CSS 写死的表（当前只有设置页账户表）。
 *
 * 只冻结首列时 left 恒为 0，累加没有意义，反而会多一个出错点
 * （量到的宽度和 CSS 的 width 不一致 → 冻结列错位）。
 * 这张表由 shell.css 的
 *   `.nt-table-accounts .nt-th:nth-child(1) { left: 0 }`
 * 负责；syncFrozen 只做一件事：清掉历史遗留的内联 left。
 *
 * 判据来自 TABLE-INTERACTION.md：CSS 产生值，JS 只消费。
 */
const CSS_FROZEN = new Set(['nt-table-accounts']);

const MIN_W = 30;
const MAX_W = 600;

/* ============================================================
   一、冻结列：left 按实际渲染宽度累加
   ============================================================ */

/**
 * 为什么必须量实际宽度而不是读 CSS 值：
 *   · 浏览器会把列压窄（表格要挤进容器）
 *   · 表格有 min-width，容器更窄时列是缩放的
 *   · 用户拖过列宽
 *
 * 表头和数据行必须写同一个 left，否则两者会错开。
 */
export function syncFrozen(tableEl) {
  if (!tableEl) return;
  const cls = [...tableEl.classList].find((c) => c in FROZEN_COUNT);
  if (!cls) return;
  const n = FROZEN_COUNT[cls];
  if (!n) return;

  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  const rows = [...tableEl.querySelectorAll('tbody tr')];

  // 只冻结首列、偏移由 CSS 写死：清一次内联 left 就够，不再逐帧量宽度。
  // 这一步是「纯 CSS 冻结」的开关 —— 表头和数据行都必须清，
  // 否则旧代码留下的 left（比如上一版写的 129px）会压在 CSS 的 left:0 上面。
  if (CSS_FROZEN.has(cls)) {
    for (const th of ths) {
      if (th.style.left) th.style.left = '';
    }
    for (const tr of rows) {
      const td = tr.children[0];
      if (td && td.style.left) td.style.left = '';
    }
    return;
  }

  let left = 0;
  for (let i = 0; i < Math.min(n, ths.length); i += 1) {
    const th = ths[i];
    const w = Math.round(th.getBoundingClientRect().width);

    th.style.left = left + 'px';
    for (const tr of rows) {
      const td = tr.children[i];
      // 跨列单元格（比如「还没有流水」那行的 colspan=7）不能加 sticky left，
      // 否则整行会被当成一个冻结块横向移动 —— 看着就是莫名其妙地跳
      if (td && td.colSpan === 1) td.style.left = left + 'px';
    }

    left += w;
  }
}

/** 所有表都同步一遍 */
export function syncAllFrozen() {
  for (const t of document.querySelectorAll('table.nt-table')) syncFrozen(t);
}

/* ============================================================
   二、拖动：切 .cols-custom 之后只改目标列
   ============================================================ */

/**
 * 进入自定义列宽模式：把每列当前的**实际**宽度固化到 th 上。
 *
 * 必须在拖动开始时做一次 —— 否则 A 模式下是百分比/100% 分配，
 * 改一列宽度会让其它列按比例重新分配（「拖一列动一排」）。
 */
function enterCustomMode(tableEl) {
  if (tableEl.classList.contains('cols-custom')) return;

  // ① 先把所有列的宽度量完（边量边设会让后面的测量被前面的改动污染）
  const widths = [];
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    widths.push(Math.round(th.getBoundingClientRect().width));
  }

  // ② 再切模式、统一写入
  tableEl.classList.add('cols-custom');
  let i = 0;
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    const w = widths[i];
    i += 1;
    // 内联清掉 min/max：CSS 里给冻结列写死的 max-width 会钳住拖出来的宽度
    th.style.minWidth = '0';
    th.style.maxWidth = 'none';
    if (w > 0) th.style.width = w + 'px';
  }

  // 不再写 table.style.width：`.nt-table.cols-custom { width: max-content }`
  // 让表宽始终等于各列之和（见 shell.css）。
}

/**
 * 给一张表挂拖动手柄。
 *
 * 做法照单文件版的 initColResize，三道关键：
 *   ① setPointerCapture —— 指针捕获后事件全发给手柄，手指移出也不断，
 *      而且其它列收不到 pointerover，不会跟着 hover 亮起来
 *   ② 事件绑在 grip 自己身上（move / up / cancel），不绑 document
 *   ③ 宽度写入用 rAF 合并到每帧一次，长表才不卡
 */
export function mountResize(tableEl, opts) {
  const o = opts || {};
  if (!tableEl) return;

  paintHandles(tableEl);

  if (tableEl.dataset.resizeBound === '1') return;
  tableEl.dataset.resizeBound = '1';

  // 只做一件事：从被按下的手柄找到目标列，然后把后续事件交给手柄自己
  tableEl.addEventListener('pointerdown', (ev) => {
    const grip = ev.target.closest && ev.target.closest('.nt-col-handle');
    if (!grip) return;
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;

    ev.preventDefault();
    ev.stopPropagation();

    startDrag(tableEl, grip, ev, o);
  });
}

/** 一次拖动的全过程 */
function startDrag(tableEl, grip, downEv, o) {
  const th = grip.closest('.nt-th');
  if (!th) return;

  // 进 B 模式：把当前各列的实际宽度固化，之后只改目标列
  enterCustomMode(tableEl);

  const startX = downEv.clientX;
  const startW = Math.round(th.getBoundingClientRect().width);
  const idx = [...tableEl.querySelectorAll('thead .nt-th')].indexOf(th);
  const wrap = tableEl.closest('.nt-tablewrap');
  const prevOverflow = wrap ? wrap.style.overflowX : '';

  grip.classList.add('dragging');
  th.classList.add('nt-col-dragging');
  document.body.classList.add('nt-col-resizing');
  if (wrap) wrap.style.overflowX = 'hidden';

  // ① 指针捕获：手指移出手柄也继续收事件
  try { grip.setPointerCapture(downEv.pointerId); } catch (e) { /* 忽略 */ }

  let width = startW;
  let raf = 0;

  const flush = () => {
    raf = 0;
    // 只改这一列的宽度：表宽由 `.cols-custom { width: max-content }` 跟着走
    th.style.width = width + 'px';
    syncFrozen(tableEl);
  };

  const onMove = (e) => {
    width = Math.max(MIN_W, Math.min(MAX_W, startW + (e.clientX - startX)));
    // ③ 每帧只写一次，别每个 move 都写
    if (!raf) raf = requestAnimationFrame(flush);
  };

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;

    if (raf) { cancelAnimationFrame(raf); flush(); }

    grip.removeEventListener('pointermove', onMove);
    grip.removeEventListener('pointerup', finish);
    grip.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', finish);

    try { grip.releasePointerCapture(downEv.pointerId); } catch (e) { /* 忽略 */ }

    grip.classList.remove('dragging');
    th.classList.remove('nt-col-dragging');
    document.body.classList.remove('nt-col-resizing');
    if (wrap) wrap.style.overflowX = prevOverflow;

    // 回调带上「哪张表 + 哪一列」：每张表的列宽是各自一份参数，
    // 只给下标的话调用方还得自己反查（之前就是这里传的是数字，
    // 而 onColResize 当成列名去 indexOf，永远 -1 —— 拖了从来不保存）。
    if (o.onResize) o.onResize(tableEl, (th.dataset && th.dataset.col) || '', Math.round(width));
  };

  // ② 绑在手柄自己身上
  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', finish);
  grip.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);
}

/** 给每个表头补一个拖动手柄 */
export function paintHandles(tableEl) {
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    if (th.querySelector('.nt-col-handle')) continue;
    const handle = document.createElement('span');
    handle.className = 'nt-col-handle';
    handle.setAttribute('aria-hidden', 'true');
    th.appendChild(handle);
  }
}

/** 给所有数据区挂手柄 + 同步冻结列 */
export function bindAllTables(opts) {
  for (const table of document.querySelectorAll('table.nt-table')) {
    mountResize(table, opts);
    paintHandles(table);
    syncFrozen(table);
  }
}

/* ============================================================
   三、列宽的「渲染缓存」
   ------------------------------------------------------------
   列宽的真身在账本参数里（加密、要等解锁），但表头每次重绘都会重建，
   内联 width 随之丢失 —— 表现就是「调好列宽，一折叠一展开就回到默认」。
   所以拖动时额外往 localStorage 写一份字符串镜像，buildHead 重建表头后
   直接应用它。参数面板改动时也会同步镜像（见 app.js）。
   ============================================================ */

const MIRROR_PREFIX = 'nt-colw:';

/** 表 → 镜像键（用表类名，够稳定） */
function mirrorKey(tableEl) {
  const cls = [...tableEl.classList].find((c) => c.startsWith('nt-table-'));
  return cls ? MIRROR_PREFIX + cls : '';
}

/** 写镜像：widths 是「每列一个数字」的数组 */
export function saveColMirror(tableEl, widths) {
  try {
    const k = mirrorKey(tableEl);
    if (!k) return;
    localStorage.setItem(k, (widths || []).join(','));
  } catch (e) { /* 忽略 */ }
}

/** 从镜像里把宽度应用到表头上（没有镜像就什么都不做） */
export function applyColMirror(tableEl) {
  try {
    const k = mirrorKey(tableEl);
    const raw = k ? localStorage.getItem(k) : '';
    if (!raw) return;
    const widths = raw.split(',').map((x) => Number(x) || 0);
    if (!widths.some((w) => w > 0)) return;

    const ths = [...tableEl.querySelectorAll('thead .nt-th')];
    if (!ths.length) return;
    tableEl.classList.add('cols-custom');
    ths.forEach((th, i) => {
      const w = widths[i] || 0;
      th.style.minWidth = '0';
      th.style.maxWidth = 'none';
      th.style.width = w > 0 ? w + 'px' : '';
    });
    syncFrozen(tableEl);
  } catch (e) { /* 忽略 */ }
}

/** 恢复默认列宽：回到 A 模式 */
export function resetColWidths(tableEl) {
  tableEl.classList.remove('cols-custom');
  // 只清历史内联值，不写新值 —— 表宽回到 CSS 的 max-content
  tableEl.style.width = '';
  for (const th of tableEl.querySelectorAll('thead .nt-th')) {
    th.style.width = '';
    th.style.minWidth = '';
    th.style.maxWidth = '';
    th.style.left = '';
  }
  syncFrozen(tableEl);
}

/**
 * 禁掉表格内的原生拖放。
 *
 * Chrome 允许 <input> 参与 HTML5 drag，选中数字拖到别的格子会把值带过去。
 * 表格里没有任何地方需要这个行为，全局拦掉最省事。
 */
if (typeof document !== 'undefined') {
  document.addEventListener('dragstart', (ev) => {
    const t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest('.nt-table') || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
      ev.preventDefault();
    }
  }, true);
}
