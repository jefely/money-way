// 界面：（无界面）其它窗口保存通知
/**
 * 另一个标签保存之后，这一页页脚提一句。
 * 真正挡住覆盖的是 IndexedDB 里的比较写入；这里只是让人知道该刷新。
 * BroadcastChannel 在安卓 Chrome 和较新的 iPhone 上都有。没有就静默跳过。
 */

export function watchOtherTabs(setFooter) {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    const ch = new BroadcastChannel('nt-vault');
    ch.onmessage = (ev) => {
      if (!ev.data || ev.data.type !== 'saved') return;
      if (typeof setFooter === 'function') {
        setFooter('另一个窗口刚保存过。继续改之前请先刷新，以免互相覆盖。');
      }
    };
    return ch;
  } catch (e) {
    return null;
  }
}

export function tellOtherTabs() {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel('nt-vault');
    ch.postMessage({ type: 'saved', at: Date.now() });
    ch.close();
  } catch (e) { /* 没有这个 API 就算了 */ }
}
