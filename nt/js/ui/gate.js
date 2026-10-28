// 界面：锁屏 / 首次设密码
/**
 * 锁屏 / 设置密码（UI 层）
 *
 * 只做三件事：拿模板、读输入、把结果交给调用方。
 * **不派生密钥、不碰账本存储** —— 那是 core/auth-manager 与 browser/db 的事。
 *
 * 密码提示词是个例外：它必须在**解锁前**就能读到，所以只能放在
 * localStorage（明文，`nt_pw_hint`）。提示词本来就是给忘了密码的人看的，
 * 不加密；清缓存会丢，但丢了不影响解锁。
 */

import { tpl } from './render-transactions.js';

const HINT_KEY = 'nt_pw_hint';

/** 读提示词（没有 / 读不到都返回空串） */
export function readPwHint() {
  try {
    return localStorage.getItem(HINT_KEY) || '';
  } catch (e) {
    return '';
  }
}

/** 写提示词；空串等于清掉 */
function savePwHint(v) {
  try {
    const text = String(v == null ? '' : v).trim();
    if (text) localStorage.setItem(HINT_KEY, text);
    else localStorage.removeItem(HINT_KEY);
  } catch (e) { /* 隐私模式写不进，不影响解锁 */ }
}

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
  const hintEl = box.querySelector('#nt-lock-hint');

  // 提示词：紧贴密码框下面一行。有内容才显示，没填就整行不出现
  // （不写「提示词：」前缀 —— 用户 2026-10-29 指定）。
  if (hintEl) {
    const hint = readPwHint().trim();
    hintEl.textContent = hint;
    hintEl.hidden = !hint;
  }

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
  const hint = box.querySelector('#nt-setup-hint');
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
    // 提示词先落盘：加密失败也不影响下次解锁时能看到它
    savePwHint(hint ? hint.value : '');
    const res = await handlers.onSetup(pw.value);
    if (!res.ok) {
      msg.textContent = res.error || '设置失败';
      go.disabled = false;
    }
  });
}
