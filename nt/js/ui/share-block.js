// 界面：二维码分享区块
/**
 * 二维码分享区块（说明页顶部）
 * 层：第五层 · UI
 *
 * 照单文件版的布局：左边二维码、右边说明文字，
 * 右侧最后一行是版本信息（本地 / 远端）+ 检查更新按钮。
 *
 * **进页面就自动查一次远端版本**，不用等用户点。
 * 二维码内容只是当前账本地址，不含任何账目。
 */

import { paintText } from './qr-canvas.js';
import { APP_VER } from '../core/version.js';
import { SHARE_URL } from '../core/meta.js';
import { checkUpdate, applyUpdate, hardReload } from './update-check.js';

/** 二维码每个模块多少像素：手机上 4~5 之间最好扫 */
const MODULE_PX = 5;

/**
 * @param {{url?:string, title?:string, hint?:string}} [opts]
 * @returns {HTMLElement}
 */
export function shareBlock(opts) {
  const o = opts || {};
  const url = o.url || SHARE_URL;

  const box = document.createElement('div');
  box.className = 'nt-share-block';

  const row = document.createElement('div');
  row.className = 'nt-share-row';

  // 左：二维码
  const canvas = document.createElement('canvas');
  canvas.className = 'nt-share-qr';
  canvas.setAttribute('aria-label', '账本二维码');
  row.appendChild(canvas);

  // 右：说明
  const txt = document.createElement('div');
  txt.className = 'nt-share-txt';

  const t1 = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = o.title || '手机安装';
  t1.appendChild(b);
  t1.appendChild(document.createTextNode('：扫码打开本账本'));
  txt.appendChild(t1);

  const u = document.createElement('div');
  u.className = 'nt-share-url';
  u.textContent = url;
  txt.appendChild(u);

  const h = document.createElement('div');
  h.className = 'nt-share-hint';
  h.textContent = o.hint
    || '安卓 Chrome / iPhone Safari 打开后，用「添加到主屏幕」装成 App，离线可用。';
  txt.appendChild(h);

  // 版本行：进页面就自动查，按钮只负责「再查一次」
  txt.appendChild(versionLine());

  row.appendChild(txt);
  box.appendChild(row);

  // 二维码可能在 paintText 里失败（地址太长装不下）
  const r = paintText(canvas, url, MODULE_PX);
  if (!r.ok) {
    canvas.remove();
    const err = document.createElement('div');
    err.className = 'nt-share-hint bad';
    err.textContent = '二维码生成失败：' + (r.error || '地址太长');
    txt.appendChild(err);
  }

  return box;
}

/** 版本行：按钮 + 本地/远端两行小字；挂上去就自动查一次 */
function versionLine() {
  const wrap = document.createElement('div');
  wrap.className = 'nt-ver-line';

  const btnRow = document.createElement('div');
  btnRow.className = 'nt-ver-btns';

  // 重载：清缓存 + 注销 SW + 刷新（旧 SW 卡住时的唯一可靠解法）
  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.className = 'nt-ver-btn ghost';
  reloadBtn.textContent = '重载';
  reloadBtn.title = '清掉缓存并重新加载（更新不生效时点这个）';
  reloadBtn.addEventListener('click', async () => {
    reloadBtn.disabled = true;
    reloadBtn.textContent = '重载中';
    await hardReload();
  });
  btnRow.appendChild(reloadBtn);

  // 更新：查远端版本，有新版就清缓存并换班
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nt-ver-btn ghost';
  btn.textContent = '更新';
  btnRow.appendChild(btn);

  wrap.appendChild(btnRow);

  // 版本号放在按钮下方：左边远端、右边本地
  const mini = document.createElement('span');
  mini.className = 'nt-ver-mini';

  const remote = document.createElement('span');
  remote.textContent = '远端：检查中…';
  const local = document.createElement('span');
  local.textContent = '本地：' + APP_VER;

  mini.appendChild(remote);
  mini.appendChild(local);
  wrap.appendChild(mini);

  let busy = false;

  async function refresh(force) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    btn.textContent = '检查中';
    remote.textContent = '远端：检查中…';

    try {
      const r = await checkUpdate({ base: appBase() });

      if (r.reason === 'no-version') {
        // 说清为什么读不到，别只丢一句「失败」
        remote.textContent = '远端：读不到版本号（sw.js 取不到）';
        return;
      }

      remote.textContent = '远端：' + r.remote;

      // 自动检查**只显示**，只有用户主动点按钮（force）才真更新。
      // 自动更新会触发刷新（→ 回密码页）；缓存没清干净时还会反复触发，形成循环。
      if (r.update) {
        if (force) {
          remote.textContent = '远端：' + r.remote + '（正在更新）';
          busy = false;
          btn.disabled = false;
          await applyUpdate(r.remote);
          return;
        }
        remote.textContent = '远端：' + r.remote + '（点按钮更新）';
        btn.classList.add('has-update');
      } else {
        btn.classList.remove('has-update');
      }
    } catch (e) {
      remote.textContent = '远端：检查失败（' + ((e && e.message) || e) + '）';
    } finally {
      busy = false;
      btn.disabled = false;
      // 不要无条件恢复成 old：有新版时按钮要一直显示「更新到 x」
      if (!btn.classList.contains('has-update')) btn.textContent = '更新';
    }
  }

  btn.addEventListener('click', () => refresh(true));

  // 进页面就查：说明页一打开就能看到远端版本
  setTimeout(() => refresh(false), 0);

  return wrap;
}

/**
 * 应用根路径（用来拼 sw.js 的地址）。
 * 用 URL 解析而不是正则切字符串：`/nt/` 与 `/nt/index.html` 都能得到 `/nt/`。
 */
export function appBase() {
  try {
    return new URL('./', location.href).pathname;
  } catch (e) {
    return '/';
  }
}

/** 当前页面地址（去掉查询串与 hash） */
export function currentUrl() {
  try {
    return location.origin + location.pathname;
  } catch (e) {
    return '';
  }
}
