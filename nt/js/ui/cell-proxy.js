// 界面：选中态的隐藏键盘输入框
/**
 * 隐藏键盘输入
 * 层：第五层 · UI
 *
 * 为什么不在可见的 cell input 上直接 focus：
 *   选中态如果 input 持焦点，浏览器一定会画光标；`caret-color: transparent`
 *   在部分安卓 WebView 里不生效，用户看到的就是「单击就进了编辑」。
 *   把焦点放到一个 1px 的隐藏 input：可见 input 从不 focus，
 *   光标和系统「粘贴/全选/翻译」菜单都不会出现；键盘输入通过 input 事件
 *   镜像回可见格。双击进编辑后才把焦点交回可见 input。
 */

export function createCellProxy(onInput, onKey) {
  const el = document.createElement('input');
  el.className = 'nt-cell-proxy';
  el.type = 'text';
  el.autocomplete = 'off';
  el.spellcheck = false;
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  document.body.appendChild(el);

  el.addEventListener('input', () => onInput(el.value));
  el.addEventListener('keydown', onKey);

  return {
    el,
    /** 把焦点和键盘交给隐藏格；不复制值、不 select() —— 避免安卓画出全选框 */
    focus(input) {
      el.value = '';
      el.setAttribute('inputmode', input.getAttribute('inputmode') || 'text');
      el.setAttribute('enterkeyhint', 'next');
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    },
    blur() {
      if (document.activeElement === el) el.blur();
    },
    /** 行编辑器把值改了（例如点候选账户）时同步隐藏格 */
    setValue(v) {
      el.value = v;
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* 忽略 */ }
    },
    isFocused() { return document.activeElement === el; },
  };
}
