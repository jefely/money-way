// 界面：轻量选择浮层（代替原生 select 的弹层）
/**
 * 原生 select 的弹层在「表格格子里 + appearance:none + 深色主题」下很不稳：
 * 有的浏览器把它压成半个字高的白框，有的被 overflow 裁掉（用户 2026-10-30）。
 * 这里干脆不用原生弹层：点击时在 input 下面挂一个普通 div 列表面板。
 *
 * 用法：
 *   bindTypePicker(input, () => ['资产类', ...], (value) => { ... })
 * 选「其他…」时回调值 '__custom__'，由调用方决定怎么输入。
 */

import * as NtModal from './modal.js';

let pop = null;
let outsideHandler = null;

function hidePicker() {
  if (pop) {
    pop.remove();
    pop = null;
  }
  if (outsideHandler) {
    document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = null;
  }
}

/**
 * @param {HTMLElement} anchor 输入框
 * @param {string[]} items 选项
 * @param {(value:string)=>void} onPick
 */
export function showPicker(anchor, items, onPick) {
  hidePicker();

  const el = document.createElement('div');
  el.className = 'nt-picker';
  for (const it of items || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-picker-item';
    b.textContent = it === '__custom__' ? '其他…' : it;
    b.addEventListener('click', () => {
      hidePicker();
      onPick(it);
    });
    el.appendChild(b);
  }
  document.body.appendChild(el);

  const r = anchor.getBoundingClientRect();
  const w = Math.max(120, Math.round(r.width));
  el.style.width = w + 'px';
  el.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + 'px';
  const below = r.bottom + 2;
  el.style.top = (below + el.offsetHeight > window.innerHeight - 4
    ? Math.max(4, r.top - el.offsetHeight - 2)
    : below) + 'px';

  pop = el;
  outsideHandler = (ev) => {
    if (pop && !pop.contains(ev.target) && ev.target !== anchor) hidePicker();
  };
  setTimeout(() => document.addEventListener('pointerdown', outsideHandler, true), 0);
}

/**
 * 给输入框绑上选择浮层。点击才弹，聚焦不弹 —— 不然手动输入时也会被面板挡住。
 * @param {HTMLInputElement} input
 * @param {()=>string[]} getTypes
 * @param {(value:string)=>void} onPick
 */
export function bindTypePicker(input, getTypes, onPick) {
  input.addEventListener('click', (ev) => {
    ev.preventDefault();
    const items = (getTypes() || []).concat(['__custom__']);
    showPicker(input, items, (v) => {
      if (v === '__custom__') {
        onPick('__custom__');
        return;
      }
      input.value = v;
      onPick(v);
    });
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hidePicker();
  });
}

/** 弹输入框收一个新类型（picker 里选「其他…」时用） */
export function promptType(done) {
  NtModal.prompt('新的账户类型（会加进类型库）', '', (val) => {
    const t = String(val || '').trim();
    if (t) done(t);
    return true;
  });
}