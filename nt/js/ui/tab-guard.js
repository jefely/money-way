// 界面：（无界面）其它窗口保存通知
/**
 * 另一个标签保存之后，这一页页脚提一句。
 * 真正挡住覆盖的是 IndexedDB 里的比较写入；这里只是让人知道该刷新。
 * BroadcastChannel 在安卓 Chrome 和较新的 iPhone 上都有。没有就静默跳过。
 */

/**
 * 本页编号。
 *
 * BroadcastChannel 只排除**发送消息的那个对象**，不排除同一个页面里的
 * 其它频道对象 —— tellOtherTabs 每次新建一个频道发送，本页的 onmessage
 * 照样会收到自己的消息。于是每保存一次，页脚就被
 * 「另一个窗口刚保存过」覆盖，连刚写的「已新增 1 条分期」都留不住
 * （2026-11 用户看到添加没反馈）。带上页号，自己发给自己的一律忽略。
 */
const TAB_ID = Math.random().toString(36).slice(2);

export function watchOtherTabs(setFooter) {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    const ch = new BroadcastChannel('nt-vault');
    ch.onmessage = (ev) => {
      if (!ev.data || ev.data.type !== 'saved') return;
      if (ev.data.tab === TAB_ID) return;   // 自己发的，不是「另一个窗口」
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
    ch.postMessage({ type: 'saved', tab: TAB_ID, at: Date.now() });
    ch.close();
  } catch (e) { /* 没有这个 API 就算了 */ }
}
