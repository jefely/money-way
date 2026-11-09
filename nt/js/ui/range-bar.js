// 界面：单元格框选的工具条
/**
 * 框选工具条
 * 层：第五层 · UI
 *
 * 只负责「把四个按钮画出来、摆在选区旁边、显示/隐藏」。
 * 复制 / 粘贴 / 删除行的实际动作由调用方通过 handlers 传入 ——
 * 那些动作要读选区和表格数据，属于 cell-range.js 的职责。
 *
 * 位置（2026-11-09）：贴在选区**上方**；上方放不下就翻到选区下方。
 * 以前固定在表格左上角，手机上框完下半屏还要把手指移回顶部点按钮。
 */

const ACTS = [
  ['copy', '复制'],
  ['paste', '粘贴'],
  ['del', '删除行'],
  ['cancel', '取消'],
];

let cancelHandler = null;
let outside = null;

/**
 * @param {{onCopy:Function, onPaste:Function, onDelete:Function, onCancel:Function}} handlers
 */
export function bindBar(handlers) {
  cancelHandler = handlers.onCancel || null;
  let el = document.getElementById('nt-range-bar');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'nt-range-bar';
  el.className = 'nt-range-bar';
  el.hidden = true;

  for (const [act, text] of ACTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-range-btn';
    b.dataset.act = act;
    b.textContent = text;
    el.appendChild(b);
  }

  document.body.appendChild(el);

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('.nt-range-btn');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'copy') handlers.onCopy();
    else if (act === 'paste') handlers.onPaste();
    else if (act === 'del') handlers.onDelete();
    else handlers.onCancel();
  });

  return el;
}

/** 只读表（统计）按下按钮的可用状态：能力来自这张表自己 */
function paintButtons(el, opts) {
  const o = opts || {};
  for (const b of el.querySelectorAll('.nt-range-btn')) {
    const act = b.dataset.act;
    if (act === 'paste') {
      b.hidden = o.canPaste === false;
      b.disabled = !o.hasClip;
    } else if (act === 'del') {
      b.hidden = o.canDelete === false;
    }
  }
}

/** 选区矩形 → 工具条的视口坐标（贴上、贴下、左右夹紧） */
function place(el, rect) {
  const r = rect || { top: 8, bottom: 8, left: 8, right: 8 };
  const w = el.offsetWidth || 200;
  const h = el.offsetHeight || 32;
  const vw = window.innerWidth;
  const vv = window.visualViewport;
  const vh = vv ? vv.offsetTop + vv.height : window.innerHeight;
  // 表头底边：第一行选区上方没有空间，别把菜单盖到工具条上
  const floor = Number(r.tableTop) || 6;

  let top = r.top - h - 8;
  if (top < floor) top = Math.max(floor, Math.min(r.bottom + 8, vh - h - 6));
  let left = r.left;
  if (left + w > vw - 8) left = vw - w - 8;
  if (left < 8) left = 8;

  el.style.setProperty('--nt-range-top', Math.round(Math.max(6, top)) + 'px');
  el.style.setProperty('--nt-range-left', Math.round(left) + 'px');
}

/** 菜单亮着时点外面 = 取消选择（点在菜单自己身上不算） */
function watchOutside() {
  unwatchOutside();
  outside = (ev) => {
    const el = document.getElementById('nt-range-bar');
    if (!el || el.hidden) return;
    if (el.contains(ev.target)) return;
    if (cancelHandler) cancelHandler();
    else hideBar();
  };
  document.addEventListener('pointerdown', outside, true);
}

function unwatchOutside() {
  if (!outside) return;
  document.removeEventListener('pointerdown', outside, true);
  outside = null;
}

/**
 * 显示并定位到选区旁边。
 *
 * @param {HTMLElement|{top:number,bottom:number,left:number,right:number}} target
 *        选区矩形；也接受表格元素（旧调用方）—— 没有矩形时退回表格左上角
 * @param {{hasClip?:boolean, canPaste?:boolean, canDelete?:boolean}} [opts]
 */
export function showBar(target, opts) {
  const el = document.getElementById('nt-range-bar');
  if (!el) return;

  paintButtons(el, opts);
  el.hidden = false;

  let rect = null;
  if (target && typeof target.getBoundingClientRect === 'function') {
    const r = target.getBoundingClientRect();
    rect = { top: r.top + 4, bottom: r.bottom, left: r.left + 8, right: r.right };
  } else if (target) {
    rect = target;
  }
  place(el, rect);
  watchOutside();
}

export function hideBar() {
  const el = document.getElementById('nt-range-bar');
  if (el) el.hidden = true;
  unwatchOutside();
}

export function setPasteEnabled(on) {
  const el = document.getElementById('nt-range-bar');
  const paste = el && el.querySelector('[data-act="paste"]');
  if (paste) paste.disabled = !on;
}
