// 界面：单元格菜单（长按弹出 · 剪切/复制/粘贴/清除/编辑）
/**
 * 单元格菜单
 * 层：第五层 · UI
 *
 * 用户 2026-11-09：长按单元格，在**该格上方**弹出五个按钮。
 * 只负责把按钮画出来、按能力裁剪、定位到选区的上边；
 * 剪切/复制/粘贴/清除/编辑的实际动作由 cell-range.js 传进来。
 */

const ACTS = [
  ['cut', '剪切'],
  ['copy', '复制'],
  ['paste', '粘贴'],
  ['clear', '清除'],
  ['edit', '编辑'],
];

/**
 * @param {{onCut:Function, onCopy:Function, onPaste:Function,
 *          onClear:Function, onEdit:Function, onCancel:Function}} handlers
 */
export function bindBar(handlers) {
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
    if (!b || b.disabled) return;
    const fn = handlers['on' + b.dataset.act.charAt(0).toUpperCase() + b.dataset.act.slice(1)];
    if (typeof fn === 'function') fn();
  });

  return el;
}

/**
 * 显示并定位到选区**上方**；上方放不下就翻到下方。
 * @param {{top:number,left:number,right:number,bottom:number}} anchor
 * @param {{hasClip?:boolean, canPaste?:boolean, canEdit?:boolean, canDelete?:boolean}} [opts]
 */
export function showBar(anchor, opts) {
  const el = document.getElementById('nt-range-bar');
  if (!el || !anchor) return;
  const o = opts || {};

  for (const b of el.querySelectorAll('.nt-range-btn')) {
    const act = b.dataset.act;
    // 只读表（统计）没有输入框：粘贴/清除/编辑对它没意义
    if (act === 'paste') { b.hidden = o.canPaste === false; b.disabled = !o.hasClip; }
    else if (act === 'clear' || act === 'edit') b.hidden = o.canEdit === false;
    else if (act === 'cut') b.hidden = o.canEdit === false;
  }

  el.hidden = false;

  const bw = el.offsetWidth || 240;
  const bh = el.offsetHeight || 40;
  const mid = (anchor.left + anchor.right) / 2;
  let left = Math.round(mid - bw / 2);
  left = Math.max(6, Math.min(window.innerWidth - bw - 6, left));
  let top = Math.round(anchor.top - bh - 8);
  if (top < 6) top = Math.round(anchor.bottom + 8);   // 上方放不下 → 放下面

  el.style.setProperty('--nt-range-top', top + 'px');
  el.style.setProperty('--nt-range-left', left + 'px');
}

export function hideBar() {
  const el = document.getElementById('nt-range-bar');
  if (el) el.hidden = true;
}

export function setPasteEnabled(on) {
  const el = document.getElementById('nt-range-bar');
  const paste = el && el.querySelector('[data-act="paste"]');
  if (paste) paste.disabled = !on;
}
