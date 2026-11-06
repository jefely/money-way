// 界面：全局撤销 / 重做的动作与快捷键
/**
 * 撤销 / 重做这件事的**全部逻辑**都在这里（2026-11 移出 app.js，
 * 那台文件有 300 行有效代码上限）。
 *
 * app 只需要提供四样东西：
 *   undo     —— core/undo-stack.js 的实例
 *   getState —— 读当前 state
 *   apply    —— 把新 state 装进去（连带 index / 版本号 / 重画 / 存盘）
 *   footer   —— 页脚提示
 *
 * 快捷键：Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 重做；焦点在输入框里时不抢。
 */

export function createHistory({ undo, getState, apply, footer }) {
  function run(kind) {
    const next = kind === 'undo' ? undo.pop(getState()) : undo.redo(getState());
    if (!next) {
      if (footer) footer(kind === 'undo' ? '没有可撤销的操作' : '没有可重做的操作');
      return;
    }
    apply(next);
    undo.unlock();
    if (footer) footer(kind === 'undo' ? '已撤销上一步' : '已重做');
  }

  return {
    undo: () => run('undo'),
    redo: () => run('redo'),
  };
}

/** 把工具条上的两个按钮和快捷键一起接上 */
export function bindUndoUI(hist) {
  for (const [sel, fn] of [['[data-act="undo"]', hist.undo], ['[data-act="redo"]', hist.redo]]) {
    const b = document.querySelector(sel);
    if (b) b.addEventListener('click', fn);
  }

  window.addEventListener('keydown', (ev) => {
    const t = ev.target;
    const typing = t && (
      t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
      || t.tagName === 'SELECT' || t.isContentEditable
    );
    if (typing) return;
    if (!(ev.ctrlKey || ev.metaKey) || String(ev.key).toLowerCase() !== 'z') return;
    ev.preventDefault();
    if (ev.shiftKey) hist.redo();
    else hist.undo();
  });
}
