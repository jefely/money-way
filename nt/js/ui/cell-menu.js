// 界面：单元格长按菜单（剪切 / 复制 / 粘贴 / 清除 / 编辑）
/**
 * 单元格菜单
 * 层：第五层 · UI
 *
 * 只负责「五个按钮画出来、贴在单元格上方、显示/隐藏」；
 * 每个动作做什么由调用方传入（cell-select.js）。
 *
 * 位置：默认在单元格**上方**；上方放不下翻到下方，左右夹在视口内。
 * 点菜单外面自动收起（捕获阶段，抢在表格自己的 pointerdown 之前）。
 */

const ACTS = [
  ['cut', '剪切'],
  ['copy', '复制'],
  ['paste', '粘贴'],
  ['clear', '清除'],
  ['edit', '编辑'],
];

let el = null;
let handlers = null;
let outside = null;

function ensure() {
  if (el && document.body.contains(el)) return el;
  el = document.createElement('div');
  el.className = 'nt-cell-menu';
  el.hidden = true;
  el.setAttribute('role', 'menu');
  for (const [act, text] of ACTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-cell-menu-btn';
    b.dataset.act = act;
    b.textContent = text;
    el.appendChild(b);
  }
  document.body.appendChild(el);
  return el;
}

function unwatch() {
  if (!outside) return;
  document.removeEventListener('pointerdown', outside, true);
  outside = null;
}

/** 点菜单外面收起（菜单自己的按钮不算） */
function watch() {
  unwatch();
  outside = (ev) => {
    if (!el || el.hidden) return;
    if (el.contains(ev.target)) return;
    hideCellMenu();
  };
  document.addEventListener('pointerdown', outside, true);
}

/**
 * @param {{top:number,bottom:number,left:number,right:number}} rect 长按的那一格
 * @param {{canPaste?:boolean, canEdit?:boolean, canCut?:boolean, canClear?:boolean}} state
 * @param {Record<string,Function>} h 五个动作
 */
export function showCellMenu(rect, state, h) {
  const menu = ensure();
  handlers = h || {};
  const s = state || {};

  for (const b of menu.querySelectorAll('.nt-cell-menu-btn')) {
    const act = b.dataset.act;
    if (act === 'paste') b.disabled = !s.canPaste;
    else if (act === 'edit') b.disabled = s.canEdit === false;
    else if (act === 'cut') b.disabled = s.canCut === false;
    else if (act === 'clear') b.disabled = s.canClear === false;
    else b.disabled = false;
  }

  menu.hidden = false;
  const w = menu.offsetWidth || 220;
  const hgt = menu.offsetHeight || 30;
  const vw = window.innerWidth;
  const vv = window.visualViewport;
  const vh = vv ? vv.offsetTop + vv.height : window.innerHeight;

  let top = rect.top - hgt - 6;
  if (top < 6) top = Math.min(rect.bottom + 6, vh - hgt - 6);
  let left = rect.left;
  if (left + w > vw - 8) left = vw - w - 8;
  if (left < 8) left = 8;

  menu.style.top = Math.round(Math.max(6, top)) + 'px';
  menu.style.left = Math.round(left) + 'px';
  watch();
}

export function hideCellMenu() {
  if (el) el.hidden = true;
  unwatch();
  handlers = null;
}

/** 菜单自己（用于「点外面取消选区」时放行） */
export function isCellMenuTarget(target) {
  return !!(el && !el.hidden && target && el.contains(target));
}

/** 菜单是否开着（长按松手后的 focusin 不该把选区收掉） */
export function isCellMenuOpen() {
  return !!(el && !el.hidden);
}

export function bindCellMenuActions() {
  const menu = ensure();
  menu.addEventListener('click', (ev) => {
    const b = ev.target.closest('.nt-cell-menu-btn');
    if (!b || b.disabled) return;
    const fn = handlers && handlers[b.dataset.act];
    const act = b.dataset.act;
    hideCellMenu();
    if (fn) fn(act);
  });
}

bindCellMenuActions();
