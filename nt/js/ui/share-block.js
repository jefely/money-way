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
import { checkUpdate, hardReload, resetApp } from './update-check.js';

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

  // 唯一按钮 = 更新。它的做法是「让 Service Worker 换班」：
  // 等新版 SW install 完成（那时全部资源已预缓存）+ SKIP_WAITING + 刷新。
  // **不清缓存、不注销 SW** —— 那两件事会拆掉离线能力，断网就变成「打不开网页」。
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nt-ver-btn ghost';
  btn.textContent = '更新';
  btn.title = '检查并切换到新版本（离线也能用）';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '更新中';
    await hardReload();
  });
  btnRow.appendChild(btn);
  wrap.appendChild(btnRow);

  // 版本号放在按钮下方：左远端、右本地
  const mini = document.createElement('span');
  mini.className = 'nt-ver-mini';

  const remote = document.createElement('span');
  remote.textContent = '远端：检查中…';
  const local = document.createElement('span');
  local.textContent = '本地：' + APP_VER;

  // 救砖入口：连点 5 次版本号才出现（清缓存 + 注销 SW，会拆掉离线能力，
  // 只在真的打不开的时候用）
  let taps = 0;
  let tapTimer = 0;
  local.style.cursor = 'pointer';
  local.addEventListener('click', () => {
    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 1200);
    if (taps >= 5) {
      taps = 0;
      if (confirm('彻底重置？会清掉离线缓存，之后必须联网才能重新装回来。')) {
        resetApp();
      }
    }
  });

  mini.appendChild(remote);
  mini.appendChild(local);
  wrap.appendChild(mini);

  let busy = false;

  async function refresh() {
    if (busy) return;
    busy = true;
    remote.textContent = '远端：检查中…';

    try {
      const r = await checkUpdate({ base: appBase() });

      if (r.reason === 'no-version') {
        remote.textContent = '远端：读不到版本号';
        return;
      }

      if (r.update) {
        remote.textContent = '远端：' + r.remote + '（点重载）';
        btn.classList.add('has-update');
      } else {
        remote.textContent = '远端：' + r.remote;
        btn.classList.remove('has-update');
      }
    } catch (e) {
      remote.textContent = '远端：检查失败';
    } finally {
      busy = false;
    }
  }

  // 进页面自动查一次，只显示版本，不做任何跳转
  setTimeout(refresh, 0);

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
