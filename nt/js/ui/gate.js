// 界面：锁屏 / 首次设密码
/**
 * 锁屏 / 设置密码（UI 层）
 *
 * 只做三件事：拿模板、读输入、把结果交给调用方。
 * **不派生密钥、不碰存储** —— 那是 core/auth-manager 与 browser/db 的事。
 */

import { tpl } from './render-transactions.js';

/**
 * 显示门禁。
 * @param {boolean} hasVault 已有保险库 → 解锁态；否则 → 设置密码态
 * @param {{onUnlock:(pw:string)=>Promise<{ok:boolean,error?:string}>,
 *          onSetup:(pw:string)=>Promise<{ok:boolean,error?:string}>}} handlers
 */
export function showGate(hasVault, handlers) {
  const host = document.getElementById('nt-gate');
  if (!host) return;
  host.textContent = '';
  host.hidden = false;

  if (hasVault) mountLock(host, handlers);
  else mountSetup(host, handlers);
}

/** 隐藏门禁（解锁成功后调用） */
export function hideGate() {
  const host = document.getElementById('nt-gate');
  if (!host) return;
  host.textContent = '';
  host.hidden = true;
}

function mountLock(host, handlers) {
  const node = tpl('tpl-lock');
  if (!node) return;
  const box = node.cloneNode(true);
  host.appendChild(box);

  const form = box.querySelector('#nt-lock-form');
  const pw = box.querySelector('#nt-lock-pw');
  const msg = box.querySelector('#nt-lock-msg');

  setTimeout(() => { try { pw.focus(); } catch (e) {} }, 80);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = pw.value;
    if (!v) { msg.textContent = '请输入密码'; return; }
    msg.textContent = '正在解锁…';
    const res = await handlers.onUnlock(v);
    if (!res.ok) {
      msg.textContent = res.error || '密码不对';
      pw.select();
    }
  });
}

function mountSetup(host, handlers) {
  const node = tpl('tpl-lock-setup');
  if (!node) return;
  const box = node.cloneNode(true);
  host.appendChild(box);

  const form = box.querySelector('#nt-setup-form');
  const pw = box.querySelector('#nt-setup-pw');
  const pw2 = box.querySelector('#nt-setup-pw2');
  const ack = box.querySelector('#nt-setup-ack');
  const go = box.querySelector('#nt-setup-go');
  const msg = box.querySelector('#nt-setup-msg');

  setTimeout(() => { try { pw.focus(); } catch (e) {} }, 80);

  // 没勾「我知道忘了就没了」就不许提交
  const sync = () => { go.disabled = !ack.checked; };
  ack.addEventListener('change', sync);
  sync();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!ack.checked) { msg.textContent = '请先确认「忘记密码将永久丢失数据」'; return; }
    if (!pw.value) { msg.textContent = '请输入密码'; return; }
    if (pw.value !== pw2.value) { msg.textContent = '两次输入不一致'; pw2.select(); return; }

    msg.textContent = '正在加密…';
    go.disabled = true;
    const res = await handlers.onSetup(pw.value);
    if (!res.ok) {
      msg.textContent = res.error || '设置失败';
      go.disabled = false;
    }
  });
}
