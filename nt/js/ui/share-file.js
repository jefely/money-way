// 界面：导出加密备份文件
/**
 * 把一份文本文件交给用户。
 * 层：第五层 · UI
 *
 * 顺序是为手机主屏幕准备的，安卓和 iPhone 都能走通：
 *   1. 系统分享（Web Share 带文件）。安卓 Chrome 主屏幕、iPhone 主屏幕都有分享单。
 *   2. 文件选择器保存（showSaveFilePicker）。只有部分安卓 / 桌面 Chrome 有，iPhone 没有，没有就跳过。
 *   3. 普通下载。安卓通常能落到下载目录；iPhone 主屏幕里经常只是预览，所以放在最后。
 */

import { downloadText } from './file-io.js';

/**
 * @param {string} filename
 * @param {string} text
 * @param {string} [mime]
 * @returns {Promise<'shared'|'saved'|'downloaded'|'cancelled'>}
 */
export async function deliverTextFile(filename, text, mime) {
  const type = mime || 'text/plain';
  const dot = String(filename || '').lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot) : '.txt';
  const file = new File([text], filename, { type });

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const payload = { files: [file], title: filename };
    let can = true;
    if (typeof navigator.canShare === 'function') {
      try { can = navigator.canShare(payload); } catch (e) { can = false; }
    }
    if (can) {
      try {
        await navigator.share(payload);
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
  }

  const picker = typeof window !== 'undefined' ? window.showSaveFilePicker : null;
  if (typeof picker === 'function') {
    try {
      const handle = await picker.call(window, {
        suggestedName: filename,
        types: [{ description: 'NT 加密备份', accept: { [type]: [ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([text], { type }));
      await writable.close();
      return 'saved';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }

  downloadText(filename, text, type);
  return 'downloaded';
}
