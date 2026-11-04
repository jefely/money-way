// 界面：全局撤销快捷键
/**
 * Ctrl/Cmd+Z 撤回上一次账本改动。焦点在输入框里时不抢，交给浏览器。
 * 层：第五层 · UI
 */

export function installUndoKeys(h) {
  window.addEventListener('keydown', (ev) => {
    const t = ev.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing) return;
    if (!(ev.ctrlKey || ev.metaKey) || ev.key !== 'z' || ev.shiftKey) return;
    ev.preventDefault();
    if (h && typeof h.onUndo === 'function') h.onUndo();
  });
}
