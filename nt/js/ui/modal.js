/**
 * 统一弹窗（NtModal）
 * 层：第五层 · UI
 *
 * 页面里只调这一个 API，不再手写遮罩 / 关闭按钮 / 操作条。
 *
 *   const m = NtModal.open({ title:'重置', body:'…', actions:[…], onClose });
 *   m.close();
 *
 * 用原生 <dialog>：自带焦点陷阱与 Esc 关闭。
 * 结构来自 templates.html 的 #tpl-modal（公约 2.2：结构只定义一次）。
 *
 * ⚠️ 命名注意：模块级「关掉当前弹窗」叫 `closeAll`，每个弹窗内部的叫 `closeSelf`。
 * 早先两者都叫 `close`，函数声明提升让 open() 开头那句调到了内部版本，
 * 而它引用了尚未初始化的 `dlg` —— 报 "Cannot access 'dlg' before initialization"。
 */

import { tpl } from './render-transactions.js';

let _current = null;

/**
 * 打开弹窗。
 * @param {{
 *   title?: string,
 *   body?: string|HTMLElement,
 *   build?: (body:HTMLElement)=>void,
 *   actions?: Array<{label:string, kind?:'primary'|'danger'|'ghost', onClick?:Function, close?:boolean}>,
 *   onClose?: ()=>void,
 *   dismissible?: boolean
 * }} opts
 * @returns {{el:HTMLDialogElement, close:()=>void}}
 */
export function open(opts) {
  const o = opts || {};

  closeAll();   // 同时只允许一个

  const node = tpl('tpl-modal');
  if (!node) throw new Error('缺少 tpl-modal 模板');

  const dlg = node.cloneNode(true);

  const titleEl = dlg.querySelector('.nt-modal-title');
  if (titleEl) titleEl.textContent = o.title || '';

  const bodyEl = dlg.querySelector('.nt-modal-body');
  if (bodyEl) {
    bodyEl.textContent = '';
    if (o.build) {
      o.build(bodyEl);
    } else if (o.body instanceof HTMLElement) {
      bodyEl.appendChild(o.body);
    } else if (typeof o.body === 'string') {
      bodyEl.textContent = o.body;
      bodyEl.style.whiteSpace = 'pre-wrap';
    }
  }

  const actionsEl = dlg.querySelector('.nt-modal-actions');
  if (actionsEl) {
    actionsEl.textContent = '';
    const list = Array.isArray(o.actions) ? o.actions : [{ label: '关闭', kind: 'ghost', close: true }];

    for (const a of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nt-btn'
        + (a.kind === 'primary' ? ' nt-btn-primary' : '')
        + (a.kind === 'danger' ? ' nt-btn-danger' : '');
      btn.textContent = a.label || '';
      btn.addEventListener('click', () => {
        if (a.onClick) a.onClick({ close: closeSelf });
        if (a.close !== false) closeSelf();
      });
      actionsEl.appendChild(btn);
    }
  }

  const closeBtn = dlg.querySelector('.nt-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', () => closeSelf());

  if (o.dismissible !== false) {
    dlg.addEventListener('click', (ev) => {
      if (ev.target === dlg) closeSelf();
    });
  }

  dlg.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    closeSelf();
  });

  dlg.addEventListener('close', () => {
    if (_current && _current.el === dlg) _current = null;
    if (typeof o.onClose === 'function') o.onClose();
  });

  document.body.appendChild(dlg);

  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');

  // 焦点给第一个输入框，否则给关闭按钮
  const firstInput = dlg.querySelector('.nt-modal-body input, .nt-modal-body textarea');
  const focusTarget = firstInput || closeBtn;
  if (focusTarget) setTimeout(() => { try { focusTarget.focus(); } catch (e) {} }, 40);

  /** 关掉自己这个弹窗 */
  function closeSelf() {
    if (_current && _current.el === dlg) _current = null;
    try {
      if (typeof dlg.close === 'function' && dlg.open) dlg.close();
      else dlg.removeAttribute('open');
    } catch (e) { /* ignore */ }
    if (dlg.isConnected) dlg.remove();
  }

  _current = { el: dlg, close: closeSelf };
  return _current;
}

/** 关掉当前弹窗（没有就什么都不做） */
export function closeAll() {
  const cur = _current;
  if (!cur) return;
  _current = null;
  try {
    if (typeof cur.el.close === 'function' && cur.el.open) cur.el.close();
    else cur.el.removeAttribute('open');
  } catch (e) { /* ignore */ }
  if (cur.el.isConnected) cur.el.remove();
}

/** 有没有开着的弹窗 */
export function isOpen() {
  return !!_current;
}

/* ---------- 常用封装 ---------- */

/** 纯信息展示 */
export function info(title, buildBody) {
  return open({ title, build: buildBody, actions: [{ label: '知道了', kind: 'ghost', close: true }] });
}

/** 危险操作二次确认 */
export function confirmDanger(title, message, onConfirm, confirmLabel) {
  return open({
    title,
    body: message,
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: confirmLabel || '确认',
        kind: 'danger',
        close: false,
        onClick: ({ close: c }) => { onConfirm(); c(); },
      },
    ],
  });
}

/** 单行/多行输入 */
export function prompt(title, defaultValue, onOk, opts) {
  let input = null;
  const o = opts || {};
  return open({
    title,
    build: (body) => {
      if (o.label) {
        const label = document.createElement('label');
        label.textContent = o.label;
        body.appendChild(label);
      }
      input = document.createElement(o.multiline ? 'textarea' : 'input');
      input.className = 'nt-input';
      input.value = defaultValue || '';
      if (o.placeholder) input.placeholder = o.placeholder;
      body.appendChild(input);
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: o.okLabel || '确定',
        kind: 'primary',
        close: false,
        onClick: ({ close: c }) => {
          const keep = onOk(input ? input.value : '');
          if (keep !== false) c();
        },
      },
    ],
  });
}
