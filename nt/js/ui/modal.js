/**
 * 统一弹窗（NtModal）
 * 层：第五层 · UI
 *
 * 页面里只调这一个 API，不再手写遮罩 / 关闭按钮 / 操作条。
 *
 *   const m = NtModal.open({ title: '重置', body: '…', actions: […], onClose });
 *   m.close();
 *
 * 用原生 <dialog>：自带焦点陷阱与 Esc 关闭，不用自己实现。
 * 结构来自 templates.html 的 #tpl-modal（公约 2.2：结构只定义一次）。
 */

import { tpl } from './render-transactions.js';

let _current = null;

/**
 * 打开弹窗。
 * @param {{
 *   title?: string,
 *   body?: string|HTMLElement,          // 字符串按纯文本处理（不拼 HTML）
 *   build?: (body:HTMLElement)=>void,   // 需要复杂内容时用它（推荐，避免字符串拼 HTML）
 *   actions?: Array<{label:string, kind?:'primary'|'danger'|'ghost', onClick?:()=>void, close?:boolean}>,
 *   onClose?: ()=>void,
 *   dismissible?: boolean               // 点遮罩是否关闭（默认 true）
 * }} opts
 * @returns {{el:HTMLDialogElement, close:()=>void}}
 */
export function open(opts) {
  const o = opts || {};
  close();   // 同时只允许一个

  const node = tpl('tpl-modal');
  if (!node) throw new Error('缺少 tpl-modal 模板');

  const dlg = node.cloneNode(true);
  const shell = dlg.querySelector('.nt-modal-shell');

  // 标题
  const titleEl = dlg.querySelector('.nt-modal-title');
  if (titleEl) titleEl.textContent = o.title || '';

  // 内容
  const bodyEl = dlg.querySelector('.nt-modal-body');
  if (bodyEl) {
    bodyEl.textContent = '';
    if (o.build) {
      o.build(bodyEl);
    } else if (o.body instanceof HTMLElement) {
      bodyEl.appendChild(o.body);
    } else if (typeof o.body === 'string') {
      // 纯文本：换行转 <br>，其余一律当文本
      bodyEl.textContent = o.body;
      bodyEl.style.whiteSpace = 'pre-wrap';
    }
  }

  // 操作条
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
        if (a.onClick) a.onClick({ close });
        if (a.close !== false) close();
      });
      actionsEl.appendChild(btn);
    }
  }

  // 关闭
  const closeBtn = dlg.querySelector('.nt-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', () => close());

  // 点遮罩关闭（点卡片内部不关）
  if (o.dismissible !== false) {
    dlg.addEventListener('click', (ev) => {
      if (ev.target === dlg) close();
    });
  }

  // Esc：<dialog> 原生会触发 cancel
  dlg.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    close();
  });

  dlg.addEventListener('close', () => {
    if (_current && _current.el === dlg) _current = null;
    if (typeof o.onClose === 'function') o.onClose();
  });

  document.body.appendChild(dlg);

  // 原生 showModal：焦点陷阱 + 顶层渲染
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');

  // 把焦点给第一个输入框（有的话），否则给关闭按钮
  const firstInput = shell ? shell.querySelector('input, textarea') : null;
  const focusTarget = firstInput || closeBtn;
  if (focusTarget) setTimeout(() => { try { focusTarget.focus(); } catch (e) {} }, 40);

  _current = { el: dlg, close };

  function close() {
    const cur = _current;
    if (!cur || cur.el !== dlg) {
      if (dlg.isConnected) dlg.remove();
      return;
    }
    _current = null;
    try {
      if (typeof dlg.close === 'function' && dlg.open) dlg.close();
      else dlg.removeAttribute('open');
    } catch (e) { /* ignore */ }
    if (dlg.isConnected) dlg.remove();
  }

  return _current;
}

/** 关掉当前弹窗（没有就什么都不做） */
export function close() {
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

/* ---------- 常用封装（避免每个调用点重复拼 actions） ---------- */

/** 纯信息展示（配平、校验说明） */
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

/** 单行文本输入 */
export function prompt(title, defaultValue, onOk, opts) {
  let input = null;
  const o = opts || {};
  return open({
    title,
    build: (body) => {
      const label = document.createElement('label');
      label.textContent = o.label || '';
      input = document.createElement(o.multiline ? 'textarea' : 'input');
      input.className = 'nt-input';
      input.value = defaultValue || '';
      if (o.placeholder) input.placeholder = o.placeholder;
      body.appendChild(label);
      body.appendChild(input);
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: o.okLabel || '确定',
        kind: 'primary',
        close: false,
        onClick: ({ close: c }) => {
          const v = input ? input.value : '';
          const keep = onOk(v);
          if (keep !== false) c();
        },
      },
    ],
  });
}
