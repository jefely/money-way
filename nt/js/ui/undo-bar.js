// 界面：删除后的撤销条
/**
 * 撤销条
 * 层：第五层 · UI
 *
 * 框选一次能删掉整片行，误删的代价太大。删除后给 8 秒撤销，
 * 而不是先弹「确定删 N 条？」—— 对批量删除来说，那个确认框反而更烦，
 * 而且它只防住点错、防不住「删完才想起来删错了」。
 *
 * 只负责画条与计时；恢复动作由调用方通过 onUndo 传进来
 * （每张表恢复的方式不一样：流水是 transactions、固定/分期是 scheduled）。
 */

const UNDO_MS = 8000;

let el = null;
let timer = 0;
let undoFn = null;

/** 建（一次）并返回撤销条 */
function ensure() {
  if (el) return el;

  el = document.createElement('div');
  el.id = 'nt-undo';
  el.className = 'nt-undo';
  el.hidden = true;

  const text = document.createElement('span');
  text.className = 'nt-undo-text';
  el.appendChild(text);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nt-btn nt-btn-sm';
  btn.textContent = '撤销';
  btn.addEventListener('click', () => {
    const fn = undoFn;      // 先取出来：hideUndo 会把它清掉
    hideUndo();
    if (fn) fn();
  });
  el.appendChild(btn);

  document.body.appendChild(el);
  return el;
}

/**
 * 显示撤销条。
 * @param {string} text 例如「已删除 3 笔流水」
 * @param {()=>void} onUndo
 */
export function showUndo(text, onUndo) {
  const box = ensure();
  box.querySelector('.nt-undo-text').textContent = text;
  box.hidden = false;
  undoFn = onUndo || null;
  clearTimeout(timer);
  timer = setTimeout(hideUndo, UNDO_MS);
}

export function hideUndo() {
  clearTimeout(timer);
  timer = 0;
  undoFn = null;
  if (el) el.hidden = true;
}
