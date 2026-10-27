// 界面：二维码分享区块
/**
 * 二维码分享区块（说明页顶部）
 * 层：第五层 · UI
 *
 * 照单文件版的布局：左边二维码、右边说明文字，
 * 右侧最后一行是版本信息（当前 / 远端）+「更新」按钮 —— 不再单独占一张卡片。
 *
 * 二维码内容只是当前账本地址，不含任何账目。
 */

import { paintText } from './qr-canvas.js';
import { APP_VER } from '../core/version.js';
import { SHARE_URL } from '../core/meta.js';
import { checkUpdate, applyUpdate } from './update-check.js';

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

  // 版本行：按钮 + 两行小字，塞在右侧，不另占高度
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

/** 「更新」按钮 + 当前/远端两行小字 */
function versionLine() {
  const wrap = document.createElement('div');
  wrap.className = 'nt-ver-line';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nt-ver-btn';
  btn.textContent = '更新';
  wrap.appendChild(btn);

  const mini = document.createElement('span');
  mini.className = 'nt-ver-mini';

  const cur = document.createElement('span');
  cur.textContent = '当前：' + APP_VER;
  const remote = document.createElement('span');
  remote.textContent = '远端：未检查';

  mini.appendChild(cur);
  mini.appendChild(remote);
  wrap.appendChild(mini);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = '检查中';
    try {
      const r = await checkUpdate({ base: location.pathname.replace(/[^/]*$/, '') });
      remote.textContent = '远端：' + (r.remote || '读取失败');
      if (r.update) {
        remote.textContent = '远端：' + r.remote + '（正在更新）';
        await applyUpdate(r.remote);
      } else if (r.reason === 'up-to-date') {
        remote.textContent = '远端：' + r.remote + '（已最新）';
      }
    } catch (e) {
      remote.textContent = '远端：检查失败';
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  });

  return wrap;
}

/** 当前页面地址（去掉查询串与 hash） */
export function currentUrl() {
  try {
    return location.origin + location.pathname;
  } catch (e) {
    return '';
  }
}
